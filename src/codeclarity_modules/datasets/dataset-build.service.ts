import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { Repository } from "typeorm";

import { GithubIntegrationService } from "src/base_modules/integrations/github/github.service";
import { createGithubClient } from "src/base_modules/integrations/github/githubSearch";
import { CodeClarityLogger } from "src/services/logger.service";
import { APIError } from "src/types/error.types";

import { Dataset, DatasetStatus } from "./dataset.entity";
import {
  buildDataset,
  BuildResult,
  GithubRateLimited,
} from "./dataset-builder";
import { DatasetEntry } from "./dataset-entry.entity";

/** How often BUILDING datasets nobody holds are looked for */
const TICK_MS = 15_000;
/** A build that stops renewing its lease for this long is picked up again */
const LEASE_SECONDS = 120;
/** The lease is renewed at most this often, before a GitHub request */
const RENEW_EVERY_MS = 30_000;
/** Short rate limit waits are sat out inside the request */
const MAX_THROTTLE_WAIT_SECONDS = 60;
const INSERT_CHUNK = 500;
const ERROR_MAX_LENGTH = 1000;

/**
 * The text to show for a failed build. API errors (token problems included)
 * carry it in error_message: their Error.message is empty.
 */
export function describeBuildError(err: unknown): string {
  if (err instanceof APIError && err.error_message) return err.error_message;
  if (err instanceof Error && err.message) return err.message;
  return err instanceof Error ? err.name : String(err);
}

/** Another instance took over the build, or the dataset was deleted. */
export class DatasetLeaseLost extends Error {
  constructor() {
    super("Dataset build lease lost");
    this.name = "DatasetLeaseLost";
  }
}

/**
 * Builds BUILDING datasets in the background. Progress lives in Postgres, not
 * in memory: a build holds a lease on its row and renews it while it works,
 * so a build interrupted by a restart is picked up again (from scratch) once
 * its lease expires, by whichever API instance gets there first. Leases are
 * plain row updates, since session advisory locks don't survive pgbouncer's
 * transaction pooling.
 */
