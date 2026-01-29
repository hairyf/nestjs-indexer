---
name: "nestjs-indexer-helper"
description: "Assists with nestjs-indexer usage. Invoke when creating indexers, configuring scheduling, or handling distributed tasks. Author: Hairyf."
---

# NestJS Indexer Helper

This skill helps you work with the `nestjs-indexer` library, a distributed cursor indexing and scheduling framework.
**Author**: Hairyf

## Features
- **Atomicity**: Ensures unique indexing intervals via Redis locks.
- **Concurrency Control**: Built-in semaphore mechanism to limit global parallel tasks.
- **Self-healing**: Handles zombie task cleanup and automatic retries.
- **Storage Agnostic**: Supports Redis, Memory, FS, etc., via unstorage.

## Configuration Reference

### @Indexer(name, options)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | (Required) | Unique identifier for the indexer. Used for Redis keys and storage. |
| `initial` | `any` | `undefined` | The starting value of the index. Defaults to `0` or custom logic if not set. |
| `concurrency` | `number` | `undefined` | Global concurrency limit. If set, enables semaphore control. |
| `redis` | `RedisAdapter` | `undefined` | Redis adapter instance. **Required** for distributed mode (concurrency, atomic, consume). |
| `runningTimeout` | `number` | `60` | Max execution time (seconds) before a task is considered a zombie. |
| `retryTimeout` | `number` | `60` | Time (seconds) to keep failed tasks in the retry queue. |
| `concurrencyTimeout` | `number` | `2 * runningTimeout` | Auto-expiration for concurrency keys. |
| `storage` | `Storage` | Memory | Persistence layer for the index pointer. |

## API Reference

### IndexerFactory<T>

Base class for all indexers.

#### Lifecycle Hooks (Override these)

| Method | Returns | Description |
|--------|---------|-------------|
| `onHandleStep(current: T)` | `Promise<T>` | **(Required)** Calculates the next index value based on the current one. |
| `onHandleLatest(current: T)` | `Promise<boolean>` | Checks if the indexer has reached the end. Returns `true` to stop. |
| `onHandleInitial()` | `Promise<T>` | Returns the initial value if `initial` option is not set. |
| `onHandleRollback(from: T, to: T)` | `Promise<void>` | Called when a rollback occurs. Use for cleaning up dirty data. |
| `onHandleCleanup()` | `Promise<void>` | **(Distributed Only)** Implement this to call `this.cleanup()` periodically. |

#### Core Methods (Call these)

- **`atomic(): Promise<[T, T, number]>`**
  - **Use for**: Manual task handling.
  - **Returns**: `[start, ended, epoch]`
  - **Behavior**: Atomically gets current value, calculates next step, and advances pointer.
  - **Requires**: Redis adapter.

- **`consume(callback, options?): Promise<void>`**
  - **Use for**: Automatic distributed task handling.
  - **Params**:
    - `callback`: `(start: T, ended: T, epoch: number) => Promise<void>`
    - `options`: `{ retry?: boolean }`
  - **Behavior**: Checks concurrency, handles retries, calls `atomic()`, manages locks, and invokes callback.

- **`cleanup(): Promise<void>`**
  - **Use for**: Maintenance in distributed mode.
  - **Behavior**: Scans for zombie tasks (timed out) and moves them to the failed queue for retry.

- **`rollback(target: T): Promise<void>`**
  - **Use for**: Resetting the indexer to a previous state.
  - **Behavior**: Resets pointer, increments epoch (invalidating old tasks), and calls `onHandleRollback`.

- **`validate(epoch: number): Promise<boolean>`**
  - **Use for**: Checking if a task is still valid (not rolled back).
  - **Behavior**: Compares provided epoch with current global epoch.

## Usage Examples

### 1. Simple Sequential Indexer
Best for single-instance applications where tasks run one after another.

```typescript
import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory } from 'nestjs-indexer'

@Injectable()
@Indexer('user-sync', { initial: 0 })
export class UserIndexer extends IndexerFactory<number> {
  // Stop when we reach ID 10000
  async onHandleLatest(current: number): Promise<boolean> {
    return current >= 10000
  }

  // Process 100 users at a time
  async onHandleStep(current: number): Promise<number> {
    return current + 100
  }
}

// Usage in Service
// await this.userIndexer.atomic(); // Returns [0, 100, epoch]
```

### 2. Distributed Concurrent Indexer
Best for high-throughput clusters. Requires Redis.

```typescript
import { Injectable } from '@nestjs/common'
import { Redis } from 'ioredis'
import { Indexer, IndexerFactory, IoredisAdapter } from 'nestjs-indexer'

const redisClient = new Redis()

@Injectable()
@Indexer('email-sender', {
  initial: 0,
  concurrency: 10, // Max 10 parallel email batches across the cluster
  redis: new IoredisAdapter(redisClient),
  runningTimeout: 30, // Tasks taking >30s are considered dead
})
export class EmailIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 50 // Batch size
  }

  // Critical for distributed reliability
  @Interval(60000) // Run every minute
  async onHandleCleanup(): Promise<void> {
    await this.cleanup()
  }
}

// Usage in Service
// await this.emailIndexer.consume(async (start, ended) => {
//   await sendEmails(start, ended);
// });
```

### 3. Module Registration

In `app.module.ts`:

```typescript
import { IndexerModule } from 'nestjs-indexer'
import { UserIndexer } from './indexers/user.indexer'

@Module({
  imports: [
    IndexerModule.forRoot({
      indexers: [UserIndexer],
      // Optional: Shared storage for all indexers
      // storage: createStorage({ driver: redisDriver() })
    }),
  ],
})
export class AppModule {}
```
