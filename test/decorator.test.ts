import { describe, expect, it } from 'vitest'
import { INDEXER_CONFIG_KEY, INDEXER_NAME_KEY } from '../src/constants'
import { Indexer } from '../src/indexer.decorator'
import 'reflect-metadata'

describe('indexer decorator', () => {
  it('should set metadata with name and options', () => {
    const options = { initial: 100, concurrency: 5 }
    @Indexer('test-indexer', options)
    class TestIndexer {}

    const name = Reflect.getMetadata(INDEXER_NAME_KEY, TestIndexer)
    const config = Reflect.getMetadata(INDEXER_CONFIG_KEY, TestIndexer)

    expect(name).toBe('test-indexer')
    expect(config).toEqual(options)
  })

  it('should set metadata with name and empty object when options is undefined', () => {
    @Indexer('test-indexer-2')
    class TestIndexer2 {}

    const name = Reflect.getMetadata(INDEXER_NAME_KEY, TestIndexer2)
    const config = Reflect.getMetadata(INDEXER_CONFIG_KEY, TestIndexer2)

    expect(name).toBe('test-indexer-2')
    expect(config).toEqual({})
  })

  it('should set metadata with name and empty object when options is null', () => {
    @Indexer('test-indexer-3', null as any)
    class TestIndexer3 {}

    const name = Reflect.getMetadata(INDEXER_NAME_KEY, TestIndexer3)
    const config = Reflect.getMetadata(INDEXER_CONFIG_KEY, TestIndexer3)

    expect(name).toBe('test-indexer-3')
    expect(config).toEqual({})
  })

  it('should allow multiple decorators on different classes', () => {
    @Indexer('indexer-a', { initial: 1 })
    class IndexerA {}

    @Indexer('indexer-b', { initial: 2 })
    class IndexerB {}

    const nameA = Reflect.getMetadata(INDEXER_NAME_KEY, IndexerA)
    const nameB = Reflect.getMetadata(INDEXER_NAME_KEY, IndexerB)
    const configA = Reflect.getMetadata(INDEXER_CONFIG_KEY, IndexerA)
    const configB = Reflect.getMetadata(INDEXER_CONFIG_KEY, IndexerB)

    expect(nameA).toBe('indexer-a')
    expect(nameB).toBe('indexer-b')
    expect(configA).toEqual({ initial: 1 })
    expect(configB).toEqual({ initial: 2 })
  })
})
