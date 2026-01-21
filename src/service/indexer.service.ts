import type { Storage } from 'unstorage'
import type { IndexerOptions, IndexerValue, StepFunction } from '../interfaces'
import Redis from 'ioredis'
import { createLock, IoredisAdapter, RedisAdapter } from 'redlock-universal'

export class Indexer<T extends IndexerValue = IndexerValue> {
  public readonly name: string
  public readonly concurrency?: number
  private readonly storageKey: string
  private readonly storage: Storage
  private readonly initialValue: T | (() => T)
  private readonly lastend?: (current: T) => boolean
  readonly #step?: StepFunction<T>
  private readonly redisAdapter?: RedisAdapter
  private readonly currentLock?: ReturnType<typeof createLock>
  private readonly blockTasksKey: string
  private readonly activeTaskCountKey: string

  constructor(options: IndexerOptions<T>) {
    this.name = options.name
    this.concurrency = options.concurrency
    this.storageKey = `indexer:${options.name}`
    this.storage = options.store!
    this.initialValue = options.initial
    this.lastend = options.lastend
    this.#step = options.step
    this.redisAdapter = options.redis
    this.blockTasksKey = `indexer:${options.name}:block_tasks`
    this.activeTaskCountKey = `indexer:${options.name}:active_task_count`

    // 如果提供了 Redis，创建锁实例
    if (this.redisAdapter) {
      this.currentLock = createLock({
        adapter: this.redisAdapter,
        key: `indexer:${options.name}:current`,
        ttl: 5000,
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
      ? (this.initialValue as () => T)()
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
   * 检查是否已达到并发限制（锁定状态）
   */
  async locked(): Promise<boolean> {
    if (!this.redis || !this.concurrency)
      return false

    const count = await this.redis.get(this.activeTaskCountKey)
    const activeCount = count ? Number.parseInt(count, 10) : 0
    return activeCount >= this.concurrency
  }

  /**
   * 原子性获取 start 和 end 值，并预占 current
   * 内部使用 redis 锁确保原子性
   */
  async atomic(): Promise<[T, T] | null> {
    if (!this.currentLock || !this.#step)
      return null

    let start: T | undefined
    let ended: T | undefined

    try {
      await this.currentLock.using(async () => {
        if (await this.latest())
          return

        start = await this.current()
        // 支持同步和异步 step 函数
        const ended = await this.step(start)

        // 立即预占这个 step，更新 current 值
        // 这样下一个实例就能获取到下一个不同的 start 值，实现真正的并发
        await this.next(ended)
      })
    }
    catch {
      // 如果获取锁失败，返回 null
      return null
    }

    if (start === undefined || ended === undefined)
      return null

    return [start, ended]
  }

  /**
   * 标记任务成功，从失败任务列表中移除
   */
  async success(start: T): Promise<void> {
    if (!this.redis)
      return

    await this.redis.srem(this.blockTasksKey, String(start))
  }

  /**
   * 标记任务失败，添加到失败任务列表
   */
  async fail(start: T): Promise<void> {
    if (!this.redis)
      return

    await this.redis.sadd(this.blockTasksKey, String(start))
  }

  /**
   * 获取第一个失败任务
   */
  async shiftFailTask(): Promise<T | null> {
    if (!this.redis)
      return null
    const members = await this.redis.smembers(this.blockTasksKey)
    if (members.length === 0)
      return null
    const m = members[0]
    const num = Number.parseInt(m, 10)
    return (Number.isNaN(num) ? m : num) as T
  }

  /**
   * 增加活跃任务计数
   */
  private async incrementActiveTaskCount(): Promise<void> {
    if (!this.redis)
      return

    await this.redis.incr(this.activeTaskCountKey)
  }

  /**
   * 减少活跃任务计数
   */
  private async decrementActiveTaskCount(): Promise<void> {
    if (!this.redis)
      return

    const count = await this.redis.decr(this.activeTaskCountKey)
    // 如果计数小于 0，重置为 0
    if (count < 0)
      await this.redis.set(this.activeTaskCountKey, '0')
  }

  /**
   * 使用原子性操作执行任务
   * 自动处理锁、并发控制、失败重试等
   */
  async using(callback: (start: T, ended: T) => Promise<void>): Promise<void> {
    if (!this.redis || !this.currentLock || !this.#step)
      throw new Error('Indexer requires redis and step function to use "using" method')

    // 检查并发限制
    if (await this.locked())
      return

    // 优先处理失败任务
    const firstFailTask = await this.shiftFailTask()
    if (firstFailTask !== null) {
      await this.executeFailedTask(firstFailTask, callback)
      return
    }

    // 检查是否已到达最新指标
    if (await this.latest())
      return

    // 原子性获取 start 和 end
    const atomicResult = await this.atomic()
    if (!atomicResult)
      return

    const [start, ended] = atomicResult

    // 执行正常任务（已预占 current，ended 从 atomic 获取）
    await this.executeNormalTask(start, ended, callback)
  }

  /**
   * 执行任务（内部方法，统一处理正常任务和失败重试任务）
   * @param start 起始值
   * @param ended 结束值
   * @param callback 任务回调
   */
  private async executeTask(
    start: T,
    ended: T,
    callback: (start: T, ended: T) => Promise<void>,
  ): Promise<void> {
    if (!this.redis)
      return

    const stepLock = createLock({
      key: `indexer:${this.name}:step:${start}`,
      adapter: new IoredisAdapter(this.redis),
      ttl: 10000,
    })

    // 增加活跃任务计数
    await this.incrementActiveTaskCount()

    try {
      // 使用 Redlock 锁定每个 step，确保同一个 step 只有一个实例在执行
      try {
        await stepLock.using(async () => {
          try {
            // 执行任务
            await callback(start, ended)

            // 任务成功，从失败任务列表中移除
            await this.success(start)
          }
          catch (error) {
            // 任务失败，记录到失败任务列表
            await this.fail(start)
            throw error
          }
        })
      }
      catch {
        // 如果获取 step 锁失败，说明已经有其他实例在处理这个 step
        // 静默跳过，不需要任何操作
      }
    }
    finally {
      // 减少活跃任务计数
      await this.decrementActiveTaskCount()
    }
  }

  /**
   * 执行正常任务（从 atomic 获取 start 和 ended）
   * @param start 起始值
   * @param ended 结束值（从 atomic 获取）
   * @param callback 任务回调
   */
  private async executeNormalTask(
    start: T,
    ended: T,
    callback: (start: T, ended: T) => Promise<void>,
  ): Promise<void> {
    await this.executeTask(start, ended, callback)
  }

  /**
   * 执行失败重试任务（通过 step 函数计算 ended）
   * @param start 起始值
   * @param callback 任务回调
   */
  private async executeFailedTask(
    start: T,
    callback: (start: T, ended: T) => Promise<void>,
  ): Promise<void> {
    if (!this.#step)
      return

    // 通过 step 函数计算 ended，支持异步
    const ended = await this.step(start)

    await this.executeTask(start, ended, callback)
  }
}
