/* eslint-disable no-console */
import type { Indexer } from 'nestjs-indexer'
import { delay } from '@hairy/utils'
import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectIndexer } from 'nestjs-indexer'

@Injectable()
export class AppService {
  constructor(
    @InjectIndexer('counter')
    private counterIndexer: Indexer<number>,
  ) {}

  getHello(): string {
    return 'Hello World'
  }

  @Cron('0 0 * * *')
  async handleCounter() {
  // 1. check if the indexer is latest
    if (await this.counterIndexer.latest())
      return

    // 2. get the current index value
    const start = await this.counterIndexer.current()
    const ended = await this.counterIndexer.step(start)

    // 3. do something
    try {
      console.log('do something', start, ended)
      await delay(1000)

      // 4. step the indexer
      await this.counterIndexer.next() // or await this.indexer2.next(newDate)
    }
    catch {
    // if the task failed, do not step the indexer
    }
  }
}
