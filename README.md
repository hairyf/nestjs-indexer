# nestjs-indexer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

```typescript
import { createIndexer } from 'nestjs-indexer'
import { createStorage } from 'unstorage'

IndexerModule.forRoot({
  indexers: [
    createIndexer<number>({
      name: 'indexer-1',
      initial: process.env.INDEXER_1_INITIAL,
      step: current => current + 1,
    }),
    createIndexer<string>({
      name: 'indexer-2',
      initial: () => '2026-01-01',
      lastend: current => dayjs(current).isSame(dayjs(), 'day'),
    }),
  ]
})
```

```typescript
class AppService {
  constructor(
    @InjectIndexer('indexer-1')
    private indexer1: Indexer<number>,
  ) {}

  @Cron('0 0 * * *')
  async handleTask() {
    // 1. check if the indexer is latest
    if (await this.indexer1.latest())
      return

    // 2. get the current index value
    const start = await this.indexer1.current()
    const ended = await this.indexer1.step(start)

    // 3. do something
    try {
      await this.doSomething(start, ended)

      // 4. step the indexer
      await this.indexer2.next() // or await this.indexer2.next(newDate)
    }
    catch (e) {
      // if the task failed, do not step the indexer
    }
  }
}
```

支持并发：

```typescript
class AppService {
  constructor(
    @InjectIndexer('indexer')
    private indexer: Indexer<number>,
  ) {}

  @Interval(100)
  async handleTimer() {
    this.indexer.consume(
      // 3. use atomic to get start and end
      // 内部会使用 redis(indexer:timer:current) 确保原子性
      // const [start, end] = await indexer.atomic()
      // 内部会使用 redis(indexer:timer:step:{start}) 确保原子性
      async (start, ended) => {
        // ...doSomething
        // 该 promise 失败，自动记录失败任务，需要重试的 step 列表
        // 内部调用 indexer.fail(start)
      }
    )
  }
}
```

并发任务使用队列：

```typescript
class AppService {
  constructor(
    @InjectIndexer('indexer') private indexer: Indexer<number>,
    @InjectQueue('indexer') private queue: Queue,
  ) {}

  async addJob(start: number, ended: number) {
    await this.queue.add('pull', { start, ended, })
  }

  @Interval(100)
  async handleTimer() {
    this.indexer.consume((start, ended) => this.addJob(start, ended))
  }
}

@Processor('indexer')
class IndexerProcessor {
  constructor() {}

  @Process('pull')
  async handlePull(job: Job<{ start: number, ended: number }>) {
    const { start, ended } = job.data
  }
}
```

## License

[MIT](./LICENSE) License © [Hairyf](https://github.com/hairyf)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/nestjs-indexer?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/nestjs-indexer
[npm-downloads-src]: https://img.shields.io/npm/dm/nestjs-indexer?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/nestjs-indexer
[bundle-src]: https://img.shields.io/bundlephobia/minzip/nestjs-indexer?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=nestjs-indexer
[license-src]: https://img.shields.io/github/license/hairyf/nestjs-indexer.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/hairyf/nestjs-indexer/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/nestjs-indexer
