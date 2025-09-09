import { Controller, Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { MetricsService } from './metrics.service';
import { NonAuthEndpoint } from '../decorators/SkipAuthDecorator';

@Controller('metrics')
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) {}

    @Get()
    @NonAuthEndpoint()
    async getMetrics(@Res() res: FastifyReply) {
        const metrics = await this.metricsService.getMetrics();
        res.type('text/plain');
        res.send(metrics);
    }
}
