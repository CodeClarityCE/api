import { Controller, Get, Res } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { NonAuthEndpoint } from "../decorators/SkipAuthDecorator";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @NonAuthEndpoint()
  async getMetrics(@Res() res: FastifyReply): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    res.type("text/plain");
    res.send(metrics);
  }
}
