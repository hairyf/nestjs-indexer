import type { Storage } from 'unstorage'
import type { IndexerOptions, IndexerValue } from '../interfaces'

export class Indexer<T extends IndexerValue = IndexerValue> {
  public readonly name: string
  private readonly storageKey: string
  private readonly storage: Storage
  private readonly initialValue: T | (() => T)
  private readonly lastend?: (current: T) => boolean
  readonly #step?: (current: T) => T

  constructor(options: IndexerOptions<T>) {
    this.name = options.name
    this.storageKey = `indexer:${options.name}`
    this.storage = options.storage!
    this.initialValue = options.initial
    this.lastend = options.lastend
    this.#step = options.step
  }

  async step(current?: T) {
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
}
