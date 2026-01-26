import type { Storage } from 'unstorage'
import type { IndexerOptions } from './interfaces'
import { Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { createLock, Lock, RedisAdapter } from 'redlock-universal'
import { INDEXER_CONFIG_KEY, INDEXER_NAME_KEY } from './constants'

export abstract class IndexerFactory<T> {
  public readonly name: string
  public readonly concurrency?: number
  private readonly storageKey: string
  private readonly storage: Storage
  private readonly runningTimeout?: number
  private readonly retryTimeout?: number
  private readonly concurrencyTimeout?: number
  private readonly redisAdapter?: RedisAdapter
  private readonly currentLock?: Lock
  private indicator: T | undefined
  private readonly logger: Logger

  constructor() {
    const name = Reflect.getMetadata(INDEXER_NAME_KEY, this.constructor)
    const config: IndexerOptions = Reflect.getMetadata(INDEXER_CONFIG_KEY, this.constructor) || {}

    if (!name)
      throw new Error('IndexerFactory must be decorated with @Indexer(name, config) or provide options in constructor')

    this.name = name
    this.concurrency = config.concurrency
    this.storageKey = `indexer:${name}`
    this.storage = config.storage!
    this.runningTimeout = config.runningTimeout ?? 60
    this.retryTimeout = config.retryTimeout ?? 60
    this.concurrencyTimeout = config.concurrencyTimeout ?? (this.runningTimeout ? this.runningTimeout * 2 : 120)
    this.redisAdapter = config.redis
    this.indicator = config.initial
    this.logger = new Logger(`IndexerFactory[${name}]`)

    // 如果提供了 Redis，创建锁实例
    if (this.redisAdapter) {
      this.currentLock = createLock({
        adapter: this.redisAdapter,
        key: `indexer:${this.name}:current`,
        ttl: 1000,
      })
    }
  }

  get redis(): Redis | undefined {
    return (this.redisAdapter as any)?.getClient()
  }

  /**
   * 计算下一个索引值
   * 子类必须覆盖此方法
   */
  async step(current?: T): Promise<T> {
    return await this.onHandleStep(current ?? (await this.current()))
  }

  /**
   * 计算下一个索引值
   * 子类必须覆盖此方法
   */
  abstract onHandleStep(current: T): Promise<T> | T

  /**
   * 检查是否已到达最新指标（结束标记）
   * 子类可以覆盖此方法
   */
  async onHandleLatest(_current: T): Promise<boolean> {
    return false
  }

  /**
   * 获取初始值
   * 子类可以覆盖此方法
   */
  async onHandleInitial(): Promise<T> {
    return this.indicator as T
  }

  /**
   * 当触发回滚时调用
   * 子类可以覆盖此方法以实现自定义回滚逻辑（如删除脏数据）
   * @param _from 当前游标位置
   * @param _to 目标回滚位置
   */
  async onHandleRollback(_from: T, _to: T): Promise<void> {
    // 默认不进行任何操作，由业务层实现具体的删数逻辑
  }

  /**
   * 获取当前索引值
   */
  async current(): Promise<T> {
    const value = await this.storage.getItem<T>(this.storageKey)
    if (value !== null && value !== undefined)
      return value

    // 如果没有值，返回初始值
    return await this.initial()
  }

  /**
   * 获取初始值（内部使用）
   */
  async initial(): Promise<T> {
    const value = await this.storage.getItem<T>(this.storageKey)
    if (value !== null && value !== undefined)
      return value
    return await this.onHandleInitial()
  }

  /**
   * 设置下一个索引值
   * @param value 可选，如果提供则使用该值，否则使用 step 函数自动计算
   */
  async next(value?: T): Promise<void> {
    if (value !== undefined) {
      await this.storage.setItem(this.storageKey, value)
      return
    }

    // 如果没有提供值，尝试使用 step 函数
    const nextValue = await this.step() as any
    await this.storage.setItem(this.storageKey, nextValue)
  }

  /**
   * 检查是否已到达最新指标（结束标记）
   */
  async latest(): Promise<boolean> {
    if (!this.onHandleLatest)
      return false

    const current = await this.current()
    if (current === null)
      return false

    return this.onHandleLatest(current)
  }

  /**
   * 获取当前 epoch 版本号
   */
  private async epoch(): Promise<number> {
    if (!this.redis)
      return 0
    const epoch = await this.redis.get(`indexer:${this.name}:epoch`)
    return epoch ? Number.parseInt(epoch, 10) : 0
  }

  /**
   * 递增 epoch 版本号
   */
  private async incrementEpoch(): Promise<number> {
    if (!this.redis)
      return 0
    return this.redis.incr(`indexer:${this.name}:epoch`)
  }

  /**
   * 验证 epoch 是否匹配当前版本号
   * 方便用户在 Worker 逻辑开始前进行简单的 if 判断
   * @param epoch 要验证的 epoch 版本号
   * @returns 如果 epoch 匹配返回 true，否则返回 false
   */
  async validate(epoch: number): Promise<boolean> {
    const currentEpoch = await this.epoch()
    return currentEpoch === epoch
  }

  /**
   * 原子性获取 start 和 end 值，并预占 current
   * 内部使用 redis 锁确保原子性
   * @returns [start, ended, epoch] 三元组
   */
  async atomic(): Promise<[T, T, number]> {
    if (!this.currentLock)
      throw new Error('Failed to get current lock')

    let start: T | undefined
    let ended: T | undefined
    let epoch: number | undefined

    await this.currentLock.using(async () => {
      start = await this.current()
      if (await this.latest())
        throw new Error(`Indexer "${this.name}" reached latest: ${start}`)
      // 支持同步和异步 step 函数
      ended = await this.step(start)
      // 立即预占，这样下一个实例就能获取到下一个不同的 start 值，实现真正的并发
      await this.next(ended)
      // 获取当前 epoch
      epoch = await this.epoch()
    })

    if (start === undefined || ended === undefined || epoch === undefined)
      throw new Error('Failed to get start, ended and epoch')

    return [start, ended, epoch]
  }

  /**
   * 登记占用一个并发名额
   */
  private async occupy(start: T): Promise<void> {
    if (!this.redis)
      return
    const key = `indexer:${this.name}:concurrency`
    const startStr = JSON.stringify(start)
    await this.redis
      .pipeline()
      .rpush(key, startStr)
      // 影子 Key 的过期时间代表任务的"最长处理时间"
      .set(`${key}:shadow:${startStr}`, '1', 'EX', String(this.runningTimeout))
      .expire(key, String(this.concurrencyTimeout))
      .exec()
  }

  /**
   * 释放并发名额
   */
  private async release(start: T): Promise<void> {
    if (!this.redis)
      return
    const key = `indexer:${this.name}:concurrency`
    const startStr = JSON.stringify(start)
    await this.redis
      .pipeline()
      .lrem(key, 1, startStr)
      .del(`${key}:shadow:${startStr}`)
      .exec()
  }

  /**
   * 清理僵尸任务：检查正在执行的队列，如果任务已超时（影子 Key 消失），则移入失败队列重试
   */
  async cleanup(): Promise<void> {
    if (!this.redis)
      return
    const concurrencyKey = `indexer:${this.name}:concurrency`

    // 获取当前所有正在运行的任务（已经是序列化后的字符串）
    const runningTasks = await this.redis.lrange(concurrencyKey, 0, -1)

    for (const startStr of runningTasks) {
      const exists = await this.redis.exists(`${concurrencyKey}:shadow:${startStr}`)
      if (exists)
        continue
      this.logger.warn(`Found zombie task: ${startStr}. Moving to failed queue.`)
      await this.redis.pipeline()
        // 从运行队列移除
        .lrem(concurrencyKey, 5, startStr)
        // 塞入失败队列，等待下一次 consume 重新认领
        .rpush(`indexer:${this.name}:failed`, startStr)
        .exec()
    }
  }

  /**
   * 标记任务失败，添加到失败任务列表
   */
  async fail(start: T): Promise<void> {
    if (!this.redis)
      return
    await this.redis
      .pipeline()
      .rpush(
        `indexer:${this.name}:failed`,
        JSON.stringify(start),
      )
      .expire(`indexer:${this.name}:failed`, String(this.retryTimeout))
      .exec()
  }

  /**
   * 获取失败任务
   */
  async failed(): Promise<T | null> {
    if (!this.redis)
      return null
    const failed = await this.redis.lpop(`indexer:${this.name}:failed`)
    if (failed)
      return JSON.parse(failed)
    return null
  }

  /**
   * 清理 Redis 中的运行中任务状态
   * 包括并发队列、影子 Key 和失败队列
   */
  private async clearRunningTasks(): Promise<void> {
    if (!this.redis)
      return

    const concurrencyKey = `indexer:${this.name}:concurrency`
    const failedKey = `indexer:${this.name}:failed`

    // 获取所有正在运行的任务
    const runningTasks = await this.redis.lrange(concurrencyKey, 0, -1)

    // 构建管道操作
    const pipeline = this.redis.pipeline()

    // 删除并发队列
    if (runningTasks.length > 0)
      pipeline.del(concurrencyKey)

    // 删除所有影子 Key
    for (const startStr of runningTasks) {
      pipeline.del(`${concurrencyKey}:shadow:${startStr}`)
    }

    // 删除失败队列
    pipeline.del(failedKey)

    await pipeline.exec()
  }

  /**
   * 使用原子性操作执行任务
   * 自动获取锁、并发控制、失败重试、原子指标移动
   */
  async consume(
    callback: (start: T, ended: T, epoch: number) => Promise<void>,
    options: { retry?: boolean } = {},
  ): Promise<void> {
    const { retry = true } = options
    if (!this.redis || !this.currentLock)
      throw new Error('Indexer requires redis to use "consume" method')

    // 1. 并发检查 (只有设置了 concurrency 时生效)
    if (this.concurrency) {
      const currentCount = await this.redis.llen(`indexer:${this.name}:concurrency`)
      if (currentCount >= this.concurrency)
        return
    }

    const failed = await this.failed()
    let start: T
    let ended: T
    let epoch: number

    if (failed) {
      start = failed
      ended = await this.step(failed)
      // 获取失败任务时的 epoch（简化处理，使用当前 epoch）
      epoch = await this.epoch()
    }
    else {
      if (await this.latest())
        return
      [start, ended, epoch] = await this.atomic()
    }

    await this.occupy(start)

    try {
      await callback(start, ended, epoch)
    }
    catch (error) {
      // 检查 epoch 是否匹配，如果不匹配说明发生了回滚，不需要重试
      if (!await this.validate(epoch)) {
        this.logger.warn(
          `[Indexer:${this.name}] Task [${JSON.stringify(start)}, ${JSON.stringify(ended)}] failed but epoch mismatch (task epoch: ${epoch}, current epoch: ${await this.epoch()}). Skipping retry due to rollback.`,
        )
        throw error
      }
      if (retry)
        await this.fail(start)
      throw error
    }
    finally {
      await this.release(start)
    }
  }

  /**
   * 回滚索引指针到指定位置
   * @param target 目标回滚位置
   */
  async rollback(target: T): Promise<void> {
    if (!this.currentLock)
      throw new Error('Indexer requires redis and lock to use "rollback" method')

    await this.currentLock.using(async () => {
      const current = await this.current()

      // 1. 调用业务回调
      await this.onHandleRollback(current, target)

      // 2. 更新持久化存储的指针
      await this.next(target)

      // 3. 清理 Redis 中的运行中任务状态
      await this.clearRunningTasks()

      // 4. 递增 epoch 版本号，通知其他实例发生了回滚
      await this.incrementEpoch()

      this.logger.log(`[Indexer:${this.name}] Rollback from ${current} to ${target}`)
    })
  }

  /**
   * 重置当前 Indexer 的所有 Redis 状态
   * 警告：这将清空并发计数、重试队列等，请确保没有其他实例正在运行
   */
  async reset(): Promise<void> {
    if (!this.redis)
      return

    const keys = [
      `indexer:${this.name}:current`, // 锁 Key
      `indexer:${this.name}:concurrency`, // 并发队列
      `indexer:${this.name}:failed`, // 失败重试队列
      `indexer:${this.name}:epoch`, // 版本号
    ]

    // 也可以连同 storage 里的 current 值一起清空
    await this.storage.removeItem(this.storageKey)

    // 批量删除 Redis Key
    await this.redis.del(...keys)
    this.logger.warn('State has been reset.')
  }
}
