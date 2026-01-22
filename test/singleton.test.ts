import { Inject, Injectable } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { Indexer, IndexerFactory, IndexerModule } from '../src/index'
import 'reflect-metadata'

// 测试用的 Indexer 类
@Injectable()
@Indexer('test-singleton', { initial: 0 })
class TestSingletonIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 1
  }
}

// 测试服务 1：注入 Indexer
@Injectable()
class TestService1 {
  constructor(@Inject(TestSingletonIndexer) public readonly indexer: TestSingletonIndexer) {}
}

// 测试服务 2：注入 Indexer
@Injectable()
class TestService2 {
  constructor(@Inject(TestSingletonIndexer) public readonly indexer: TestSingletonIndexer) {}
}

// 测试服务 3：多次注入同一个 Indexer
@Injectable()
class TestService3 {
  constructor(
    @Inject(TestSingletonIndexer) public readonly indexer1: TestSingletonIndexer,
    @Inject(TestSingletonIndexer) public readonly indexer2: TestSingletonIndexer,
  ) {}
}

describe('indexer Singleton Test', () => {
  it('should be singleton when injected into different services', async () => {
    // 创建 IndexerModule
    const indexerModule = IndexerModule.forRoot({
      indexers: [TestSingletonIndexer],
    })

    const module = await Test.createTestingModule({
      imports: [indexerModule],
      providers: [TestService1, TestService2],
    }).compile()

    // 先验证 Indexer 可以被直接获取
    const directIndexer = module.get(TestSingletonIndexer)
    expect(directIndexer).toBeDefined()
    expect(directIndexer).toBeInstanceOf(TestSingletonIndexer)

    const service1 = module.get(TestService1)
    const service2 = module.get(TestService2)

    // 验证不同服务中的 Indexer 是同一个实例
    expect(service1.indexer).toBeDefined()
    expect(service2.indexer).toBeDefined()
    expect(service1.indexer).toBe(service2.indexer)
    expect(service1.indexer).toBe(directIndexer)
    expect(service1.indexer).toBeInstanceOf(TestSingletonIndexer)
    expect(service2.indexer).toBeInstanceOf(TestSingletonIndexer)
  })

  it('should be singleton when injected multiple times in the same service', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          indexers: [TestSingletonIndexer],
        }),
      ],
      providers: [TestService3],
    }).compile()

    const service = module.get(TestService3)

    // 验证同一服务中多次注入的 Indexer 是同一个实例
    expect(service.indexer1).toBeDefined()
    expect(service.indexer2).toBeDefined()
    expect(service.indexer1).toBe(service.indexer2)
    expect(service.indexer1).toBeInstanceOf(TestSingletonIndexer)
  })

  it('should share state across different service instances', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          indexers: [TestSingletonIndexer],
        }),
      ],
      providers: [TestService1, TestService2],
    }).compile()

    const service1 = module.get(TestService1)
    const service2 = module.get(TestService2)

    // 通过 service1 修改状态
    const current1 = await service1.indexer.current()
    expect(current1).toBe(0)

    // 通过 service1 设置下一个值
    await service1.indexer.next(10)

    // 通过 service2 读取，应该能看到变化
    const current2 = await service2.indexer.current()
    expect(current2).toBe(10)

    // 验证它们确实是同一个实例
    expect(service1.indexer).toBe(service2.indexer)
  })

  it('should be singleton when directly retrieved from module', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          indexers: [TestSingletonIndexer],
        }),
      ],
      providers: [TestService1],
    }).compile()

    const service = module.get(TestService1)
    const directIndexer = module.get(TestSingletonIndexer)

    // 验证直接获取的 Indexer 和注入的 Indexer 是同一个实例
    expect(service.indexer).toBeDefined()
    expect(directIndexer).toBeDefined()
    expect(service.indexer).toBe(directIndexer)
    expect(directIndexer).toBeInstanceOf(TestSingletonIndexer)
  })
})
