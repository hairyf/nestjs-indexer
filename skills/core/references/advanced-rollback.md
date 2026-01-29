---
name: rollback-feature
description: Rolling back index pointers and handling epoch validation
---

# Rollback Feature

## Usage

The rollback feature allows you to safely roll back the index pointer to a previous position, useful for handling chain forks, data corrections, or business logic changes.

```typescript
@Injectable()
@Indexer('timer', { redis: new IoredisAdapter(redisClient) })
export class TimerIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 60000
  }

  // Optional: Handle rollback business logic
  async onHandleRollback(from: number, to: number): Promise<void> {
    // Delete data in range [to, from) that needs to be re-indexed
    await this.deleteDataInRange(to, from)
  }
}
```

## Basic Rollback

```typescript
// Roll back to a specific position
await indexer.rollback(targetValue)
```

## How It Works

1. **Acquires Lock**: Uses Redis lock to ensure atomicity with `atomic()` operations.
2. **Calls Hook**: Invokes `onHandleRollback(from, to)` for business logic cleanup.
3. **Updates Pointer**: Sets index pointer to target value in storage.
4. **Cleans Redis State**: Removes running tasks, failed queues, and concurrency slots.
5. **Increments Epoch**: Increments epoch counter to invalidate in-flight tasks.

## Epoch Validation in Workers

When using `consume()` or `atomic()`, tasks receive an `epoch` parameter. Use `validate(epoch)` to detect rollbacks:

```typescript
await indexer.consume(async (start, ended, epoch) => {
  // Process data
  const items = await this.processData(start, ended)

  // Validate epoch before committing
  if (!(await indexer.validate(epoch))) {
    console.log('Rollback detected, skipping task')
    return
  }

  // Safe to commit
  await db.insert(items)
})
```

## Integration with BullMQ

When using `atomic()` with message queues:

```typescript
@Interval(100)
async handleTimer() {
  const [start, ended, epoch] = await this.timerIndexer.atomic()
  await this.queue.add('pull', { start, ended, epoch })
}

@Process('pull')
async handlePull(job: Job) {
  const { start, ended, epoch } = job.data

  // Validate epoch before processing
  if (!(await this.timerIndexer.validate(epoch))) {
    // Skip if rollback occurred
    return
  }

  // Process and save data
  await this.saveData(start, ended)
}
```

## Key Points

* **Requires Redis**: Rollback requires Redis adapter for distributed coordination.
* **Atomic Operation**: Rollback is atomic with `atomic()` operations via Redis locks.
* **Epoch Mechanism**: Each rollback increments epoch. Tasks with mismatched epochs are invalid.
* **Automatic Cleanup**: Rollback automatically cleans up running tasks, failed queues, and concurrency slots.
* **Business Logic**: Use `onHandleRollback()` to clean up data that needs re-indexing.
* **Reindex Strategy**: For reindex scenarios, use upsert operations in business logic, not insert.
