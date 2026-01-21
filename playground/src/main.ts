import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import {
  withNestjsListen,
  withNestjsSwagger,
} from './bootstrap'

async function main() {
  const app = await NestFactory.create(AppModule)

  withNestjsSwagger(app, config => config
    .setTitle('Website')
    .setDescription('The website API')
    .setVersion('1.0'))

  withNestjsListen(app)
}

main()
