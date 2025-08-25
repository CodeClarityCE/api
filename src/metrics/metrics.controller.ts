import { Controller, Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) {}

    @Get()
    async getMetrics(@Res() res: FastifyReply) {
        const metrics = await this.metricsService.getMetrics();
        res.type('text/plain');
        res.send(metrics);
    }
}
