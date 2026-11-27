import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";

import { CodeClarityLogger } from "src/services/logger.service";

import { RefreshTokensService } from "./refresh-tokens.service";

// How often expired and revoked refresh tokens are deleted
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Deletes expired and revoked refresh tokens at start-up and then every hour. */
@Injectable()
export class RefreshTokenSweep
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = CodeClarityLogger.forService("RefreshTokenSweep");
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly refreshTokens: RefreshTokensService) {}

  onApplicationBootstrap(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async sweep(): Promise<void> {
    try {
      const removed = await this.refreshTokens.deleteStale();
      if (removed > 0) {
        this.logger.log("Deleted stale refresh tokens", { removed });
      }
    } catch (err) {
      this.logger.warn("Could not delete stale refresh tokens", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
