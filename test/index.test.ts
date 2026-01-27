import type { IndexerOptions, RedisAdapter } from '../src/index'
import { describe, expect, it } from 'vitest'
import {
  BaseAdapter,
  createBunyanAdapter,
  createPinoAdapter,
  GlideAdapter,
  Indexer,
  IndexerFactory,
  IndexerModule,
  IoredisAdapter,
  MemoryAdapter,
  NodeRedisAdapter,
} from '../src/index'

describe('index exports', () => {
  it('should export Indexer decorator', () => {
    expect(Indexer).toBeDefined()
    expect(typeof Indexer).toBe('function')
    // 实际使用装饰器来确保导出被使用
    @Indexer('test-index-export', { initial: 0 })
    class TestIndexer extends IndexerFactory<number> {
      async onHandleStep(current: number): Promise<number> {
        return current + 1
      }
    }
    expect(TestIndexer).toBeDefined()
  })

  it('should export IndexerFactory class', () => {
    expect(IndexerFactory).toBeDefined()
    expect(typeof IndexerFactory).toBe('function')
    // 实际使用类来确保导出被使用
    expect(IndexerFactory.prototype.step).toBeDefined()
  })

  it('should export IndexerModule class', () => {
    expect(IndexerModule).toBeDefined()
    expect(typeof IndexerModule).toBe('function')
    // 实际使用方法来确保导出被使用
    expect(IndexerModule.forRoot).toBeDefined()
    expect(typeof IndexerModule.forRoot).toBe('function')
  })

  it('should export IndexerOptions type', () => {
    // TypeScript 类型检查，运行时无法直接验证
    // 但可以通过使用它来间接验证
    const options: IndexerOptions = {}
    expect(options).toBeDefined()
  })

  it('should export redlock-universal adapters', () => {
    expect(BaseAdapter).toBeDefined()
    expect(createBunyanAdapter).toBeDefined()
    expect(typeof createBunyanAdapter).toBe('function')
    expect(createPinoAdapter).toBeDefined()
    expect(typeof createPinoAdapter).toBe('function')
    expect(GlideAdapter).toBeDefined()
    expect(typeof GlideAdapter).toBe('function')
    expect(IoredisAdapter).toBeDefined()
    expect(typeof IoredisAdapter).toBe('function')
    expect(MemoryAdapter).toBeDefined()
    expect(typeof MemoryAdapter).toBe('function')
    expect(NodeRedisAdapter).toBeDefined()
    expect(typeof NodeRedisAdapter).toBe('function')
  })

  it('should export RedisAdapter type', () => {
    // TypeScript 类型检查
    const adapter: RedisAdapter = {} as RedisAdapter
    expect(adapter).toBeDefined()
  })
})
