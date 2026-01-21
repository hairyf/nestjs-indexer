import type { DynamicModule, Provider, Type } from '@nestjs/common'
import type { Storage } from 'unstorage'
import { Module } from '@nestjs/common'
import { createStorage } from 'unstorage'
import { INDEXER_CONFIG_KEY, INDEXER_NAME_KEY } from './indexer.decorator'

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
      const name = Reflect.getMetadata(INDEXER_NAME_KEY, Indexer)
      const config = Reflect.getMetadata(INDEXER_CONFIG_KEY, Indexer) || {}

      if (!name)
        throw new Error(`Indexer class ${Indexer.name} must be decorated with @Indexer(name, config)`)

      // 合并模块级 storage 和装饰器配置的 storage
      const finalStorage = config.storage ?? defaultStorage

      // 创建实例，传入合并后的配置
      const indexer = new Indexer({
        name,
        storage: finalStorage,
        concurrency: config.concurrency,
        redis: config.redis,
        runningTimeout: config.runningTimeout,
        retryTimeout: config.retryTimeout,
        concurrencyTimeout: config.concurrencyTimeout,
      })

      return { provide: Indexer, useValue: indexer }
    })

    return {
      module: IndexerModule,
      providers,
      exports: providers,
      global: true,
    }
  }
}
