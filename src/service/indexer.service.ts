import type { Storage } from 'unstorage'
import type { IndexerOptions, IndexerValue, StepFunction } from '../interfaces'
import Redis from 'ioredis'
import { createLock, RedisAdapter } from 'redlock-universal'

export class Indexer<T extends IndexerValue = IndexerValue> {
  public readonly name: string
  public readonly concurrency?: number
  private readonly storageKey: string
  private readonly storage: Storage
  private readonly initialValue: T | (() => T | Promise<T>)
  private readonly lastend?: (current: T) => boolean
  readonly #step?: StepFunction<T>
  private readonly redisAdapter?: RedisAdapter
  private readonly currentLock?: ReturnType<typeof createLock>
  private readonly blockTasks: T[] = []

  constructor(options: IndexerOptions<T>) {
    this.name = options.name
    this.concurrency = options.concurrency
    this.storageKey = `indexer:${options.name}`
    this.storage = options.storage!
    this.initialValue = options.initial
    this.lastend = options.lastend
    this.#step = options.step
    this.redisAdapter = options.redis

    // 如果提供了 Redis，创建锁实例
    if (this.redisAdapter) {
      this.currentLock = createLock({
        adapter: this.redisAdapter,
        key: `indexer:${options.name}:current`,
        ttl: 1000,
      })
    }
  }

  get redis(): Redis | undefined {
    return (this.redisAdapter as any)?.getClient()
  }

  async step(current?: T): Promise<T> {
    if (!this.#step)
      throw new Error(`Indexer "${this.name}" requires a step function`)
    return this.#step(current ?? await this.current())
  }

  /**
   * 获取当前索引值
   */
  async current(): Promise<T> {
    const value = await this.storage.getItem<T>(this.storageKey)
    if (value !== null && value !== undefined)
      return value

    // 如果没有值，返回初始值
    const initial = typeof this.initialValue === 'function'
      ? await (this.initialValue as () => T | Promise<T>)()
      : this.initialValue
    return initial
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
    const nextValue = await this.step()
    await this.storage.setItem(this.storageKey, nextValue)
  }

  /**
   * 检查是否已到达最新指标（结束标记）
   */
  async latest(): Promise<boolean> {
    if (!this.lastend)
      return false

    const current = await this.current()
    if (current === null)
      return false

    return this.lastend(current)
  }

  /**
   * 原子性获取 start 和 end 值，并预占 current
   * 内部使用 redis 锁确保原子性
   */
  async atomic(): Promise<[T, T]> {
    if (!this.currentLock || !this.#step)
      throw new Error('Failed to get current lock or step function')

    let start: T | undefined
    let ended: T | undefined

    await this.currentLock.using(async () => {
      start = await this.current()
      // 支持同步和异步 step 函数
      ended = await this.step(start)
      // 立即预占，这样下一个实例就能获取到下一个不同的 start 值，实现真正的并发
      await this.next(ended)
    })

    if (start === undefined || ended === undefined)
      throw new Error('Failed to get start and ended')

    return [start, ended]
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
      .expire(`indexer:${this.name}:failed`, 60)
      .exec()
  }

  async failed(): Promise<T | null> {
    if (!this.redis)
      return null
    const failed = await this.redis.lpop(`indexer:${this.name}:failed`)
    if (failed)
      return JSON.parse(failed)
    return null
  }

  /**
   * 使用原子性操作执行任务
   * 自动获取锁、并发控制、失败重试、原子指标移动
   */
  async consume(
    callback: (start: T, ended: T) => Promise<void>,
  ): Promise<void> {
    if (!this.redis || !this.currentLock || !this.#step)
      throw new Error('Indexer requires redis and step function to use "using" method')

    const failed = await this.failed()
    let start: T
    let ended: T

    if (failed) {
      start = failed
      ended = await this.step(failed)
    }
    else {
      if (await this.latest())
        return
      [start, ended] = await this.atomic()
    }

    try {
      await callback(start, ended)
    }
    catch (error) {
      await this.fail(start)
      throw error
    }
  }
}
