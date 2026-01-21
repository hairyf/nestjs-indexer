import type { DynamicModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { IndexerModule } from 'nestjs-indexer'
import { IoredisAdapter, RedlockModule } from 'nestjs-redlock-universal'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { CounterIndexer } from './indexers/counter.indexer'
import { TimerIndexer } from './indexers/timer.indexer'
import { redis } from './services'
import { storage } from './storage'

const imports = [
  redis.enable && RedlockModule.forRoot({
    nodes: [new IoredisAdapter(redis)],
    defaultTtl: 30000,
  }),
  IndexerModule.forRoot({
    indexers: [
      CounterIndexer,
      TimerIndexer,
    ],
    storage,
  }),
  ScheduleModule.forRoot(),
]

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: imports.filter(Boolean) as DynamicModule[],
})
export class AppModule {}
