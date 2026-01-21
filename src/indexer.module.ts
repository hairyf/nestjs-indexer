import type { DynamicModule, Provider, Type } from '@nestjs/common'
import type { Storage } from 'unstorage'
import { Module } from '@nestjs/common'
import { createStorage } from 'unstorage'
import { INDEXER_CONFIG_KEY } from './indexer.decorator'

export interface IndexerModuleOptions {
  storage?: Storage
  indexers: Type<any>[]
}

@Module({})
export class IndexerModule {
  static forRoot(options: IndexerModuleOptions): DynamicModule {
    const { storage, indexers } = options

    // 使用提供的 storage 或创建默认的 memory storage
    const defaultStorage = storage || createStorage()

    // 为每个索引器创建 provider
    const providers: Provider[] = indexers.map((Indexer) => {
      // 从装饰器元数据读取配置
      const config = Reflect.getMetadata(INDEXER_CONFIG_KEY, Indexer) || {}
      Object.assign(config, { storage: config.storage || defaultStorage })
      return { provide: Indexer, useValue: new Indexer() }
    })

    return {
      module: IndexerModule,
      providers,
      exports: providers,
      global: true,
    }
  }
}
