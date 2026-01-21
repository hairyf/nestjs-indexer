# nestjs-indexer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

English | [中文](./README_ZH.md)

A distributed cursor indexing and scheduling framework. Supports atomic stepping, concurrency control, and automatic failure retries.

## Features

* ⚡️ **Atomicity** - Ensures unique indexing intervals in distributed environments using Redis locks.
* 🛡 **Concurrency Control** - Built-in semaphore mechanism to easily limit global task execution.
* 🔄 **Self-healing** - Handles zombie task cleanup, failure retries, and concurrency management.
* 📦 **Storage Abstraction** - Powered by [unstorage](https://www.google.com/search?q=https://github.com/unjs/unstorage), supporting Redis, FS, MongoDB, and more.
* 🔗 **Queue Friendly** - Easily integrates with message queues like BullMQ and RabbitMQ.

## Install

```bash
npm i nestjs-indexer
```

## Usage

### Single Instance Mode

Suitable for scheduled tasks that require strict sequential execution on a single point.

```ts
// counter.indexer.ts
import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory } from 'nestjs-indexer'

@Injectable()
@Indexer('counter', { initial: 0 })
export class CounterIndexer extends IndexerFactory<number> {
  // Stop execution when the task reaches the latest benchmark
  // If not implemented, it defaults to never stopping
  async onHandleLatest(current: number): Promise<boolean> {
    return current >= 1000
  }

  // Required: Method to calculate the next index value
  async onHandleStep(current: number): Promise<number> {
    return current + 1
  }
}
```

Import and register `IndexerModule`:

```ts
// app.module.ts
import { IndexerModule } from 'nestjs-indexer'
import { CounterIndexer } from './indexers/counter.indexer'

IndexerModule.forRoot({
  indexers: [CounterIndexer],
  // Configure persistent storage (for storing index pointers)
  // If not provided, it defaults to memory storage (pointers lost on restart)
  // storage: createStorage(...)
})
```

```ts
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
      // Task failed, do not move the index pointer
    }
  }
}
```

### Distributed Concurrency Mode

Parallel execution across a multi-instance cluster. Handles atomic interval claiming and failed task retries automatically.

```ts
// timer.indexer.ts
import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory } from 'nestjs-indexer'
import { IoredisAdapter } from 'nestjs-redlock-universal'

@Injectable()
@Indexer('timer', {
  initial: Date.now(),
  concurrency: 50, // Global limit of 50 concurrent tasks
  redis: new IoredisAdapter(redisClient),
  runningTimeout: 60, // Max task duration: 60s (otherwise considered a zombie)
})
export class TimerIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 60000
  }

  @Interval(1000 * 60 * 15)
  // In distributed mode, zombie tasks need to be cleaned up periodically.
  // By default, failures auto-retry. If retries time out, they occupy
  // concurrency slots, eventually preventing further task execution.
  async onHandleCleanup(): Promise<void> {
    await this.cleanup()
  }
}
```

```ts
// app.service.ts
import { TimerIndexer } from './indexers/timer.indexer'

class AppService {
  constructor(
    private timerIndexer: TimerIndexer,
  ) {}

  @Interval(100)
  async handleTimer() {
    // Automatically fetches start/ended, handles retries and concurrency slots
    await this.timerIndexer.consume(async (start: number, ended: number) => {
      await this.processData(start, ended)
    })
  }
}
```

### Integration with BullMQ

Use the Indexer as an interval dispatcher combined with a queue for maximum reliability.

```ts
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
      // Dispatch to queue; successful entry into queue is treated as successful consumption
      async (start: number, ended: number) => this.queue.add('pull', { start, ended }),
      // Disable internal Indexer retries, delegate to the queue instead
      { retry: false }
    )
  }
}

@Processor('indexer')
class IndexerProcessor {
  @Process('pull')
  async handlePull(job: Job) {
    const { start, ended } = job.data
    // Business logic here
  }
}
```

## Configuration

### @Indexer Decorator Options

| Property | Type | Description |
| --- | --- | --- |
| `name` | `string` | Unique identifier for the Indexer (Required) |
| `initial` | `any` | Initial value (Optional, can also be implemented via `initial()` method) |
| `concurrency` | `number` | Max global concurrent tasks (Requires Redis) |
| `redis` | `RedisAdapter` | Redis adapter (Required for concurrency mode) |
| `storage` | `Storage` | Storage adapter (Optional, defaults to memory) |
| `runningTimeout` | `number` | Max task TTL for zombie cleanup (Seconds, default: 60) |
| `retryTimeout` | `number` | Retention time for failed tasks in the retry queue (Seconds, default: 60) |
| `concurrencyTimeout` | `number` | TTL for concurrency keys (Seconds, default: `runningTimeout * 2`) |

### Class Methods

Classes extending `IndexerFactory<T>` should implement:

* `onHandleStep(current: T): Promise<T>` - **Required**: Calculates the next index value.
* `onHandleLatest(current: T): Promise<boolean> | boolean` - **Optional**: Checks if the latest benchmark is reached.
* `onHandleInitial(): Promise<T>` - **Optional**: Gets the initial value (overrides decorator `initial`).

## API Methods

* `consume(callback, options?)` - Core function integrating concurrency and retry logic.
* `atomic()` - Atomically retrieves the next index interval.
* `current()` - Retrieves the current index value.
* `next(value?)` - Sets the next index value manually.
* `latest()` - Checks if the latest benchmark is reached.
* `cleanup()` - Triggers zombie task cleanup (should be used with a cron/interval).
* `reset()` - Resets all Redis states and cursor pointers (**Use with caution**: causes all tasks to re-execute).

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
