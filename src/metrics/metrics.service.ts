import { Injectable } from "@nestjs/common";
import { Gauge, register } from "prom-client";

@Injectable()
export class MetricsService {
  private healthGauge: Gauge<string>;

  constructor() {
    // Create health status metric
    this.healthGauge = new Gauge({
      name: "service_health_status",
      help: "Health status of the service (1 = healthy, 0 = unhealthy)",
      labelNames: ["service", "component"],
    });

    // Set initial health status to healthy
    this.healthGauge.set({ service: "api", component: "overall" }, 1);
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  setHealthStatus(status: number): void {
    this.healthGauge.set({ service: "api", component: "overall" }, status);
  }
}
