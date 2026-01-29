---
name: indexer-factory
description: Extending IndexerFactory and implementing required methods
---

# IndexerFactory Base Class

## Usage

Extend `IndexerFactory<T>` where `T` is the type of your index value (number, string, Date, etc.).

```typescript
import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory } from 'nestjs-indexer'

@Injectable()
@Indexer('timer', { initial: Date.now() })
export class TimerIndexer extends IndexerFactory<number> {
  // Required: Calculate next index value
  async onHandleStep(current: number): Promise<number> {
    return current + 60000 // Add 1 minute
  }

  // Optional: Check if reached latest benchmark
  async onHandleLatest(current: number): Promise<boolean> {
    return current >= Date.now()
  }

  // Optional: Custom initial value (overrides decorator initial)
  async onHandleInitial(): Promise<number> {
    return Date.now()
  }

  // Optional: Handle rollback business logic
  async onHandleRollback(from: number, to: number): Promise<void> {
    // Delete data in range [to, from) that needs re-indexing
    await this.deleteDataInRange(to, from)
  }
}
```

## Required Methods

### `onHandleStep(current: T): Promise<T> | T`

**Required**. Calculates the next index value from the current value.

* Can be async or sync
* Should return the next index value
* Used by `step()` and `atomic()` methods

## Optional Methods

### `onHandleLatest(current: T): Promise<boolean> | boolean`

Checks if the indexer has reached the latest benchmark. Default returns `false`.

* Return `true` to stop further indexing
* Used by `latest()` and `atomic()` methods
* `atomic()` throws error if latest is reached

### `onHandleInitial(): Promise<T>`

Gets the initial value. Default returns the `initial` value from decorator config.

* Overrides decorator `initial` option
* Called when storage is empty

### `onHandleRollback(from: T, to: T): Promise<void>`

Handles business logic during rollback (e.g., deleting dirty data).

* Called before updating the index pointer
* Use for cleanup operations that need to happen before rollback completes

## Key Points

* **Type Safety**: The generic type `T` ensures type safety across all methods.
* **Async Support**: All lifecycle methods support both sync and async implementations.
* **Error Handling**: If `onHandleStep` throws, the index pointer is not moved (manual mode) or task is retried (consume mode).
