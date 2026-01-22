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
  })

  it('should export IndexerFactory class', () => {
    expect(IndexerFactory).toBeDefined()
    expect(typeof IndexerFactory).toBe('function')
  })

  it('should export IndexerModule class', () => {
    expect(IndexerModule).toBeDefined()
    expect(typeof IndexerModule).toBe('function')
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
    expect(createPinoAdapter).toBeDefined()
    expect(GlideAdapter).toBeDefined()
    expect(IoredisAdapter).toBeDefined()
    expect(MemoryAdapter).toBeDefined()
    expect(NodeRedisAdapter).toBeDefined()
  })

  it('should export RedisAdapter type', () => {
    // TypeScript 类型检查
    const adapter: RedisAdapter = {} as RedisAdapter
    expect(adapter).toBeDefined()
  })
})
