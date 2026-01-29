---
name: indexer-decorator
description: How to define an indexer using @Indexer decorator
---

# @Indexer Decorator

## Usage

The `@Indexer` decorator marks a class as an indexer and provides configuration.

```typescript
import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory } from 'nestjs-indexer'

@Injectable()
@Indexer('counter', { initial: 0 })
export class CounterIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 1
  }
}
```

## Configuration Options

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | **Required** - Unique identifier for the indexer |
| `initial` | `any` | Optional initial value (can also use `onHandleInitial()` method) |
| `concurrency` | `number` | Max global concurrent tasks (requires Redis) |
| `redis` | `RedisAdapter` | Redis adapter (required for concurrency mode) |
| `storage` | `Storage` | Storage adapter (optional, defaults to memory) |
| `runningTimeout` | `number` | Max task TTL for zombie cleanup (seconds, default: 60) |
| `retryTimeout` | `number` | Retention time for failed tasks (seconds, default: 60) |
| `concurrencyTimeout` | `number` | TTL for concurrency keys (seconds, default: `runningTimeout * 2`) |

## Key Points

* **Name Uniqueness**: Each indexer must have a unique name. This name is used as the storage key prefix.
* **Initial Value**: Can be set via decorator `initial` option or by implementing `onHandleInitial()` method. The method takes precedence.
* **Redis Requirement**: `concurrency`, `atomic()`, `consume()`, and `rollback()` require Redis adapter.
* **Storage Default**: If no storage is provided, uses in-memory storage (data lost on restart).
