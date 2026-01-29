---
name: consume-method
description: High-level consume method with concurrency and retry logic
---

# Consume Method

## Usage

The `consume()` method is a high-level API that integrates atomic operations, concurrency control, failure retries, and zombie task cleanup.

```typescript
@Injectable()
export class AppService {
  constructor(
    private timerIndexer: TimerIndexer,
  ) {}

  @Interval(100)
  async handleTimer() {
    // Automatically handles:
    // - Atomic interval retrieval
    // - Concurrency limits
    // - Failed task retries
    // - Epoch validation
    await this.timerIndexer.consume(async (start, ended, epoch) => {
      // Your business logic here
      await this.processData(start, ended)

      // Optional: Validate epoch before committing
      if (!(await this.timerIndexer.validate(epoch))) {
        // Rollback occurred, skip this task
        return
      }

      await this.saveData(start, ended)
    })
  }
}
```

## Method Signature

```typescript
consume(
  callback: (start: T, ended: T, epoch: number) => Promise<void>,
  options?: { retry?: boolean }
): Promise<void>
```

## How It Works

1. **Concurrency Check**: If `concurrency` is set, checks if limit is reached. Returns early if so.
2. **Failed Task Priority**: Checks for failed tasks first. If found, retries that task.
3. **Latest Check**: Returns early if `latest()` returns `true`.
4. **Atomic Retrieval**: Calls `atomic()` to get next interval `[start, ended, epoch]`.
5. **Occupy Slot**: Registers task in concurrency queue.
6. **Execute Callback**: Calls your callback with `[start, ended, epoch]`.
7. **Error Handling**: On error, marks task as failed (if `retry: true`) and throws.
8. **Release Slot**: Always releases concurrency slot in `finally` block.

## Options

### `retry?: boolean` (default: `true`)

Controls whether failed tasks are added to retry queue.

```typescript
// Disable automatic retry
await indexer.consume(callback, { retry: false })
```

## Epoch Validation

The callback receives an `epoch` parameter. Use `validate(epoch)` to check if a rollback occurred:

```typescript
await indexer.consume(async (start, ended, epoch) => {
  // Process data
  const items = await this.processData(start, ended)

  // Validate before committing
  if (!(await indexer.validate(epoch))) {
    console.log('Rollback detected, skipping')
    return
  }

  // Safe to commit
  await db.insert(items)
})
```

## Error Handling

* **Epoch Mismatch**: If epoch doesn't match after error, task is **not** retried (rollback occurred).
* **Normal Errors**: If epoch matches, task is added to failed queue for retry.
* **Concurrency Limit**: Returns silently if concurrency limit is reached.

## Key Points

* **Requires Redis**: `consume()` requires Redis adapter and distributed lock.
* **Automatic Retry**: Failed tasks are automatically retried on next `consume()` call.
* **Zombie Cleanup**: Use `cleanup()` periodically to clean up timed-out tasks.
* **Concurrency Control**: Respects `concurrency` limit set in decorator config.
* **Production Note**: Built-in queue may not meet production requirements. Consider using BullMQ for production.
