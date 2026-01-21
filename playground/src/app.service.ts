/* eslint-disable no-console */
import type { Indexer } from 'nestjs-indexer'
import { delay } from '@hairy/utils'
import { Injectable } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import dayjs from 'dayjs'
import { InjectIndexer } from 'nestjs-indexer'
import { Redlock, RedlockService } from 'nestjs-redlock-universal'

@Injectable()
export class AppService {
  // 并发控制：当前正在执行的任务数量
  private activeTaskCount = 0
  private readonly maxConcurrency: number

  constructor(
    @InjectIndexer('counter')
    private counterIndexer: Indexer<number>,
    @InjectIndexer('timer')
    private timerIndexer: Indexer<number>,
    private redlockService: RedlockService,
  ) {
    // 获取 timer indexer 的并发配置，默认为 1
    this.maxConcurrency = this.timerIndexer.concurrency ?? 1
  }

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

  @Interval(500)
  async handleTimer() {
    // 并发控制：如果已达到最大并发数，跳过本次执行
    if (this.activeTaskCount >= this.maxConcurrency) {
      return
    }

    // 检查是否已到达最新指标
    if (await this.timerIndexer.latest())
      return

    // 获取当前索引值并计算下一步
    // 使用锁确保原子性：获取 current 和 step 的操作是原子的
    let start: number | undefined
    let ended: number | undefined
    const lockKey = 'indexer:timer:current'

    try {
      await this.redlockService.using(
        lockKey,
        async () => {
          if (await this.timerIndexer.latest())
            return

          start = await this.timerIndexer.current()
          ended = await this.timerIndexer.step(start)
        },
        { ttl: 5000 },
      )
    }
    catch {
      // 如果获取锁失败，说明有其他实例正在操作，跳过本次执行
      return
    }

    // 如果 latest 检查返回 true，说明在获取锁期间已经到达最新值
    if (start === undefined || ended === undefined)
      return

    // 为每个 step 创建唯一的锁键，确保同一个 step 只有一个实例在执行
    const stepLockKey = `indexer:timer:step:${start}`

    // 增加活跃任务计数
    this.activeTaskCount++

    try {
      // 使用 Redlock 锁定每个 step，确保同一个 step 只有一个实例在执行
      await this.redlockService.using(
        stepLockKey,
        async () => {
          const startFormatted = dayjs(start!).format('HH:mm:ss')
          const endedFormatted = dayjs(ended!).format('HH:mm:ss')

          try {
            console.log('Indexer "timer" do something from', startFormatted, 'to', endedFormatted)
            await delay(1000)

            // 只有在成功执行后才更新索引值
            await this.timerIndexer.next()
          }
          catch (error) {
            // 如果任务失败，不更新索引值，确保 current 值不会乱序
            console.error('Indexer "timer" failed for step', startFormatted, 'to', endedFormatted, error)
            throw error
          }
        },
        { ttl: 10000 }, // 设置足够的 TTL 以确保任务完成
      )
    }
    finally {
      // 减少活跃任务计数
      this.activeTaskCount--
    }
  }
}
