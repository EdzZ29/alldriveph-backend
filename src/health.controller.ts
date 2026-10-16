import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { DataSource } from 'typeorm';

@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('health')
  async health(@Res() reply: FastifyReply) {
    let database = false;
    try {
      await this.dataSource.query('SELECT 1');
      database = true;
    } catch {
      // reported below
    }
    return reply
      .status(database ? 200 : 503)
      .send({ status: database ? 'ok' : 'degraded', database });
  }
}
