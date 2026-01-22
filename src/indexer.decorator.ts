import { IndexerOptions } from '@/interfaces'
import { INDEXER_CONFIG_KEY, INDEXER_NAME_KEY } from './constants'

export function Indexer(name: string, options?: IndexerOptions): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(INDEXER_NAME_KEY, name, target)
    Reflect.defineMetadata(INDEXER_CONFIG_KEY, options || {}, target)
  }
}
