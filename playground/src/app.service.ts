/* eslint-disable no-console */
import type { Indexer } from 'nestjs-indexer'
import { delay } from '@hairy/utils'
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

  // @Interval(1000)
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

  @Interval(200)
  async handleTimer() {
    // 1. 检查是否已到达最新指标
    if (await this.timerIndexer.latest())
      return

    // 2. 检查是否已达到并发限制
    if (await this.timerIndexer.locked())
      return

    // 3. 使用 indexer.using 自动处理所有逻辑
    // - 优先处理失败任务
    // - 原子性获取 start 和 ended
    // - 并发控制
    // - 锁管理
    // - 成功/失败处理
    await this.timerIndexer.using(async (start, ended) => {
      const startFormatted = dayjs(start).format('HH:mm:ss')
      const endedFormatted = dayjs(ended).format('HH:mm:ss')

      // 随机失败（50%）
      if (Math.random() < 0.5) {
        throw new Error('Random failure')
      }

      await delay(1000)

      console.log('Indexer "timer" do something the next from', startFormatted, 'to', endedFormatted, 'success')
    })
  }
}
