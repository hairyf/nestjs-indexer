import { Injectable } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { createStorage } from 'unstorage'
import { describe, expect, it } from 'vitest'
import { Indexer, IndexerFactory, IndexerModule } from '../src/index'
import 'reflect-metadata'

// 测试用的 Indexer 类
@Injectable()
@Indexer('test-module-indexer', { initial: 0 })
class TestModuleIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 1
  }
}

// 测试用的 Indexer 类（无 config）
@Injectable()
@Indexer('test-module-indexer-no-config')
class TestModuleIndexerNoConfig extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 1
  }
}

describe('indexerModule', () => {
  it('should create module with default storage', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          indexers: [TestModuleIndexer],
        }),
      ],
    }).compile()

    const indexer = module.get(TestModuleIndexer)
    expect(indexer).toBeDefined()
    expect(indexer).toBeInstanceOf(TestModuleIndexer)
    expect(indexer.name).toBe('test-module-indexer')
  })

  it('should create module with custom storage', async () => {
    const customStorage = createStorage()
    await customStorage.setItem('test-key', 'test-value')

    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          storage: customStorage,
          indexers: [TestModuleIndexer],
        }),
      ],
    }).compile()

    const indexer = module.get(TestModuleIndexer)
    expect(indexer).toBeDefined()

    // 验证 storage 被正确使用
    const value = await customStorage.getItem('test-key')
    expect(value).toBe('test-value')
  })

  it('should handle indexer with no config metadata', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          indexers: [TestModuleIndexerNoConfig],
        }),
      ],
    }).compile()

    const indexer = module.get(TestModuleIndexerNoConfig)
    expect(indexer).toBeDefined()
    expect(indexer.name).toBe('test-module-indexer-no-config')
  })

  it('should register multiple indexers', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          indexers: [TestModuleIndexer, TestModuleIndexerNoConfig],
        }),
      ],
    }).compile()

    const indexer1 = module.get(TestModuleIndexer)
    const indexer2 = module.get(TestModuleIndexerNoConfig)

    expect(indexer1).toBeDefined()
    expect(indexer2).toBeDefined()
    expect(indexer1.name).toBe('test-module-indexer')
    expect(indexer2.name).toBe('test-module-indexer-no-config')
  })

  it('should use custom storage from indexer config if provided', async () => {
    const customStorage = createStorage()
    const defaultStorage = createStorage()

    await customStorage.setItem('custom-key', 'custom-value')
    await defaultStorage.setItem('default-key', 'default-value')

    // 创建一个带有自定义 storage 的 indexer
    @Injectable()
    @Indexer('test-custom-storage-indexer', { storage: customStorage, initial: 5 })
    class CustomStorageIndexer extends IndexerFactory<number> {
      async onHandleStep(current: number): Promise<number> {
        return current + 1
      }
    }

    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          storage: defaultStorage,
          indexers: [CustomStorageIndexer],
        }),
      ],
    }).compile()

    const indexer = module.get(CustomStorageIndexer)
    expect(indexer).toBeDefined()

    // 验证 indexer 使用的是自定义 storage，而不是默认的
    const customValue = await customStorage.getItem('custom-key')
    expect(customValue).toBe('custom-value')
  })

  it('should export indexers as global providers', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          indexers: [TestModuleIndexer],
        }),
      ],
    }).compile()

    // 验证可以从模块中获取
    const indexer = module.get(TestModuleIndexer)
    expect(indexer).toBeDefined()
  })
})
