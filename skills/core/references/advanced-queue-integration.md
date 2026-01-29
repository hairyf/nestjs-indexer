---
name: queue-integration
description: Integrating with message queues like BullMQ
---

# Queue Integration

## Usage

Use `atomic()` as an interval dispatcher combined with a message queue for maximum reliability in production.

```typescript
@Injectable()
@Indexer('timer', { 
  redis: new IoredisAdapter(redisClient) 
})
export class TimerIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 60000
  }
  // No need to implement onHandleCleanup when using queues
}
```

```typescript
import { Queue } from 'bullmq'
import { TimerIndexer } from './indexers/timer.indexer'

@Injectable()
export class AppService {
  constructor(
    private timerIndexer: TimerIndexer,
    private queue: Queue,
  ) {}

  @Interval(100)
  async handleTimer() {
    try {
      // Atomically get next interval
      const [start, ended, epoch] = await this.timerIndexer.atomic()
      
      // Dispatch to queue
      await this.queue.add('pull', { start, ended, epoch })
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

@Processor('indexer')
export class IndexerProcessor {
  constructor(
    private timerIndexer: TimerIndexer,
  ) {}

  @Process('pull')
  async handlePull(job: Job) {
    const { start, ended, epoch } = job.data
    
    // Validate epoch before processing
    if (!(await this.timerIndexer.validate(epoch))) {
      // Skip if rollback occurred
      return
    }
    
    // Process and save data
    await this.processData(start, ended)
  }
}
```

## Why Use Queues?

* **Reliability**: Queues provide job persistence, retries, and failure handling.
* **Scalability**: Workers can scale independently from dispatchers.
* **Monitoring**: Queue systems provide monitoring and observability tools.
* **Production Ready**: Built-in `consume()` queue may not meet production requirements.

## Architecture Pattern

1. **Dispatcher**: Uses `atomic()` to claim intervals and dispatch to queue.
2. **Queue**: Stores jobs with `{ start, ended, epoch }` payload.
3. **Workers**: Process jobs, validate epoch, and handle business logic.

## Epoch Validation

Always validate epoch in workers before committing data:

```typescript
@Process('pull')
async handlePull(job: Job) {
  const { start, ended, epoch } = job.data
  
  // Process data
  const items = await this.fetchData(start, ended)
  
  // Validate epoch before committing
  if (!(await this.timerIndexer.validate(epoch))) {
    // Rollback occurred, skip this job
    return
  }
  
  // Safe to commit
  await db.insert(items)
}
```

## Error Handling

Queue systems handle retries automatically. However, you should still validate epoch on each retry:

```typescript
@Process('pull')
async handlePull(job: Job) {
  const { start, ended, epoch } = job.data
  
  try {
    // Validate epoch
    if (!(await this.timerIndexer.validate(epoch))) {
      // Rollback occurred, don't retry
      throw new Error('Epoch mismatch, rollback detected')
    }
    
    // Process data
    await this.processData(start, ended)
  }
  catch (error) {
    // Queue will retry based on its configuration
    throw error
  }
}
```

## Key Points

* **Best Practice**: Use `atomic()` + queue for production deployments.
* **Epoch Validation**: Always validate epoch in workers before committing data.
* **No Cleanup Needed**: When using queues, you don't need to implement `onHandleCleanup()`.
* **Queue Choice**: Works with any queue system (BullMQ, RabbitMQ, AWS SQS, etc.).
* **Separation of Concerns**: Dispatcher handles interval claiming, queue handles job management, workers handle processing.
