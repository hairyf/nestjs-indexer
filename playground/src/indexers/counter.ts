import { createIndexer } from 'nestjs-indexer'

export const counter = createIndexer<number>({
  name: 'counter',
  step: current => current + 1,
  lastend: current => current >= 10,
  initial: 0,
})
