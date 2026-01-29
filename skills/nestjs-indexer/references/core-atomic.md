---
name: atomic-operations
description: Atomic index interval retrieval for distributed environments
---

# Atomic Operations

## Usage

The `atomic()` method atomically retrieves the next index interval `[start, ended, epoch]` using Redis locks. This ensures no two instances claim the same interval in distributed environments.

```typescript
@Injectable()
export class AppService {
  constructor(
    private timerIndexer: TimerIndexer,
  ) {}

  @Interval(100)
  async handleTimer() {
    try {
      // Atomically get next interval
      const [start, ended, epoch] = await this.timerIndexer.atomic()

      // Process data
      await this.processData(start, ended, epoch)
    }
    catch (error) {
      if (error.message.includes('reached latest')) {
        // Indexing complete
        return
      }
      throw error
    }
  }
}
```

## Return Value

Returns a tuple `[start: T, ended: T, epoch: number]`:

* `start`: Current index value (beginning of interval)
* `ended`: Next index value (end of interval, exclusive)
* `epoch`: Version number for rollback detection

## How It Works

1. Acquires Redis lock on the current index pointer
2. Reads current index value
3. Checks if latest benchmark is reached (throws if true)
4. Calculates next value using `onHandleStep()`
5. **Immediately pre-claims** the next value (moves pointer forward)
6. Returns `[start, ended, epoch]`

## Important Behaviors

* **Pre-claiming**: The index pointer is moved **before** you process the data. This prevents other instances from claiming the same interval.
* **Lock Protection**: Uses Redis distributed lock to ensure atomicity across multiple instances.
* **Latest Check**: Throws error if `latest()` returns `true`.
* **Epoch Tracking**: Returns epoch number for rollback validation in workers.

## Error Handling

```typescript
try {
  const [start, ended, epoch] = await indexer.atomic()
  // Process data
}
catch (error) {
  if (error.message.includes('reached latest')) {
    // Indexing complete, stop processing
  }
  else {
    // Other error (lock timeout, etc.)
    throw error
  }
}
```

## Key Points

* **Requires Redis**: `atomic()` requires Redis adapter configured in `@Indexer` decorator.
* **Distributed Safe**: Multiple instances can call `atomic()` concurrently without conflicts.
* **No Retry Logic**: Unlike `consume()`, `atomic()` doesn't handle retries. You must implement retry logic yourself.
* **Use with Queues**: Often used with message queues (BullMQ, RabbitMQ) for maximum reliability.
