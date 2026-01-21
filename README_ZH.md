# nestjs-indexer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

[English](./README.md) | 中文

分布式游标索引调度框架。支持原子步进、并发控制与自动失败重试。

## Features

* ⚡️ **原子性** - 基于 Redis 锁确保索引区间在分布式环境下唯一派发。
* 🛡 **并发控制** - 内置信号量机制，轻松限制全局任务执行数。
* 🔄 **自愈能力** - 处理僵尸任务清理、失败任务重试与并发控制。
* 📦 **存储抽象** - 基于 [unstorage](https://www.google.com/search?q=https://github.com/unjs/unstorage)，支持 Redis, FS, MongoDB 等多种存储。
* 🔗 **队列友好** - 适配扩展 BullMQ, RabbitMQ 等消息队列。

## Install

```bash
npm i nestjs-indexer
```

## Usage

### Single Instance Mode

适用于对顺序要求严格、单点执行的定时任务。

```typescript
// counter.indexer.ts
import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory } from 'nestjs-indexer'

@Injectable()
@Indexer('counter', { initial: 0 })
export class CounterIndexer extends IndexerFactory<number> {
  // 当任务达到最新指标时，停止执行
  // 如果未实现，则默认不停止
  async onHandleLatest(current: number): Promise<boolean> {
    return current >= 1000
  }

  // 必须实现，用于计算下一个索引值的方法
  async onHandleStep(current: number): Promise<number> {
    return current + 1
  }
}
```

引入并注册 IndexerModule

```typescript
// app.module.ts
import { IndexerModule } from 'nestjs-indexer'
import { CounterIndexer } from './indexers/counter.indexer'

IndexerModule.forRoot({
  indexers: [CounterIndexer],
  // 配置持久化存储（用于存储索引指针）
  // 如果未使用，则默认使用内存存储（重启会丢失指针）
  // storage: createStorage(...)
})
```

```typescript
// app.service.ts
import { CounterIndexer } from './indexers/counter.indexer'

class AppService {
  constructor(
    private counterIndexer: CounterIndexer,
  ) {}

  @Cron('0 0 * * *')
  @Redlock({ key: 'indexer:counter', ttl: 1000 })
  async handleTask() {
    if (await this.counterIndexer.latest())
      return

    const start = await this.counterIndexer.current()
    const ended = await this.counterIndexer.step(start)

    try {
      await this.doSomething(start, ended)
      await this.counterIndexer.next()
    }
    catch (e) {
      // 任务失败，不移动索引指针
    }
  }
}
```

### Distributed Concurrency Mode

多实例集群并发执行。内部自动处理原子区间认领及失败任务重试。

```typescript
// timer.indexer.ts
import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory } from 'nestjs-indexer'
import { IoredisAdapter } from 'nestjs-redlock-universal'

@Injectable()
@Indexer('timer', {
  initial: Date.now(),
  concurrency: 50, // 全局限制 50 个并发任务
  redis: new IoredisAdapter(redisClient),
  runningTimeout: 60, // 任务最长执行 60s，超时视为僵尸任务
})
export class TimerIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 60000
  }

  @Interval(1000 * 60 * 15)
  // 如果是分布式模式，需要定期清理僵尸任务
  // 默认情况下，fail 会自动重试，如果重试超时了，
  // 就会占用并发信号量，时间长了，就会导致无法继续执行任务
  async onHandleCleanup(): Promise<void> {
    await this.cleanup()
  }
}
```

```typescript
// app.module.ts
import { IndexerModule } from 'nestjs-indexer'
import { TimerIndexer } from './indexers/timer.indexer'

IndexerModule.forRoot({
  indexers: [TimerIndexer],
})
```

```typescript
// app.service.ts
import { TimerIndexer } from './indexers/timer.indexer'

class AppService {
  constructor(
    private timerIndexer: TimerIndexer,
  ) {}

  @Interval(100)
  async handleTimer() {
    // 自动获取 start/ended，处理失败重试与并发占用
    await this.timerIndexer.consume(async (start: number, ended: number) => {
      await this.processData(start, ended)
    })
  }
}
```

### Integration with BullMQ

将 Indexer 作为区间分发器，结合队列实现极致的可靠性。

```typescript
import { Queue } from 'bull'
import { TimerIndexer } from './indexers/timer.indexer'

class AppService {
  constructor(
    private timerIndexer: TimerIndexer,
    private queue: Queue,
  ) {}

  @Interval(100)
  async handleTimer() {
    await this.timerIndexer.consume(
      // 派发至队列，成功入队即视为消费成功
      async (start: number, ended: number) => this.queue.add('pull', { start, ended }),
      // 关闭 Indexer 内部重试，交给队列处理
      { retry: false }
    )
  }
}

@Processor('indexer')
class IndexerProcessor {
  @Process('pull')
  async handlePull(job: Job) {
    const { start, ended } = job.data
    // 具体的业务逻辑
  }
}
```

## Configuration

### @Indexer 装饰器配置

| 属性 | 类型 | 描述 |
| --- | --- | --- |
| `name` | `string` | Indexer 唯一标识（必需） |
| `initial` | `any` | 初始值（可选，也可在类中实现 `initial()` 方法） |
| `concurrency` | `number` | 全局最大并发任务数（需 Redis） |
| `redis` | `RedisAdapter` | Redis 适配器（并发模式必需） |
| `storage` | `Storage` | 存储适配器（可选，默认使用内存存储） |
| `runningTimeout` | `number` | 任务最长存活时间，用于僵尸清理（秒，默认 60） |
| `retryTimeout` | `number` | 失败任务在队列中的保留时间（秒，默认 60） |
| `concurrencyTimeout` | `number` | 并发 Key 的自动过期时间（秒，默认 runningTimeout * 2） |

### 类方法

继承 `IndexerFactory<T>` 的类需要实现以下方法：

* `onHandleStep(current: T): Promise<T>` - **必需**，计算下一个索引值
* `onHandleLatest(current: T): Promise<boolean> | boolean` - **可选**，检查是否已到达最新指标
* `onHandleInitial(): Promise<T>` - **可选**，获取初始值（如果不提供，使用装饰器中的 `initial`）

## API Methods

* `consume(callback, options?)` - 核心消费函数，集成并发与重试逻辑
* `atomic()` - 原子获取下一个索引区间
* `current()` - 获取当前索引值
* `next(value?)` - 设置下一个索引值
* `latest()` - 检查是否已到达最新指标
* `cleanup()` - 触发僵尸任务清理（需要配合定时任务执行）
* `reset()` - 重置所有 Redis 状态与游标指针(谨慎使用，会导致所有任务重新执行)

## License

[MIT](https://www.google.com/search?q=./LICENSE) License © [Hairyf](https://github.com/hairyf)

[npm-version-src]: https://img.shields.io/npm/v/nestjs-indexer?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/nestjs-indexer
[npm-downloads-src]: https://img.shields.io/npm/dm/nestjs-indexer?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/nestjs-indexer
[bundle-src]: https://img.shields.io/bundlephobia/minzip/nestjs-indexer?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=nestjs-indexer
[license-src]: https://img.shields.io/github/license/hairyf/nestjs-indexer.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/hairyf/nestjs-indexer/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/nestjs-indexer
