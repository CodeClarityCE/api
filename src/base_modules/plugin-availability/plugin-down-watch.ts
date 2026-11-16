import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";

import { CodeClarityLogger } from "src/services/logger.service";

import { PluginsRepository } from "../plugins/plugin.repository";

import { PluginAvailabilityService } from "./plugin-availability.service";

// How often registered plugins are checked, so an outage is logged unprompted
const CHECK_INTERVAL_MS = 30_000;

/** Checks every registered plugin on a timer, so a stopped one is warned about. */
@Injectable()
export class PluginDownWatch
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = CodeClarityLogger.forService("PluginDownWatch");
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly availability: PluginAvailabilityService,
    private readonly plugins: PluginsRepository,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Asks the state of each registered plugin; the service logs any outage. */
  async check(): Promise<void> {
    let names: string[];
    try {
      names = (await this.plugins.getAll()).flatMap((plugin) =>
        plugin.name ? [plugin.name] : [],
      );
    } catch (err) {
      this.logger.warn("Could not list plugins to watch", {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    await Promise.all(names.map((name) => this.availability.pluginState(name)));
  }
}
