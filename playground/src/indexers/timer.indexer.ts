import { Injectable } from '@nestjs/common'
import dayjs from 'dayjs'
import { Indexer, IndexerFactory } from 'nestjs-indexer'
import { redis } from '../services'

@Injectable()
@Indexer('timer', {
  initial: dayjs().startOf('day').valueOf(),
  concurrency: 1000,
  redis: redis.adapter,
})
export class TimerIndexer extends IndexerFactory<number> {
  async onHandleInitial(): Promise<number> {
    return dayjs().startOf('day').valueOf()
  }

  async onHandleStep(current: number): Promise<number> {
    return dayjs(current).add(10, 'minute').valueOf()
  }

  async onHandleLatest(current: number): Promise<boolean> {
    return dayjs(current).isSame(dayjs(), 'minute') || dayjs(current).isAfter(dayjs(), 'minute')
  }
}
