/* eslint-disable no-console */
import type { Indexer } from 'nestjs-indexer'
import { delay, noop } from '@hairy/utils'
import { Injectable } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import dayjs from 'dayjs'
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
  @Redlock({ key: 'indexer:counter', ttl: 500 })
  // 单例模式，通过 redlock 保证每次只执行一个实例
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
  // 分布式并发，通过 indexer.consume，他会自动处理并发、失败重试、原子指标移动
  async handleTimer() {
    async function callback(start: number) {
      await delay(1000)
      if (Math.random() < 0.1)
        throw new Error('Random failure')
      console.log('Indexer "timer" do something from', dayjs(start).format('YYYY-MM-DD HH:mm:ss'))
    }

    // silent error
    await this.timerIndexer.consume(callback).catch(noop)
  }
}