@Injectable()
export class DatasetBuildService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = CodeClarityLogger.forService("DatasetBuilder");
  private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID()}`;
  private readonly enabled = process.env["DATASET_BUILDER_ENABLED"] !== "false";
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private tickRequested = false;
  private stopped = false;

  constructor(
    private readonly githubIntegrationService: GithubIntegrationService,
    @InjectRepository(Dataset, "codeclarity")
    private readonly datasetRepository: Repository<Dataset>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.enabled) this.schedule(0);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /** Look for work now rather than at the next tick (a dataset was created). */
  kick(): void {
    if (!this.enabled || this.stopped) return;
    if (this.running) {
      this.tickRequested = true;
      return;
    }
    this.schedule(0);
  }

  /** Build every dataset that can be claimed, one after the other. */
  async tick(): Promise<void> {
    if (this.running) {
      this.tickRequested = true;
      return;
    }
    this.running = true;
    try {
      for (;;) {
        const datasetId = await this.claimNext();
        if (!datasetId) break;
        await this.build(datasetId);
      }
    } catch (err) {
      this.logger.error(
        "Dataset build tick failed",
        err instanceof Error ? err : String(err),
      );
    } finally {
      this.running = false;
      const again = this.tickRequested;
      this.tickRequested = false;
      if (!this.stopped) this.schedule(again ? 0 : TICK_MS);
    }
  }

  /** Run one claimed build to READY, FAILED, or a later retry. */
  async build(datasetId: string): Promise<void> {
    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId },
      relations: { organization: true, integration: true },
    });
    if (!dataset) return;
    const logContext = {
      organizationId: dataset.organization.id,
      datasetId,
    };

    try {
      if (!dataset.integration) {
        throw new Error("The GitHub integration of this dataset was removed");
      }
      const token = await this.githubIntegrationService.getToken(
        dataset.integration.id,
      );
      const client = await createGithubClient(token.getToken(), {
        maxThrottleWaitSeconds: MAX_THROTTLE_WAIT_SECONDS,
      });

      this.logger.log("Building dataset", { ...logContext, ...dataset.params });
      let lastRenewal = Date.now();
      const result = await buildDataset(client, dataset.params, {
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        beforeRequest: async () => {
          if (Date.now() - lastRenewal < RENEW_EVERY_MS) return;
          await this.renewLease(datasetId);
          lastRenewal = Date.now();
        },
      });

      await this.complete(datasetId, result);
      this.logger.log("Dataset built", {
        ...logContext,
        selected: result.stats.selected,
        probed: result.stats.probed,
      });
    } catch (err) {
      if (err instanceof DatasetLeaseLost) {
        this.logger.warn("Dataset build abandoned: lease lost", logContext);
        return;
      }
      if (err instanceof GithubRateLimited) {
        await this.release(datasetId, new Date(err.retryAt));
        this.logger.warn("Dataset build paused by the GitHub rate limit", {
          ...logContext,
          retryAt: new Date(err.retryAt).toISOString(),
        });
        return;
      }
      const message = describeBuildError(err);
      await this.fail(datasetId, message);
      this.logger.error(
        "Dataset build failed",
        err instanceof Error ? err : message,
        logContext,
      );
    }
  }

  /** Claim the oldest BUILDING dataset whose lease is free or expired. */
  async claimNext(): Promise<string | undefined> {
    const result = await this.datasetRepository
      .createQueryBuilder()
      .update(Dataset)
      .set({
        lease_owner: this.instanceId,
        lease_until: () => `now() + interval '${LEASE_SECONDS} seconds'`,
      })
      .where(
        `id = (SELECT d.id FROM dataset d
               WHERE d.status = :status
                 AND (d.lease_until IS NULL OR d.lease_until < now())
               ORDER BY d.created_on
               LIMIT 1
               FOR UPDATE SKIP LOCKED)`,
        { status: DatasetStatus.BUILDING },
      )
      .returning(["id"])
      .execute();
    const rows = result.raw as { id: string }[];
    return rows[0]?.id;
  }

  /**
   * @throws {DatasetLeaseLost} If the lease is no longer ours
   */
  async renewLease(datasetId: string): Promise<void> {
    const result = await this.datasetRepository
      .createQueryBuilder()
      .update(Dataset)
      .set({ lease_until: () => `now() + interval '${LEASE_SECONDS} seconds'` })
      .where("id = :id AND lease_owner = :owner AND status = :status", {
        id: datasetId,
        owner: this.instanceId,
        status: DatasetStatus.BUILDING,
      })
      .execute();
    if (!result.affected) throw new DatasetLeaseLost();
  }

  /**
   * Store the entries and freeze the dataset, in one transaction.
   * @throws {DatasetLeaseLost} If the lease is no longer ours
   */
  async complete(datasetId: string, result: BuildResult): Promise<void> {
    await this.datasetRepository.manager.transaction(async (manager) => {
      const update = await manager
        .createQueryBuilder()
        .update(Dataset)
        .set({
          status: DatasetStatus.READY,
          stats: result.stats,
          error: null,
          built_on: new Date(),
          lease_owner: null,
          lease_until: null,
        })
        .where("id = :id AND lease_owner = :owner AND status = :status", {
          id: datasetId,
          owner: this.instanceId,
          status: DatasetStatus.BUILDING,
        })
        .execute();
      if (!update.affected) throw new DatasetLeaseLost();

      for (let i = 0; i < result.entries.length; i += INSERT_CHUNK) {
        await manager.insert(
          DatasetEntry,
          result.entries.slice(i, i + INSERT_CHUNK).map((entry) => ({
            ...entry,
            dataset: { id: datasetId },
          })),
        );
      }
    });
  }

  private async fail(datasetId: string, message: string): Promise<void> {
    await this.datasetRepository
      .createQueryBuilder()
      .update(Dataset)
      .set({
        status: DatasetStatus.FAILED,
        error: message.slice(0, ERROR_MAX_LENGTH),
        lease_owner: null,
        lease_until: null,
      })
      .where("id = :id AND lease_owner = :owner", {
        id: datasetId,
        owner: this.instanceId,
      })
      .execute();
  }

  /** Give the build back, to be claimed again no earlier than `retryAt`. */
  private async release(datasetId: string, retryAt: Date): Promise<void> {
    await this.datasetRepository
      .createQueryBuilder()
      .update(Dataset)
      .set({ lease_owner: null, lease_until: retryAt })
      .where("id = :id AND lease_owner = :owner", {
        id: datasetId,
        owner: this.instanceId,
      })
      .execute();
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
    this.timer.unref();
  }
}
