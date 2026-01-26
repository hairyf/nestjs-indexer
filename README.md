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
  // storage: createStorage(...) or { getItem(key): index, setItem(key, index) }
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
      await this.counterIndexer.next(ended)
    }
    catch (e) {
      // Task failed, do not move the index pointer
    }
  }
}
```

### Distributed Concurrency Mode

Parallel execution across a multi-instance cluster. Handles atomic interval claiming and failed task retries automatically.

> **Note**: The built-in queue implementation may not meet production-level requirements. For production use, recommend using [BullMQ](https://docs.bullmq.io/) or other mature queue systems. See the [Integration with BullMQ](#integration-with-bullmq) section below for best practices.

```ts
// timer.indexer.ts
import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory, IoredisAdapter } from 'nestjs-indexer'

@Injectable()
@Indexer('timer', {
  initial: Date.now(),
  // Global limit of 50 concurrent tasks
  concurrency: 50,
  redis: new IoredisAdapter(redisClient),
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
    // Automatically fetches start/ended/epoch, handles retries and concurrency slots
    await this.timerIndexer.consume(this.processData.bind(this))
  }
}
```

### Integration with BullMQ

Use the Indexer as an interval dispatcher combined with a queue for maximum reliability.

```ts
// You still need to pass in redis (for atomic retrieval of indices)
@Indexer('timer', { redis: new IoredisAdapter(redisClient) })
class TimerIndexer extends IndexerFactory<number> {
  onHandleStep(current: number): Promise<number> {
    // ...
  }

  // you not need to implement onHandleCleanup
}
```

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
    const [start, ended, epoch] = await this.timerIndexer.atomic()
    await this.queue.add('pull', { start, ended, epoch })
  }
}

@Processor('indexer')
class IndexerProcessor {
  @Process('pull')
  async handlePull(job: Job) {
    const { start, ended, epoch } = job.data
    // Business logic here
    if (!(await this.timerIndexer.validate(epoch))) {
      // Skip if rollback occurred
    }
    // save data
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
* `onHandleRollback(from: T, to: T): Promise<void>` - **Optional**: Handles business logic during rollback (e.g., deleting dirty data).

## API Methods

* `consume(callback, options?)` - Core function integrating concurrency and retry logic.
* `atomic()` - Atomically retrieves the next index interval `[start, ended, epoch]`.
* `current()` - Retrieves the current index value.
* `next(value?)` - Sets the next index value manually.
* `latest()` - Checks if the latest benchmark is reached.
* `cleanup()` - Triggers zombie task cleanup (should be used with a cron/interval).
* `rollback(target)` - Rolls back the index pointer to a target position (requires Redis).
* `validate(epoch)` - Validates if the epoch matches the current version (useful for checking rollback in workers).
* `reset()` - Resets all Redis states and cursor pointers (**Use with caution**: causes all tasks to re-execute).

## Rollback Feature

The rollback feature allows you to safely roll back the index pointer to a previous position, useful for handling chain forks, data corrections, or business logic changes.

### Basic Usage

```ts
// Roll back to a specific position
await this.indexer.rollback(targetValue)
```

### Lifecycle Hook

Implement `onHandleRollback` to handle business logic during rollback (e.g., deleting dirty data):

```ts
@Indexer('timer', { redis: new IoredisAdapter(redisClient) })
export class TimerIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 60000
  }

  // Optional: Handle rollback business logic
  async onHandleRollback(from: number, to: number): Promise<void> {
    // Delete data in the range [to, from) that needs to be re-indexed
    await this.deleteDataInRange(to, from)
  }
}
```

### Epoch Validation in Workers

When using `consume()`, the callback receives an `epoch` parameter. Use `validate(epoch)` to check if a rollback occurred before processing:

```ts
await this.indexer.consume(async (start, ended, epoch) => {
  // Your business logic here
  const items = await this.processData(start, ended)

  // Validate epoch before processing
  if (!(await this.indexer.validate(epoch))) {
    console.log('Rollback detected, skipping task')
    return
  }

  await db.insert(items)
})
```

### How It Works

1. **Atomic Rollback**: `rollback()` uses Redis locks to ensure atomicity with `atomic()` operations.
2. **Epoch Mechanism**: Each rollback increments an epoch counter. Tasks started before a rollback will have a different epoch than the current one.
3. **Automatic Cleanup**: Rollback automatically cleans up running tasks, failed queues, and concurrency slots in Redis.
4. **Epoch Validation**: Workers can use `validate(epoch)` to detect rollbacks and skip processing outdated tasks.

### Important Notes

* Rollback requires Redis (for distributed coordination).
* After rollback, tasks with mismatched epochs will be automatically discarded.
* Use `onHandleRollback` to clean up data that needs to be re-indexed.
* For reindex scenarios, use upsert operations in your business logic, not insert.

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
