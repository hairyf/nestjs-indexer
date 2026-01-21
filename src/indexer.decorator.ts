import { IndexerOptions } from '@/interfaces'

export const INDEXER_NAME_KEY = Symbol('INDEXER_NAME')
export const INDEXER_CONFIG_KEY = Symbol('INDEXER_CONFIG')

export function Indexer(name: string, options?: IndexerOptions): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(INDEXER_NAME_KEY, name, target)
    Reflect.defineMetadata(INDEXER_CONFIG_KEY, options || {}, target)
  }
}
