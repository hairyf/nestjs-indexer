---
name: indexer-module
description: Setting up IndexerModule in NestJS applications
---

# IndexerModule Registration

## Usage

Register `IndexerModule` in your NestJS application root module.

```typescript
import { Module } from '@nestjs/common'
import { IndexerModule } from 'nestjs-indexer'
import { CounterIndexer } from './indexers/counter.indexer'
import { TimerIndexer } from './indexers/timer.indexer'

@Module({
  imports: [
    IndexerModule.forRoot({
      indexers: [CounterIndexer, TimerIndexer],
      // Optional: Configure persistent storage
      storage: createStorage({
        driver: redisDriver({ client: redisClient })
      })
    })
  ],
})
export class AppModule {}
```

## Configuration Options

### `indexers: Type<any>[]`

Array of indexer classes decorated with `@Indexer`. Each class must extend `IndexerFactory<T>`.

### `storage?: Storage`

Optional storage adapter for persisting index pointers. If not provided, defaults to in-memory storage.

**Important**: Without persistent storage, index pointers are lost on application restart.

## Storage Examples

### Redis Storage

```typescript
import { createStorage } from 'unstorage'
import { redisDriver } from 'unstorage/drivers/redis'

IndexerModule.forRoot({
  indexers: [CounterIndexer],
  storage: createStorage({
    driver: redisDriver({ client: redisClient })
  })
})
```

### File System Storage

```typescript
import { createStorage } from 'unstorage'
import { fsDriver } from 'unstorage/drivers/fs'

IndexerModule.forRoot({
  indexers: [CounterIndexer],
  storage: createStorage({
    driver: fsDriver({ base: './data' })
  })
})
```

## Dependency Injection

After registration, indexers are available for injection:

```typescript
import { Injectable } from '@nestjs/common'
import { CounterIndexer } from './indexers/counter.indexer'

@Injectable()
export class AppService {
  constructor(
    private counterIndexer: CounterIndexer,
  ) {}

  async processData() {
    const current = await this.counterIndexer.current()
    // ...
  }
}
```

## Key Points

* **Global Module**: `IndexerModule` is registered as a global module, available throughout the application.
* **Storage Sharing**: All indexers share the same storage instance unless overridden in decorator config.
* **Per-Indexer Storage**: You can override storage per indexer using the `@Indexer` decorator's `storage` option.
