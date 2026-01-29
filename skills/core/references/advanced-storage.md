---
name: storage-configuration
description: Setting up persistent storage for index pointers
---

# Storage Configuration

## Usage

Configure persistent storage to ensure index pointers survive application restarts.

```typescript
import { createStorage } from 'unstorage'
import { redisDriver } from 'unstorage/drivers/redis'
import { IndexerModule } from 'nestjs-indexer'

IndexerModule.forRoot({
  indexers: [CounterIndexer],
  storage: createStorage({
    driver: redisDriver({ client: redisClient })
  })
})
```

## Storage Options

### Redis Storage

```typescript
import { createStorage } from 'unstorage'
import { redisDriver } from 'unstorage/drivers/redis'

const storage = createStorage({
  driver: redisDriver({ 
    client: redisClient,
    base: 'indexer:' // Optional key prefix
  })
})
```

### File System Storage

```typescript
import { createStorage } from 'unstorage'
import { fsDriver } from 'unstorage/drivers/fs'

const storage = createStorage({
  driver: fsDriver({ 
    base: './data/indexers' // Directory path
  })
})
```

### MongoDB Storage

```typescript
import { createStorage } from 'unstorage'
import { mongodbDriver } from 'unstorage/drivers/mongodb'

const storage = createStorage({
  driver: mongodbDriver({
    connectionString: 'mongodb://localhost:27017',
    databaseName: 'myapp',
    collectionName: 'indexers'
  })
})
```

## Per-Indexer Storage

Override storage for a specific indexer:

```typescript
@Indexer('counter', {
  initial: 0,
  storage: createStorage({
    driver: fsDriver({ base: './data/counter' })
  })
})
export class CounterIndexer extends IndexerFactory<number> {
  // ...
}
```

## Storage Key Format

Indexers use the following storage key format:

```
indexer:{name}
```

For example, an indexer named `counter` uses the key `indexer:counter`.

## Default Behavior

If no storage is provided:

* Uses in-memory storage (data lost on restart)
* Suitable for development and testing
* Not recommended for production

## Key Points

* **Persistence**: Without persistent storage, index pointers are lost on restart.
* **Shared Storage**: All indexers share the same storage instance unless overridden.
* **Unstorage**: Uses [unstorage](https://github.com/unjs/unstorage) for storage abstraction.
* **Storage Key**: Each indexer uses `indexer:{name}` as its storage key.
* **Type Safety**: Storage values are serialized/deserialized automatically based on indexer type `T`.
