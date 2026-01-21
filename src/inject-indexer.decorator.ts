import { Inject } from '@nestjs/common'

export const INDEXER_TOKEN_PREFIX = 'INDEXER_'

export function InjectIndexer(name: string) {
  return Inject(`${INDEXER_TOKEN_PREFIX}${name}`)
}
