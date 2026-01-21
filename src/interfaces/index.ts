import type { Storage } from 'unstorage'

export type IndexerValue = string | number

export type LastEndChecker<T extends IndexerValue> = (current: T) => boolean

export interface IndexerConfig<T extends IndexerValue = IndexerValue> {
  name: string
  initial?: T | (() => T)
  lastend?: LastEndChecker<T>
  step?: (current: T) => T
  concurrency?: number
  storage?: Storage
}

export interface IndexerOptions<T extends IndexerValue = IndexerValue> {
  name: string
  initial: T | (() => T)
  lastend?: LastEndChecker<T>
  step?: (current: T) => T
  concurrency?: number
  storage?: Storage
}
