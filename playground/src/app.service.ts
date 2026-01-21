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
  // 记录失败的任务，需要重试的 step 列表
  private readonly blockTasks = new Set<number>()

  constructor(
    @InjectIndexer('counter')
    private counterIndexer: Indexer<number>,
    @InjectIndexer('timer')
    private timerIndexer: Indexer<number>,
    private redlockService: RedlockService,
  ) {
    // 获取 timer indexer 的并发配置，默认为 1
    this.maxConcurrency = 5
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

  @Interval(200)
  async handleTimer() {
    // 并发控制：如果已达到最大并发数，跳过本次执行
    if (this.activeTaskCount >= this.maxConcurrency) {
      return
    }

    // 优先处理 block_tasks 中的失败任务
    if (this.blockTasks.size > 0) {
      const blockedStart = Array.from(this.blockTasks)[0]
      await this.retryBlockedTask(blockedStart)
      return
    }

    // 检查是否已到达最新指标
    if (await this.timerIndexer.latest())
      return

    // 获取当前索引值并计算下一步，同时预占这个 step
    // 使用锁确保原子性：获取 current、step 和预占的操作是原子的
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

          // 立即预占这个 step，更新 current 值
          // 这样下一个实例就能获取到下一个不同的 start 值，实现真正的并发
          await this.timerIndexer.next(ended)
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

    // 执行新任务（注意：current 已经在锁内预占了，所以不需要在任务中再次更新）
    await this.executeTask(start, ended, false, true)
  }

  /**
   * 重试被阻塞的任务
   */
  private async retryBlockedTask(start: number): Promise<void> {
    // 计算对应的 ended 值
    const ended = await this.timerIndexer.step(start)
    await this.executeTask(start, ended, true)
  }

  /**
   * 执行任务
   * @param start 起始值
   * @param ended 结束值
   * @param isRetry 是否为重试任务
   * @param isPreOccupied 是否已经预占了 current 值（新任务会在获取时预占，重试任务不会）
   */
  private async executeTask(start: number, ended: number, isRetry = false, isPreOccupied = false): Promise<void> {
    // 为每个 step 创建唯一的锁键，确保同一个 step 只有一个实例在执行
    const stepLockKey = `indexer:timer:step:${start}`

    // 增加活跃任务计数
    this.activeTaskCount++

    try {
      // 使用 Redlock 锁定每个 step，确保同一个 step 只有一个实例在执行
      // 如果获取锁失败（retryAttempts: 0），说明已经有其他实例在处理这个 step，跳过
      try {
        await this.redlockService.using(
          stepLockKey,
          async () => {
            const startFormatted = dayjs(start).format('HH:mm:ss')
            const endedFormatted = dayjs(ended).format('HH:mm:ss')

            try {
              if (isRetry) {
                console.log('Indexer "timer" retry blocked task from', startFormatted, 'to', endedFormatted)
              }
              // console.log('Indexer "timer" do something from', startFormatted, 'to', endedFormatted)
              // 随机失败（30%）
              if (Math.random() < 0.5) {
                throw new Error('Random failure')
              }
              await delay(1000)

              // 如果已经预占了 current 值，就不需要再次更新
              // 如果是重试任务，需要更新 current 值
              if (!isPreOccupied) {
                await this.redlockService.using(
                  'indexer:timer:current',
                  async () => {
                    // 再次检查 current 值，确保没有被其他实例更新
                    const current = await this.timerIndexer.current()
                    // 如果 current 不等于 start，说明已经被其他实例处理了，跳过
                    if (current !== start) {
                      return
                    }
                    // 更新 current 值
                    await this.timerIndexer.next(ended)
                  },
                  { ttl: 5000 },
                )
              }

              // 任务成功，从 block_tasks 中移除（如果存在）
              this.blockTasks.delete(start)

              console.log('Indexer "timer" do something the next from', startFormatted, 'to', endedFormatted, 'success')
            }
            catch (error) {
              // 如果任务失败，需要回滚预占的 current 值（如果已预占）
              if (isPreOccupied) {
                try {
                  await this.redlockService.using(
                    'indexer:timer:current',
                    async () => {
                      // 回滚 current 值到 start
                      await this.timerIndexer.next(start)
                    },
                    { ttl: 5000 },
                  )
                }
                catch {
                  // 回滚失败，记录错误但不影响主流程
                }
              }
              // 记录到 block_tasks
              this.blockTasks.add(start)
              const errorMessage = error instanceof Error ? error.message : String(error)
              console.error('Indexer "timer" failed for step', startFormatted, 'to', endedFormatted, ':', errorMessage)
              throw error
            }
          },
          { ttl: 10000, retryAttempts: 0 }, // 不重试，如果锁被占用说明已经有其他实例在处理
        )
      }
      catch {
        // 如果获取 step 锁失败，说明已经有其他实例在处理这个 step
        // 如果已经预占了 current 值，需要回滚
        if (isPreOccupied) {
          try {
            await this.redlockService.using(
              'indexer:timer:current',
              async () => {
                // 回滚 current 值到 start
                await this.timerIndexer.next(start)
              },
              { ttl: 5000 },
            )
          }
          catch {
            // 回滚失败，记录错误但不影响主流程
          }
        }
      }
    }
    finally {
      // 减少活跃任务计数
      this.activeTaskCount--
    }
  }
}
