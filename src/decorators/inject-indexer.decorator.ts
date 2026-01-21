import { Inject } from '@nestjs/common'
import { INDEXER_TOKEN_PREFIX } from '../constants'

export function InjectIndexer(name: string) {
  return Inject(`${INDEXER_TOKEN_PREFIX}${name}`)
}
