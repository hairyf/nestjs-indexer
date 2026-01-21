import type { DynamicModule, Provider } from '@nestjs/common'
import type { Storage } from 'unstorage'
import type { IndexerConfig } from './types'
import { Module } from '@nestjs/common'
import { createStorage } from 'unstorage'
import { Indexer } from './indexer.class'
import { INDEXER_TOKEN_PREFIX } from './inject-indexer.decorator'

export interface IndexerModuleOptions {
  storage?: Storage
  indexers: IndexerConfig<any>[]
}

@Module({})
export class IndexerModule {
  static forRoot(options: IndexerModuleOptions): DynamicModule {
    const { storage, indexers } = options

    // 使用提供的 storage 或创建默认的 memory storage
    const defaultStorage = storage || createStorage()

    // 为每个索引器创建 provider
    const providers: Provider[] = indexers.map((config) => {
      const indexerStorage = config.storage || defaultStorage
      const indexer = new Indexer({
        name: config.name,
        initial: config.initial,
        lastend: config.lastend,
        storage: indexerStorage,
      })

      return {
        provide: `${INDEXER_TOKEN_PREFIX}${config.name}`,
        useValue: indexer,
      }
    })

    return {
      module: IndexerModule,
      providers,
      exports: providers,
      global: true,
    }
  }
}
