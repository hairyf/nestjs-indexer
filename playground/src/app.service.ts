/* eslint-disable no-console */
import type { Indexer } from 'nestjs-indexer'
import { delay } from '@hairy/utils'
import { Injectable } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { InjectIndexer } from 'nestjs-indexer'
import { Redlock } from 'nestjs-redlock-universal'

@Injectable()
export class AppService {
  constructor(
    @InjectIndexer('counter')
    private counterIndexer: Indexer<number>,
    @InjectIndexer('timer')
    private timerIndexer: Indexer<number>,
  ) {}

  getHello(): string {
    return 'Hello World'
  }

  @Interval(1000)
  @Redlock({ key: 'indexer:counter' })
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
  async handleTimer() {
    async function callback(start: number, ended: number) {
      await delay(1000)
      if (Math.random() < 0.5)
        throw new Error('Random failure')
      console.log('Indexer "timer" do something the next from', start, 'to', ended, 'success')
    }
    try {
      await this.counterIndexer.consume(callback)
    }
    catch {
      // silent error
    }
  }
}
