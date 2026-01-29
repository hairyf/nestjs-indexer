---
name: concurrency-control
description: Configuring and managing concurrent task execution
---

# Concurrency Control

## Usage

Configure global concurrency limits to control how many tasks can run simultaneously across all instances.

```typescript
@Injectable()
@Indexer('timer', {
  initial: Date.now(),
  concurrency: 50, // Global limit of 50 concurrent tasks
  redis: new IoredisAdapter(redisClient),
  runningTimeout: 120, // Task max execution time (seconds)
  retryTimeout: 180, // Failed task retention (seconds)
  concurrencyTimeout: 240, // Concurrency key TTL (seconds)
})
export class TimerIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 60000
  }

  @Interval(1000 * 60 * 15) // Every 15 minutes
  async onHandleCleanup(): Promise<void> {
    // Cleanup zombie tasks
    await this.cleanup()
  }
}
```

## Configuration Options

### `concurrency?: number`

Maximum number of concurrent tasks allowed globally across all instances.

* Requires Redis adapter
* `consume()` respects this limit and returns early if reached
* Each task occupies a slot until completion or timeout

### `runningTimeout?: number` (default: 60 seconds)

Maximum execution time for a task. Tasks exceeding this time are considered "zombie tasks" and moved to failed queue.

### `retryTimeout?: number` (default: 60 seconds)

How long failed tasks remain in the retry queue before expiring.

### `concurrencyTimeout?: number` (default: `runningTimeout * 2`)

TTL for concurrency queue keys. Should be slightly larger than `runningTimeout`.

## How It Works

1. **Occupy Slot**: When `consume()` starts, it adds task to concurrency queue and creates a "shadow key" with TTL.
2. **Shadow Key**: The shadow key expires after `runningTimeout`. If expired, task is considered zombie.
3. **Release Slot**: On completion, task is removed from queue and shadow key is deleted.
4. **Zombie Detection**: `cleanup()` checks shadow keys. Missing keys indicate zombie tasks.
5. **Retry**: Zombie tasks are moved to failed queue for retry.

## Cleanup

Periodically call `cleanup()` to remove zombie tasks:

```typescript
@Interval(1000 * 60 * 15) // Every 15 minutes
async onHandleCleanup(): Promise<void> {
  await this.cleanup()
}
```

Or manually:

```typescript
await indexer.cleanup()
```

## Key Points

* **Global Limit**: Concurrency limit is global across all instances, not per-instance.
* **Automatic Management**: `consume()` automatically manages concurrency slots.
* **Zombie Prevention**: Shadow keys with TTL prevent tasks from occupying slots indefinitely.
* **Cleanup Required**: Must call `cleanup()` periodically to handle zombie tasks.
* **Production Note**: Built-in queue may not meet production requirements. Consider BullMQ for production.
