import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AppService } from './app.service'

@Controller()
@ApiTags('app-controller')
export class AppController {
  constructor(private readonly service: AppService) {}
  @Get()
  async getHello(): Promise<string> {
    return this.service.getHello()
  }
}
