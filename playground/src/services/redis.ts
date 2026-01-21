import type { RedisOptions } from 'ioredis'
import process from 'node:process'
import { proxy } from '@hairy/utils'
import { Redis } from 'ioredis'

const redis = proxy<Redis, { enable: boolean }>(
  undefined,
  { enable: false },
  { strictMessage: 'Redis is not available, please check your environment variables.' },
)

if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
  const options: RedisOptions = {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT!),
  }
  redis.proxy.update(new Redis(options))
  redis.enable = true
}
else if (process.env.REDIS_URL) {
  redis.proxy.update(new Redis(process.env.REDIS_URL!))
  redis.enable = true
}

export { redis }
