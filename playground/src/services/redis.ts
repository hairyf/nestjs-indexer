import type { RedisOptions } from 'ioredis'
import process from 'node:process'
import { proxy } from '@hairy/utils'
import { Redis } from 'ioredis'
import { IoredisAdapter, RedisAdapter } from 'redlock-universal'

const redis = proxy<Redis, { enable: boolean, adapter: RedisAdapter | undefined }>(
  undefined,
  { enable: false, adapter: undefined },
  { strictMessage: 'Redis is not available, please check your environment variables.' },
)

if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
  const options: RedisOptions = {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT!),
  }
  const client = new Redis(options)
  redis.proxy.update(client)
  redis.adapter = new IoredisAdapter(client)
  redis.enable = true
}
else if (process.env.REDIS_URL) {
  const client = new Redis(process.env.REDIS_URL!)
  redis.proxy.update(client)
  redis.adapter = new IoredisAdapter(client)
  redis.enable = true
}

export { redis }
