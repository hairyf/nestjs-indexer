import { Injectable } from '@nestjs/common'
import { Indexer, IndexerFactory } from 'nestjs-indexer'

@Injectable()
@Indexer('counter', { initial: 0 })
export class CounterIndexer extends IndexerFactory<number> {
  async onHandleStep(current: number): Promise<number> {
    return current + 1
  }

  async onHandleLatest(current: number): Promise<boolean> {
    return current >= 10
  }
}
