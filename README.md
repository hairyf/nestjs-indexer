# nestjs-indexer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

分布式游标索引调度框架。支持原子步进、并发控制与自动失败重试。

## Features

* ⚡️ **原子性** - 基于 Redis 锁确保索引区间在分布式环境下唯一派发。
* 🛡 **并发控制** - 内置信号量机制，轻松限制全局任务执行数。
* 🔄 **自愈能力** - 自动处理僵尸任务清理与失败任务重试。
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
// app.module.ts
IndexerModule.forRoot({
  indexers: [
    createIndexer<number>({
      name: 'counter',
      initial: 0,
      step: current => current + 1,
      lastend: current => current >= 1000,
      // 配置你的持久化存储（用于存储索引指针）
      // 如果未使用，则默认使用内存存储
      // storage: createStorage(...)
    }),
  ]
})

// app.service.ts
class AppService {
  constructor(
    @InjectIndexer('counter') private indexer: Indexer<number>,
  ) {}

  @Cron('0 0 * * *')
  @Redlock({ key: 'indexer:counter', ttl: 1000 })
  async handleTask() {
    if (await this.indexer.latest())
      return

    const start = await this.indexer.current()
    const ended = await this.indexer.step(start)

    try {
      await this.doSomething(start, ended)
      await this.indexer.next()
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
// app.module.ts
createIndexer<number>({
  name: 'timer',
  initial: Date.now(),
  step: current => current + 60000,
  concurrency: 50, // 全局限制 50 个并发任务
  redis: new IoredisAdapter(redisClient),
  lockTimeout: 60, // 任务最长执行 60s，超时视为僵尸任务
})

// app.service.ts
class AppService {
  constructor(
    @InjectIndexer('timer') private indexer: Indexer<number>,
  ) {}

  @Interval(100)
  async handleTimer() {
    // 自动获取 start/ended，处理失败重试与并发占用
    await this.indexer.consume(async (start: number, ended: number) => {
      await this.processData(start, ended)
    })
  }
}
```

### Integration with BullMQ

将 Indexer 作为区间分发器，结合队列实现极致的可靠性。

```typescript
class AppService {
  constructor(
    @InjectIndexer('timer') private indexer: Indexer<number>,
  ) {}

  @Interval(100)
  async handleTimer() {
    await this.indexer.consume(
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

| 属性 | 类型 | 描述 |
| --- | --- | --- |
| `name` | `string` | Indexer 唯一标识 |
| `initial` | `T | Function` | 初始值或初始化函数 |
| `step` | `Function` | 索引步进逻辑，定义区间范围 |
| `concurrency` | `number` | 全局最大并发任务数 (需 Redis) |
| `lockTimeout` | `number` | 任务最长存活时间，用于僵尸清理 (秒) |
| `retryTimeout` | `number` | 失败任务在队列中的保留时间 (秒) |

## Methods

* `consume(callback)` - 核心消费函数，集成并发与重试逻辑。
* `atomic()` - 原子获取下一个索引区间。
* `cleanup()` - 手动触发僵尸任务清理（建议配合定时任务）。
* `reset()` - 重置所有 Redis 状态与游标指针。

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
