import type { Storage } from 'unstorage'
import { RedisAdapter } from 'redlock-universal'

export type IndexerValue = string | number

export type LastEndChecker<T extends IndexerValue> = (current: T) => boolean

export type StepFunction<T extends IndexerValue> = (current: T) => T | Promise<T>

export interface IndexerConfig<T extends IndexerValue = IndexerValue> {
  name: string
  initial?: T | (() => T)
  lastend?: LastEndChecker<T>
  step?: StepFunction<T>
  concurrency?: number
  storage?: Storage
  redis?: RedisAdapter

  // 以下配置仅在设置了 concurrency 时生效
  /** 任务最长执行时间 (秒)，超过此时间会被视为僵尸任务 */
  runningTimeout?: number
  /** 失败任务在队列中的保留时间 (秒) */
  retryTimeout?: number
  /** 并发 Key 的自动过期时间 (秒)，应略大于 runningTimeout */
  concurrencyTimeout?: number
}

export interface IndexerOptions<T extends IndexerValue = IndexerValue> {
  name: string
  initial: T | (() => T)
  lastend?: LastEndChecker<T>
  step?: StepFunction<T>
  concurrency?: number
  storage?: Storage
  redis?: RedisAdapter
  runningTimeout?: number
  retryTimeout?: number
  concurrencyTimeout?: number
}

export type { RedisAdapter }
