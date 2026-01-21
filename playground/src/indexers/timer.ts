import dayjs from 'dayjs'
import { createIndexer } from 'nestjs-indexer'

export const timer = createIndexer<number>({
  name: 'timer',
  concurrency: 2,
  step: current => dayjs(current).add(10, 'minute').valueOf(),
  lastend: current => dayjs(current).isSame(dayjs(), 'minute') || dayjs(current).isAfter(dayjs(), 'minute'),
  initial: () => dayjs().startOf('day').valueOf(),
})
