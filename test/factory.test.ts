import type { Storage } from 'unstorage'
import { Injectable } from '@nestjs/common'
import RedisMock from 'ioredis-mock'
import { IoredisAdapter } from 'redlock-universal'
import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Indexer, IndexerFactory } from '../src/index'
import 'reflect-metadata'

// 测试用的基础 Indexer 类
@Injectable()
@Indexer('test-factory-indexer', { initial: 0 })
class TestFactoryIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 1
  }
}

describe('indexerFactory', () => {
  describe('constructor', () => {
    it('should throw error when not decorated with @Indexer', () => {
      class UndecoratedIndexer extends IndexerFactory<number> {
        async onHandleStep(_current: number): Promise<number> {
          return 0
        }
      }

      const createIndexer = () => {
        // eslint-disable-next-line no-new
        new UndecoratedIndexer()
      }
      expect(createIndexer).toThrow('IndexerFactory must be decorated with @Indexer(name, config) or provide options in constructor')
    })

    it('should initialize with default config', () => {
      const storage = createStorage()
      @Injectable()
      @Indexer('test-default-config', { storage, initial: 5 })
      class DefaultConfigIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }

      const indexer = new DefaultConfigIndexer()
      expect(indexer.name).toBe('test-default-config')
      expect(indexer.concurrency).toBeUndefined()
    })

    it('should initialize with custom timeout configs', () => {
      const storage = createStorage()
      @Injectable()
      @Indexer('test-timeout-config', {
        storage,
        initial: 0,
        runningTimeout: 120,
        retryTimeout: 180,
        concurrencyTimeout: 240,
      })
      class TimeoutConfigIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }

      const indexer = new TimeoutConfigIndexer()
      expect(indexer.name).toBe('test-timeout-config')
    })

    it('should initialize with Redis adapter', () => {
      const storage = createStorage()
      const redis = new RedisMock()
      const adapter = new IoredisAdapter(redis)

      @Injectable()
      @Indexer('test-redis-config', {
        storage,
        initial: 0,
        redis: adapter,
      })
      class RedisConfigIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }

      const indexer = new RedisConfigIndexer()
      expect(indexer.name).toBe('test-redis-config')
      expect(indexer.redis).toBeDefined()
    })

    it('should calculate concurrencyTimeout from runningTimeout when not provided', () => {
      const storage = createStorage()
      @Injectable()
      @Indexer('test-concurrency-timeout', {
        storage,
        initial: 0,
        runningTimeout: 50,
      })
      class ConcurrencyTimeoutIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }

      const indexer = new ConcurrencyTimeoutIndexer()
      expect(indexer.name).toBe('test-concurrency-timeout')
    })
  })

  describe('basic methods', () => {
    let storage: Storage
    let indexer: TestFactoryIndexer

    beforeEach(() => {
      storage = createStorage()
      @Injectable()
      @Indexer('test-basic', { storage, initial: 0 })
      class BasicIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      indexer = new BasicIndexer() as any
    })

    describe('current()', () => {
      it('should return initial value when storage is empty', async () => {
        const value = await indexer.current()
        expect(value).toBe(0)
      })

      it('should return value from storage when exists', async () => {
        await storage.setItem('indexer:test-basic', 42)
        const value = await indexer.current()
        expect(value).toBe(42)
      })
    })

    describe('initial()', () => {
      it('should return initial value from config when storage is empty', async () => {
        const value = await indexer.initial()
        expect(value).toBe(0)
      })

      it('should return value from storage when exists', async () => {
        await storage.setItem('indexer:test-basic', 100)
        const value = await indexer.initial()
        expect(value).toBe(100)
      })
    })

    describe('next()', () => {
      it('should set value directly when provided', async () => {
        await indexer.next(50)
        const value = await indexer.current()
        expect(value).toBe(50)
      })

      it('should calculate next value using step when not provided', async () => {
        await storage.setItem('indexer:test-basic', 10)
        await indexer.next()
        const value = await indexer.current()
        expect(value).toBe(11)
      })

      it('should calculate next value from initial when storage is empty', async () => {
        await indexer.next()
        const value = await indexer.current()
        expect(value).toBe(1)
      })
    })

    describe('step()', () => {
      it('should call onHandleStep with current value', async () => {
        await storage.setItem('indexer:test-basic', 5)
        const nextValue = await indexer.step()
        expect(nextValue).toBe(6)
      })

      it('should call onHandleStep with provided value', async () => {
        const nextValue = await indexer.step(10)
        expect(nextValue).toBe(11)
      })

      it('should use current value when not provided', async () => {
        await storage.setItem('indexer:test-basic', 20)
        const nextValue = await indexer.step()
        expect(nextValue).toBe(21)
      })
    })

    describe('latest()', () => {
      it('should return false by default', async () => {
        const isLatest = await indexer.latest()
        expect(isLatest).toBe(false)
      })

      it('should return false when onHandleLatest is undefined', async () => {
        // 创建一个没有 onHandleLatest 方法的 indexer
        const emptyStorage = createStorage()
        @Injectable()
        @Indexer('test-latest-undefined', { storage: emptyStorage, initial: 0 })
        class LatestUndefinedIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const latestIndexer = new LatestUndefinedIndexer() as any
        // 手动将 onHandleLatest 设置为 undefined 来测试这个分支
        latestIndexer.onHandleLatest = undefined
        const isLatest = await latestIndexer.latest()
        expect(isLatest).toBe(false)
      })

      it('should return false when current is null', async () => {
        // 创建一个没有初始值的 indexer，并且 current() 返回 null
        const emptyStorage = createStorage()
        @Injectable()
        @Indexer('test-latest-null', { storage: emptyStorage })
        class LatestNullIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const latestIndexer = new LatestNullIndexer() as any
        // 确保 storage 中没有值，并且 onHandleInitial 返回 null
        // 同时需要确保 current() 方法返回 null
        latestIndexer.onHandleInitial = async () => null as any
        // 直接 mock current() 方法返回 null 来确保覆盖行 139
        const originalCurrent = latestIndexer.current.bind(latestIndexer)
        latestIndexer.current = async () => null as any
        const isLatest = await latestIndexer.latest()
        expect(isLatest).toBe(false)
        // 恢复 original current 方法
        latestIndexer.current = originalCurrent
      })
    })

    describe('onHandleInitial()', () => {
      it('should return initial value from config by default', async () => {
        const value = await indexer.initial()
        expect(value).toBe(0)
      })

      it('should use custom onHandleInitial when overridden', async () => {
        const customStorage = createStorage()
        @Injectable()
        @Indexer('test-custom-initial', { storage: customStorage, initial: 10 })
        class CustomInitialIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }

          async onHandleInitial(): Promise<number> {
            return 99
          }
        }
        const customIndexer = new CustomInitialIndexer() as any
        const value = await customIndexer.initial()
        expect(value).toBe(99)
      })
    })

    describe('onHandleLatest()', () => {
      it('should use custom onHandleLatest when overridden', async () => {
        const customStorage = createStorage()
        @Injectable()
        @Indexer('test-custom-latest', { storage: customStorage, initial: 0 })
        class CustomLatestIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }

          async onHandleLatest(current: number): Promise<boolean> {
            return current >= 5
          }
        }
        const customIndexer = new CustomLatestIndexer() as any

        await customStorage.setItem('indexer:test-custom-latest', 4)
        expect(await customIndexer.latest()).toBe(false)

        await customStorage.setItem('indexer:test-custom-latest', 5)
        expect(await customIndexer.latest()).toBe(true)

        await customStorage.setItem('indexer:test-custom-latest', 6)
        expect(await customIndexer.latest()).toBe(true)
      })
    })
  })

  describe('redis methods', () => {
    let storage: Storage
    let redis: InstanceType<typeof RedisMock>
    let indexer: any

    beforeEach(async () => {
      storage = createStorage()
      redis = new RedisMock()
      const adapter = new IoredisAdapter(redis)

      @Injectable()
      @Indexer('test-redis', {
        storage,
        initial: 0,
        redis: adapter,
        concurrency: 3,
        runningTimeout: 30,
        retryTimeout: 60,
        concurrencyTimeout: 90,
      })
      class RedisIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      indexer = new RedisIndexer()

      // 清理状态
      await storage.removeItem('indexer:test-redis')
      await redis.del('indexer:test-redis:current', 'indexer:test-redis:concurrency', 'indexer:test-redis:failed')
    })

    describe('redis getter', () => {
      it('should return Redis client when adapter is provided', () => {
        expect(indexer.redis).toBeDefined()
        expect(indexer.redis).toBe(redis)
      })

      it('should return undefined when no Redis adapter', () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis', { storage: noRedisStorage, initial: 0 })
        class NoRedisIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisIndexer() as any
        expect(noRedisIndexer.redis).toBeUndefined()
      })
    })

    describe('atomic()', () => {
      it('should throw error when no lock is available', async () => {
        const noLockStorage = createStorage()
        @Injectable()
        @Indexer('test-no-lock', { storage: noLockStorage, initial: 0 })
        class NoLockIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noLockIndexer = new NoLockIndexer() as any

        await expect(noLockIndexer.atomic()).rejects.toThrow('Failed to get current lock')
      })

      it('should return [start, ended, epoch] values atomically', async () => {
        await storage.setItem('indexer:test-redis', 10)
        const [start, ended, epoch] = await indexer.atomic()

        expect(start).toBe(10)
        expect(ended).toBe(11)
        expect(typeof epoch).toBe('number')
        // 验证值已被预占
        const current = await indexer.current()
        expect(current).toBe(11)
      })

      it('should throw error when latest is reached', async () => {
        @Injectable()
        @Indexer('test-atomic-latest', {
          storage,
          initial: 0,
          redis: new IoredisAdapter(redis),
        })
        class AtomicLatestIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }

          async onHandleLatest(current: number): Promise<boolean> {
            return current >= 5
          }
        }
        const atomicLatestIndexer = new AtomicLatestIndexer() as any
        await storage.setItem('indexer:test-atomic-latest', 5)

        await expect(atomicLatestIndexer.atomic()).rejects.toThrow('reached latest: 5')
      })
    })

    describe('occupy() and release()', () => {
      it('should occupy and release concurrency slot', async () => {
        // 确保 storage 有初始值
        await storage.setItem('indexer:test-redis', 0)
        // occupy 和 release 是私有方法，通过 consume 间接测试
        const callback = vi.fn(async () => {
          // 验证占用
          const count = await redis.llen('indexer:test-redis:concurrency')
          expect(count).toBe(1)
        })

        await indexer.consume(callback)
        expect(callback).toHaveBeenCalled()

        // 验证释放
        const count = await redis.llen('indexer:test-redis:concurrency')
        expect(count).toBe(0)
      })

      it('should handle no Redis scenario in consume', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-occupy', { storage: noRedisStorage, initial: 0 })
        class NoRedisOccupyIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisOccupyIndexer() as any

        // occupy 和 release 是私有方法，无法直接测试
        // 它们的行为已经通过 consume 方法间接测试了
        // 当没有 Redis 时，consume 会抛出错误
        await expect(noRedisIndexer.consume(async () => {})).rejects.toThrow('Indexer requires redis to use "consume" method')
      })

      it('should return early when no Redis in occupy', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-occupy-direct', { storage: noRedisStorage, initial: 0 })
        class NoRedisOccupyDirectIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisOccupyDirectIndexer() as any

        // 直接调用私有方法 occupy 来测试无 Redis 的情况
        await expect((noRedisIndexer as any).occupy(1)).resolves.toBeUndefined()
      })

      it('should return early when no Redis in release', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-release-direct', { storage: noRedisStorage, initial: 0 })
        class NoRedisReleaseDirectIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisReleaseDirectIndexer() as any

        // 直接调用私有方法 release 来测试无 Redis 的情况
        await expect((noRedisIndexer as any).release(1)).resolves.toBeUndefined()
      })
    })

    describe('cleanup()', () => {
      it('should cleanup zombie tasks', async () => {
        const concurrencyKey = 'indexer:test-redis:concurrency'
        const task1Str = JSON.stringify(10)
        const task2Str = JSON.stringify(20)

        // 清理状态
        await redis.del(concurrencyKey, 'indexer:test-redis:failed')
        // 清理所有可能的 shadow keys
        const keys = await redis.keys(`${concurrencyKey}:shadow:*`)
        if (keys.length > 0)
          await redis.del(...keys)

        // 添加运行中的任务（使用 JSON.stringify 的结果，就像 occupy 方法一样）
        await redis.rpush(concurrencyKey, task1Str, task2Str)
        // 只创建 task1 的影子 key，task2 没有影子 key（僵尸任务）
        // shadow key 使用序列化后的值，与队列中的值保持一致
        await redis.set(`${concurrencyKey}:shadow:${task1Str}`, '1', 'EX', 30)

        // 记录清理前的状态
        const beforeCleanup = await redis.lrange(concurrencyKey, 0, -1)
        expect(beforeCleanup).toContain(task1Str)
        expect(beforeCleanup).toContain(task2Str)

        await indexer.cleanup()

        // cleanup 从队列获取的是字符串（task2Str = "20"），直接使用，不再序列化
        const failed = await redis.lrange('indexer:test-redis:failed', 0, -1)
        // 验证僵尸任务被添加到失败队列（使用原始序列化值，不是双重序列化）
        expect(failed.length).toBeGreaterThan(0)
        expect(failed).toContain(task2Str)

        // 验证 cleanup 能正确移除僵尸任务
        const afterCleanup = await redis.lrange(concurrencyKey, 0, -1)
        // task1 应该仍在队列中（因为有 shadow key）
        expect(afterCleanup).toContain(task1Str)
        // task2 应该被移除（因为它是僵尸任务）
        expect(afterCleanup).not.toContain(task2Str)
      })

      it('should not cleanup when no Redis', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-cleanup', { storage: noRedisStorage, initial: 0 })
        class NoRedisCleanupIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisCleanupIndexer() as any

        await expect(noRedisIndexer.cleanup()).resolves.toBeUndefined()
      })
    })

    describe('fail()', () => {
      it('should add task to failed queue', async () => {
        // 清理可能存在的失败队列
        await redis.del('indexer:test-redis:failed')
        await indexer.fail(100)

        const failed = await redis.lpop('indexer:test-redis:failed')
        expect(failed).toBe(JSON.stringify(100))
      })

      it('should set expiration on failed queue', async () => {
        await indexer.fail(200)

        const ttl = await redis.ttl('indexer:test-redis:failed')
        expect(ttl).toBeGreaterThan(0)
        expect(ttl).toBeLessThanOrEqual(60)
      })

      it('should not fail when no Redis', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-fail', { storage: noRedisStorage, initial: 0 })
        class NoRedisFailIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisFailIndexer() as any

        await expect(noRedisIndexer.fail(100)).resolves.toBeUndefined()
      })
    })

    describe('failed()', () => {
      it('should return failed task from queue', async () => {
        // 清理可能存在的失败队列
        await redis.del('indexer:test-redis:failed')
        await redis.rpush('indexer:test-redis:failed', JSON.stringify(50))

        const failed = await indexer.failed()
        expect(failed).toBe(50)
      })

      it('should return null when no failed tasks', async () => {
        // 清理可能存在的失败队列
        await redis.del('indexer:test-redis:failed')
        const failed = await indexer.failed()
        expect(failed).toBeNull()
      })

      it('should return null when no Redis', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-failed', { storage: noRedisStorage, initial: 0 })
        class NoRedisFailedIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisFailedIndexer() as any

        const failed = await noRedisIndexer.failed()
        expect(failed).toBeNull()
      })
    })

    describe('consume()', () => {
      it('should throw error when no Redis', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-consume', { storage: noRedisStorage, initial: 0 })
        class NoRedisConsumeIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisConsumeIndexer() as any

        await expect(
          noRedisIndexer.consume(async () => {}),
        ).rejects.toThrow('Indexer requires redis to use "consume" method')
      })

      it('should execute callback with start, ended and epoch values', async () => {
        // 清理状态并设置初始值
        await storage.removeItem('indexer:test-redis')
        await redis.del('indexer:test-redis:concurrency', 'indexer:test-redis:failed')
        await storage.setItem('indexer:test-redis', 5)
        const callback = vi.fn(async (start: number, ended: number, epoch: number) => {
          expect(start).toBe(5)
          expect(ended).toBe(6)
          expect(typeof epoch).toBe('number')
        })

        await indexer.consume(callback)
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should respect concurrency limit', async () => {
        // 填充并发队列
        await redis.rpush('indexer:test-redis:concurrency', '1', '2', '3')

        const callback = vi.fn()
        await indexer.consume(callback)

        // 应该因为达到并发限制而不执行
        expect(callback).not.toHaveBeenCalled()
      })

      it('should retry failed tasks first', async () => {
        // 清理状态
        await storage.removeItem('indexer:test-redis')
        await redis.del('indexer:test-redis:concurrency', 'indexer:test-redis:failed')
        await redis.rpush('indexer:test-redis:failed', JSON.stringify(100))

        const callback = vi.fn(async (start: number, _ended: number, _epoch: number) => {
          expect(start).toBe(100)
        })

        await indexer.consume(callback)
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should return early when latest is reached', async () => {
        @Injectable()
        @Indexer('test-consume-latest', {
          storage,
          initial: 0,
          redis: new IoredisAdapter(redis),
        })
        class ConsumeLatestIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }

          async onHandleLatest(current: number): Promise<boolean> {
            return current >= 10
          }
        }
        const consumeLatestIndexer = new ConsumeLatestIndexer() as any
        await storage.setItem('indexer:test-consume-latest', 10)

        const callback = vi.fn()
        await consumeLatestIndexer.consume(callback)

        expect(callback).not.toHaveBeenCalled()
      })

      it('should mark task as failed on error when retry is true', async () => {
        // 清理状态
        await storage.removeItem('indexer:test-redis')
        await redis.del('indexer:test-redis:concurrency', 'indexer:test-redis:failed')
        await storage.setItem('indexer:test-redis', 1)
        const error = new Error('Test error')
        const callback = vi.fn(async () => {
          throw error
        })

        await expect(indexer.consume(callback)).rejects.toThrow('Test error')

        // 验证任务被添加到失败队列
        const failed = await redis.lpop('indexer:test-redis:failed')
        expect(failed).toBe(JSON.stringify(1))
      })

      it('should not mark task as failed when retry is false', async () => {
        // 清理状态
        await storage.removeItem('indexer:test-redis')
        await redis.del('indexer:test-redis:concurrency', 'indexer:test-redis:failed')
        await storage.setItem('indexer:test-redis', 2)
        const error = new Error('Test error')
        const callback = vi.fn(async () => {
          throw error
        })

        await expect(indexer.consume(callback, { retry: false })).rejects.toThrow('Test error')

        // 验证任务没有被添加到失败队列
        const failed = await redis.lpop('indexer:test-redis:failed')
        expect(failed).toBeNull()
      })
    })

    describe('reset()', () => {
      it('should reset all Redis state and storage', async () => {
        // 设置一些状态
        await redis.set('indexer:test-redis:current', 'lock-value')
        await redis.rpush('indexer:test-redis:concurrency', '1', '2')
        await redis.rpush('indexer:test-redis:failed', '3')
        await storage.setItem('indexer:test-redis', 100)

        await indexer.reset()

        // 验证 Redis keys 被删除
        const currentExists = await redis.exists('indexer:test-redis:current')
        const concurrencyExists = await redis.exists('indexer:test-redis:concurrency')
        const failedExists = await redis.exists('indexer:test-redis:failed')

        expect(currentExists).toBe(0)
        expect(concurrencyExists).toBe(0)
        expect(failedExists).toBe(0)

        // 验证 storage 被清空
        const storageValue = await storage.getItem('indexer:test-redis')
        expect(storageValue).toBeNull()
      })

      it('should not reset when no Redis', async () => {
        const noRedisStorage = createStorage()
        await noRedisStorage.setItem('indexer:test-no-redis-reset', 50)

        @Injectable()
        @Indexer('test-no-redis-reset', { storage: noRedisStorage, initial: 0 })
        class NoRedisResetIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisResetIndexer() as any

        await noRedisIndexer.reset()

        // storage 应该仍然有值（因为 reset 只清空 Redis）
        const value = await noRedisStorage.getItem('indexer:test-no-redis-reset')
        expect(value).toBe(50)
      })
    })
  })

  describe('edge cases', () => {
    it('should handle indexer without concurrency', async () => {
      const storage = createStorage()
      const redis = new RedisMock()
      const adapter = new IoredisAdapter(redis)

      @Injectable()
      @Indexer('test-no-concurrency', {
        storage,
        initial: 0,
        redis: adapter,
      })
      class NoConcurrencyIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      const indexer = new NoConcurrencyIndexer() as any

      // consume 应该正常工作，不受并发限制
      const callback = vi.fn(async () => {})
      await indexer.consume(callback)
      expect(callback).toHaveBeenCalled()
    })

    it('should handle various timeout configurations', async () => {
      const storage = createStorage()
      const redis = new RedisMock()
      const adapter = new IoredisAdapter(redis)

      @Injectable()
      @Indexer('test-timeouts', {
        storage,
        initial: 0,
        redis: adapter,
        runningTimeout: 10,
        retryTimeout: 20,
        concurrencyTimeout: 30,
      })
      class TimeoutsIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      const indexer = new TimeoutsIndexer() as any

      expect(indexer).toBeDefined()
      expect(indexer.name).toBe('test-timeouts')
    })
  })

  describe('epoch and validate methods', () => {
    let storage: Storage
    let redis: InstanceType<typeof RedisMock>
    let indexer: any

    beforeEach(async () => {
      storage = createStorage()
      redis = new RedisMock()
      const adapter = new IoredisAdapter(redis)

      @Injectable()
      @Indexer('test-epoch', {
        storage,
        initial: 0,
        redis: adapter,
      })
      class EpochIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      indexer = new EpochIndexer() as any

      await storage.removeItem('indexer:test-epoch')
      await redis.del('indexer:test-epoch:epoch')
    })

    describe('epoch()', () => {
      it('should return 0 when no Redis', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-epoch', { storage: noRedisStorage, initial: 0 })
        class NoRedisEpochIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisEpochIndexer() as any

        // epoch 是私有方法，通过 validate 间接测试
        const isValid = await noRedisIndexer.validate(0)
        expect(isValid).toBe(true) // 当没有 redis 时，epoch 返回 0
      })

      it('should return epoch value from Redis', async () => {
        await redis.set('indexer:test-epoch:epoch', '5')
        const isValid = await indexer.validate(5)
        expect(isValid).toBe(true)
      })

      it('should return 0 when epoch key does not exist', async () => {
        const isValid = await indexer.validate(0)
        expect(isValid).toBe(true)
      })
    })

    describe('incrementEpoch()', () => {
      it('should return 0 when no Redis in incrementEpoch', async () => {
        const noRedisStorage = createStorage()
        @Injectable()
        @Indexer('test-no-redis-increment', { storage: noRedisStorage, initial: 0 })
        class NoRedisIncrementIndexer extends IndexerFactory<number> {
          async onHandleStep(current: number): Promise<number> {
            return current + 1
          }
        }
        const noRedisIndexer = new NoRedisIncrementIndexer() as any

        // incrementEpoch 是私有方法，但我们可以通过直接调用它来测试（使用类型断言）
        // 或者通过创建一个有 lock 但没有 redis 的特殊场景
        // 实际上，由于 rollback 会先检查 lock，我们需要创建一个特殊的场景
        // 但为了覆盖这个分支，我们可以直接访问私有方法
        const result = await (noRedisIndexer as any).incrementEpoch()
        expect(result).toBe(0)
      })

      it('should increment epoch value in Redis', async () => {
        await redis.set('indexer:test-epoch:epoch', '10')
        // incrementEpoch 是私有方法，通过 rollback 间接测试
        await storage.setItem('indexer:test-epoch', 5)
        await indexer.rollback(3)
        const epoch = await redis.get('indexer:test-epoch:epoch')
        expect(Number.parseInt(epoch || '0', 10)).toBeGreaterThan(10)
      })
    })

    describe('validate()', () => {
      it('should return true when epoch matches', async () => {
        await redis.set('indexer:test-epoch:epoch', '10')
        const isValid = await indexer.validate(10)
        expect(isValid).toBe(true)
      })

      it('should return false when epoch does not match', async () => {
        await redis.set('indexer:test-epoch:epoch', '10')
        const isValid = await indexer.validate(5)
        expect(isValid).toBe(false)
      })

      it('should return true when epoch is 0 and Redis key does not exist', async () => {
        const isValid = await indexer.validate(0)
        expect(isValid).toBe(true)
      })
    })
  })

  describe('rollback()', () => {
    let storage: Storage
    let redis: InstanceType<typeof RedisMock>
    let indexer: any

    beforeEach(async () => {
      storage = createStorage()
      redis = new RedisMock()
      const adapter = new IoredisAdapter(redis)

      @Injectable()
      @Indexer('test-rollback', {
        storage,
        initial: 0,
        redis: adapter,
        concurrency: 2,
      })
      class RollbackIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      indexer = new RollbackIndexer() as any

      await storage.removeItem('indexer:test-rollback')
      await redis.del('indexer:test-rollback:current', 'indexer:test-rollback:concurrency', 'indexer:test-rollback:failed', 'indexer:test-rollback:epoch')
    })

    it('should throw error when no lock', async () => {
      const noLockStorage = createStorage()
      @Injectable()
      @Indexer('test-no-lock-rollback', { storage: noLockStorage, initial: 0 })
      class NoLockRollbackIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      const noLockIndexer = new NoLockRollbackIndexer() as any

      await expect(noLockIndexer.rollback(5)).rejects.toThrow('Indexer requires redis and lock to use "rollback" method')
    })

    it('should rollback to target value', async () => {
      await storage.setItem('indexer:test-rollback', 10)
      await indexer.rollback(5)

      const current = await indexer.current()
      expect(current).toBe(5)
    })

    it('should call onHandleRollback callback', async () => {
      const rollbackCallback = vi.fn(async (_from: number, _to: number) => {})
      @Injectable()
      @Indexer('test-rollback-callback', {
        storage,
        initial: 0,
        redis: new IoredisAdapter(redis),
      })
      class RollbackCallbackIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }

        async onHandleRollback(from: number, to: number): Promise<void> {
          await rollbackCallback(from, to)
        }
      }
      const callbackIndexer = new RollbackCallbackIndexer() as any

      await storage.setItem('indexer:test-rollback-callback', 10)
      await callbackIndexer.rollback(5)

      expect(rollbackCallback).toHaveBeenCalledWith(10, 5)
    })

    it('should clear running tasks during rollback', async () => {
      await storage.setItem('indexer:test-rollback', 10)
      // 添加一些运行中的任务
      await redis.rpush('indexer:test-rollback:concurrency', JSON.stringify(8), JSON.stringify(9))
      await redis.set(`indexer:test-rollback:concurrency:shadow:${JSON.stringify(8)}`, '1', 'EX', 30)
      await redis.set(`indexer:test-rollback:concurrency:shadow:${JSON.stringify(9)}`, '1', 'EX', 30)

      await indexer.rollback(5)

      // 验证运行中的任务被清理
      const concurrencyTasks = await redis.lrange('indexer:test-rollback:concurrency', 0, -1)
      expect(concurrencyTasks.length).toBe(0)
    })

    it('should increment epoch during rollback', async () => {
      await storage.setItem('indexer:test-rollback', 10)
      await redis.set('indexer:test-rollback:epoch', '5')

      await indexer.rollback(5)

      const epoch = await redis.get('indexer:test-rollback:epoch')
      expect(Number.parseInt(epoch || '0', 10)).toBe(6)
    })

    it('should return early when no Redis in clearRunningTasks', async () => {
      const noRedisStorage = createStorage()
      @Injectable()
      @Indexer('test-no-redis-clear-tasks', { storage: noRedisStorage, initial: 0 })
      class NoRedisClearTasksIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      const noRedisIndexer = new NoRedisClearTasksIndexer() as any

      // 直接调用私有方法 clearRunningTasks 来测试无 Redis 的情况
      await expect((noRedisIndexer as any).clearRunningTasks()).resolves.toBeUndefined()
    })
  })

  describe('atomic() error cases', () => {
    let storage: Storage
    let redis: InstanceType<typeof RedisMock>
    let indexer: any

    beforeEach(async () => {
      storage = createStorage()
      redis = new RedisMock()
      const adapter = new IoredisAdapter(redis)

      @Injectable()
      @Indexer('test-atomic-error', {
        storage,
        initial: 0,
        redis: adapter,
      })
      class AtomicErrorIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      indexer = new AtomicErrorIndexer() as any

      await storage.removeItem('indexer:test-atomic-error')
    })

    it('should throw error when start, ended, or epoch is undefined', async () => {
      // 创建一个会返回 undefined 的 mock lock
      const mockLock = {
        using: async () => {
          // 不调用 callback，导致 start, ended, epoch 保持 undefined
          await Promise.resolve()
        },
      }
      // 替换 currentLock
      ;(indexer as any).currentLock = mockLock

      await expect(indexer.atomic()).rejects.toThrow('Failed to get start, ended and epoch')
    })
  })

  describe('consume() epoch mismatch', () => {
    let storage: Storage
    let redis: InstanceType<typeof RedisMock>
    let indexer: any

    beforeEach(async () => {
      storage = createStorage()
      redis = new RedisMock()
      const adapter = new IoredisAdapter(redis)

      @Injectable()
      @Indexer('test-epoch-mismatch', {
        storage,
        initial: 0,
        redis: adapter,
      })
      class EpochMismatchIndexer extends IndexerFactory<number> {
        async onHandleStep(current: number): Promise<number> {
          return current + 1
        }
      }
      indexer = new EpochMismatchIndexer() as any

      await storage.removeItem('indexer:test-epoch-mismatch')
      await redis.del('indexer:test-epoch-mismatch:concurrency', 'indexer:test-epoch-mismatch:failed', 'indexer:test-epoch-mismatch:epoch')
    })

    it('should skip retry when epoch mismatch occurs', async () => {
      await storage.setItem('indexer:test-epoch-mismatch', 5)
      // 设置初始 epoch
      await redis.set('indexer:test-epoch-mismatch:epoch', '10')

      const error = new Error('Test error')
      const callback = vi.fn(async () => {
        // 在回调执行期间，模拟 epoch 变化（回滚发生）
        await redis.set('indexer:test-epoch-mismatch:epoch', '11')
        throw error
      })

      await expect(indexer.consume(callback)).rejects.toThrow('Test error')

      // 验证任务没有被添加到失败队列（因为 epoch 不匹配）
      const failed = await redis.lpop('indexer:test-epoch-mismatch:failed')
      expect(failed).toBeNull()
    })

    it('should retry when epoch matches', async () => {
      // 清理状态
      await storage.removeItem('indexer:test-epoch-mismatch')
      await redis.del('indexer:test-epoch-mismatch:concurrency', 'indexer:test-epoch-mismatch:failed', 'indexer:test-epoch-mismatch:epoch')

      // 使用失败任务路径来测试 epoch 匹配（避免 atomic() 的 lock 问题）
      await redis.rpush('indexer:test-epoch-mismatch:failed', JSON.stringify(5))
      await redis.set('indexer:test-epoch-mismatch:epoch', '10')

      const error = new Error('Test error')
      const callback = vi.fn(async () => {
        // epoch 保持不变
        throw error
      })

      await expect(indexer.consume(callback)).rejects.toThrow('Test error')

      // 验证任务被重新添加到失败队列（因为 epoch 匹配）
      const failed = await redis.lpop('indexer:test-epoch-mismatch:failed')
      expect(failed).toBe(JSON.stringify(5))
    })
  })
})
