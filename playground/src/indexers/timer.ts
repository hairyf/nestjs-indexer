import dayjs from 'dayjs'
import { createIndexer } from 'nestjs-indexer'
import { IoredisAdapter } from 'nestjs-redlock-universal'
import { redis } from '../services'

export const timer = createIndexer<number>({
  name: 'timer',
  concurrency: 1000,
  redis: new IoredisAdapter(redis),
  step: current => dayjs(current).add(10, 'minute').valueOf(),
  lastend: current => dayjs(current).isSame(dayjs(), 'minute') || dayjs(current).isAfter(dayjs(), 'minute'),
  initial: () => dayjs().startOf('day').valueOf(),
})
