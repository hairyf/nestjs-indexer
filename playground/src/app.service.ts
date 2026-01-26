/* eslint-disable no-console */
import { delay, noop } from '@hairy/utils'
import { Injectable } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import dayjs from 'dayjs'
import { Redlock } from 'nestjs-redlock-universal'
import { CounterIndexer } from './indexers/counter.indexer'
import { TimerIndexer } from './indexers/timer.indexer'

@Injectable()
export class AppService {
  constructor(
    private counterIndexer: CounterIndexer,
    private timerIndexer: TimerIndexer,
  ) {}

  getHello(): string {
    return 'Hello World'
  }

  @Interval(1000)
  @Redlock({ key: 'indexer:counter', ttl: 500 })
  // Single instance mode, ensure only one instance is executed at a time
  async handleCounter() {
    // 1. check if the indexer is latest
    if (await this.counterIndexer.latest())
      return

    // 2. get the current index value
    const start = await this.counterIndexer.current()
    const ended = await this.counterIndexer.step(start)

    // 3. do something
    try {
      console.log('Indexer "counter" do something from', start, 'to', ended)
      await delay(500)

      // 4. step the indexer
      await this.counterIndexer.next() // or await this.indexer2.next(newDate)
    }
    catch {
    // if the task failed, do not step the indexer
    }
  }

  @Interval(100)
  // Distributed concurrency, through indexer.consume, it will automatically handle concurrency, failure retry, and atomic index movement
  async handleTimer() {
    const indexer = this.timerIndexer
    async function callback(start: number, ended: number, epoch: number) {
      // 可选：在 Worker 逻辑开始前验证 epoch
      if (!(await indexer.validate(epoch))) {
        console.log('Epoch mismatch, skipping task due to rollback')
        return
      }

      await delay(1000)
      if (Math.random() < 0.1)
        throw new Error('Random failure')
      console.log('Indexer "timer" do something from', dayjs(start).format('YYYY-MM-DD HH:mm:ss'))
    }

    // silent error
    await this.timerIndexer.consume(callback).catch(noop)
  }
}
