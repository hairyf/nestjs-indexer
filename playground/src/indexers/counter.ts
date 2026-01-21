import { createIndexer } from 'nestjs-indexer'
import { IoredisAdapter } from 'nestjs-redlock-universal'
import { redis } from '../services'

export const counter = createIndexer<number>({
  name: 'counter',
  concurrency: 5,
  step: current => current + 1,
  lastend: current => current >= 10,
  initial: 0,
  redis: new IoredisAdapter(redis),
})
