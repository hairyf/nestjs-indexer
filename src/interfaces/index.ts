import type { Storage } from 'unstorage'
import { RedisAdapter } from 'redlock-universal'

export interface IndexerOptions {
  redis?: RedisAdapter
  concurrency?: number
  initial?: any
  storage?: Storage
  // 以下配置仅在设置了 concurrency 时生效
  /** 任务最长执行时间 (秒)，超过此时间会被视为僵尸任务 */
  runningTimeout?: number
  /** 失败任务在队列中的保留时间 (秒) */
  retryTimeout?: number
  /** 并发 Key 的自动过期时间 (秒)，应略大于 runningTimeout */
  concurrencyTimeout?: number
}
