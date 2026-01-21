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
    @InjectIndexer('indexer-2')
    private indexer2: Indexer<string>,
  ) {}

  @Cron('0 0 * * *')
  async handleTask() {
    // 1. check if the indexer is latest
    if (await this.indexer2.latest())
      return

    // 2. get the current index value
    const date = await this.indexer2.current()

    // 3. do something
    try {
      await this.doSomething(date)

      // 4. step the indexer
      await this.indexer2.next() // or await this.indexer2.next(newDate)
    }
    catch (e) {
      // if the task failed, do not step the indexer
    }
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
