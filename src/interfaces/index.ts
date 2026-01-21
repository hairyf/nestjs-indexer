import type { Storage } from 'unstorage'
import Redis from 'ioredis'
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
  store?: Storage
  redis?: Redis
}

export interface IndexerOptions<T extends IndexerValue = IndexerValue> {
  name: string
  initial: T | (() => T)
  lastend?: LastEndChecker<T>
  step?: StepFunction<T>
  concurrency?: number
  store?: Storage
  redis?: RedisAdapter
}

export type { RedisAdapter }
