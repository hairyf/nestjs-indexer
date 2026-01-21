import type { IndexerConfig, IndexerValue } from './types'

export function createIndexer<T extends IndexerValue = IndexerValue>(
  config: IndexerConfig<T>,
): IndexerConfig<T> {
  return config
}
