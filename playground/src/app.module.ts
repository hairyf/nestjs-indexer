import type { DynamicModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { IoredisAdapter, RedlockModule } from 'nestjs-redlock-universal'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { redis } from './services'

const imports = [
  redis.enable && RedlockModule.forRoot({
    nodes: [new IoredisAdapter(redis)],
    defaultTtl: 30000,
  }),
]

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: imports.filter(Boolean) as DynamicModule[],
})
export class AppModule {}
