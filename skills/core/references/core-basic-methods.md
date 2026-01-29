---
name: basic-methods
description: Core API methods: current, next, step, latest
---

# Basic Indexer Methods

## Usage

These methods provide the foundation for manual index management in single-instance mode.

```typescript
@Injectable()
export class AppService {
  constructor(
    private counterIndexer: CounterIndexer,
  ) {}

  @Cron('0 0 * * *')
  async handleTask() {
    // Check if indexing is complete
    if (await this.counterIndexer.latest())
      return

    // Get current index
    const start = await this.counterIndexer.current()

    // Calculate next index
    const ended = await this.counterIndexer.step(start)

    try {
      // Process data in range [start, ended)
      await this.doSomething(start, ended)

      // Move pointer forward
      await this.counterIndexer.next(ended)
    }
    catch (e) {
      // Task failed, pointer not moved
    }
  }
}
```

## Method Reference

### `current(): Promise<T>`

Returns the current index value from storage, or initial value if storage is empty.

```typescript
const current = await indexer.current()
// Returns stored value or initial value
```

### `next(value?: T): Promise<void>`

Sets the next index value. If `value` is provided, uses it directly. Otherwise, calculates using `step()`.

```typescript
// Set explicitly
await indexer.next(100)

// Calculate automatically
await indexer.next()
```

### `step(current?: T): Promise<T>`

Calculates the next index value by calling `onHandleStep()`. If `current` is not provided, uses `current()`.

```typescript
// Use current value
const next = await indexer.step()

// Provide explicit value
const next = await indexer.step(50)
```

### `latest(): Promise<boolean>`

Checks if the indexer has reached the latest benchmark by calling `onHandleLatest()`.

```typescript
const isComplete = await indexer.latest()
if (isComplete) {
  // Stop processing
}
```

## Key Points

* **Manual Control**: These methods give you full control over when to move the index pointer.
* **Error Handling**: In manual mode, you must handle errors and decide whether to move the pointer.
* **Single Instance**: These methods don't use Redis locks, suitable for single-instance deployments.
* **Storage Persistence**: Values are persisted to storage, surviving application restarts (if using persistent storage).
