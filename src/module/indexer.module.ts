import type { DynamicModule, Provider } from '@nestjs/common'
import type { Storage } from 'unstorage'
import type { IndexerConfig } from '../interfaces'
import { Module } from '@nestjs/common'
import { createStorage } from 'unstorage'
import { INDEXER_TOKEN_PREFIX } from '../constants'
import { Indexer } from '../service/indexer.service'

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
        step: config.step,
        concurrency: config.concurrency,
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
