import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Not, Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import { Result } from "../results/result.entity";

import { Experiment, ExperimentStatus } from "./experiment.entity";
import type { RunRows } from "./experiment-row-copy";
import { ExperimentRun, ExperimentRunStatus } from "./experiment-run.entity";
import { ExperimentRunSummaryRow } from "./experiment-run-summary-row.entity";
import { ExperimentVulnerabilityInstance } from "./experiment-vulnerability-instance.entity";

/** A runner that stops renewing its lease for this long is replaced */
export const EXPERIMENT_LEASE_SECONDS = 120;
const ERROR_MAX_LENGTH = 1000;
/** Instance rows per INSERT, well under Postgres's 65535 bind parameters */
const INSERT_CHUNK = 1000;

/** A jsonb value for a query builder set(), whose typing expects an entity. */
function jsonb(
  value: Record<string, unknown> | null,
): NonNullable<QueryDeepPartialEntity<Experiment>["provenance"]> | null {
  return value as NonNullable<QueryDeepPartialEntity<Experiment>["provenance"]>;
}

/** Another instance took over the experiment, or it was deleted. */
export class ExperimentLeaseLost extends Error {
  constructor() {
    super("Experiment lease lost");
    this.name = "ExperimentLeaseLost";
  }
}

/** Fields of a run the runner changes. */
export type RunPatch = Partial<
  Pick<
    ExperimentRun,
    | "status"
    | "error"
    | "attempts"
    | "branch"
    | "commit_hash"
    | "committed_at"
    | "submitted_on"
    | "first_submitted_on"
    | "ended_on"
  >
> & { analysis?: { id: string } };

export interface ExperimentFinish {
  status:
    | ExperimentStatus.COMPLETED
    | ExperimentStatus.CANCELLED
    | ExperimentStatus.FAILED;
  error?: string;
  provenance?: Record<string, unknown> | null;
}

/**
 * Where experiment and run state lives. Everything the runner knows is read
 * from here on each pass, so a restarted API resumes from it.
 *
 * A run is in flight once it has an analysis submitted (pending with
 * submitted_on set), and unsubmitted while pending without it.
 */
export abstract class ExperimentStore {
  /**
   * Lease the oldest experiment that still needs driving (PENDING, RUNNING,
   * or CANCELLED with analyses still finishing) whose lease is free, expired
   * or already ours.
   */
  abstract claimNext(
    owner: string,
    exclude: string[],
  ): Promise<string | undefined>;

  /** @throws {ExperimentLeaseLost} If the lease is no longer ours */
  abstract renewLease(id: string, owner: string): Promise<void>;

  /** Give the experiment back, to be claimed again no earlier than `retryAt`. */
  abstract release(id: string, owner: string, retryAt: Date): Promise<void>;

  /** With organization, created_by, dataset.integration and analyzer. */
  abstract getExperiment(id: string): Promise<Experiment | null>;

  /** The status as committed now, null if the experiment is gone. */
  abstract getStatus(id: string): Promise<ExperimentStatus | null>;

  /**
   * PENDING to RUNNING, with what was snapshotted at start.
   * @throws {ExperimentLeaseLost} If the lease is no longer ours
   */
  abstract start(
    id: string,
    owner: string,
    patch: Pick<Experiment, "analyzer_steps" | "provenance">,
  ): Promise<void>;

  /**
   * End the experiment and drop the lease. FAILED also skips every pending run.
   * @throws {ExperimentLeaseLost} If the lease is no longer ours
   */
  abstract finish(
    id: string,
    owner: string,
    finish: ExperimentFinish,
  ): Promise<void>;

  /**
   * PENDING or RUNNING to CANCELLED; unsubmitted runs are skipped, in-flight
   * runs are left to finish. False if the experiment had already ended.
   */
  abstract cancel(id: string): Promise<boolean>;

  /**
   * Skip the unsubmitted runs of a cancelled experiment, such as a failed
   * attempt that was set up for a retry while cancel committed.
   */
  abstract skipUnsubmitted(experimentId: string): Promise<void>;

  /** In-flight runs with their analysis and dataset entry. */
  abstract getInFlightRuns(experimentId: string): Promise<ExperimentRun[]>;

  /** Unsubmitted runs with their dataset entry, by entry rank. */
  abstract getUnsubmittedRuns(
    experimentId: string,
    limit: number,
  ): Promise<ExperimentRun[]>;

  /** In-flight runs across every experiment (the global cap). */
  abstract countInFlight(): Promise<number>;

  abstract countPending(experimentId: string): Promise<number>;

  /** Apply a patch to a run that is still pending. False if it was not. */
  abstract updateRun(runId: string, patch: RunPatch): Promise<boolean>;

  /** A plugin's stored result payload for an analysis, null if it has none. */
  abstract getPluginResult(analysisId: string, plugin: string): Promise<unknown>;

  /**
   * In one transaction, replace the run's copied rows with these and mark it
   * done. Copying a done run again replaces its rows. False, with nothing
   * written, if the run is failed or skipped.
   */
  abstract copyRunRows(
    experimentId: string,
    runId: string,
    rows: RunRows,
  ): Promise<boolean>;
}

/**
 * Leases are plain row updates, as in the dataset builder: session advisory
 * locks don't survive pgbouncer's transaction pooling.
 */
@Injectable()
export class TypeOrmExperimentStore extends ExperimentStore {
  constructor(
    @InjectRepository(Experiment, "codeclarity")
    private readonly experimentRepository: Repository<Experiment>,
    @InjectRepository(ExperimentRun, "codeclarity")
    private readonly runRepository: Repository<ExperimentRun>,
    @InjectRepository(Result, "codeclarity")
    private readonly resultRepository: Repository<Result>,
  ) {
    super();
  }

  async claimNext(
    owner: string,
    exclude: string[],
  ): Promise<string | undefined> {
    const result = await this.experimentRepository
      .createQueryBuilder()
      .update(Experiment)
      .set({
        lease_owner: owner,
        lease_until: () =>
          `now() + interval '${EXPERIMENT_LEASE_SECONDS} seconds'`,
      })
      .where(
        `id = (SELECT e.id FROM experiment e
               WHERE (e.status IN (:pending, :running)
                      OR (e.status = :cancelled AND e.ended_on IS NULL))
                 AND (e.lease_until IS NULL OR e.lease_until < now()
                      OR e.lease_owner = :owner)
                 AND e.id <> ALL(CAST(:exclude AS uuid[]))
               ORDER BY e.created_on
               LIMIT 1
               FOR UPDATE SKIP LOCKED)`,
        {
          pending: ExperimentStatus.PENDING,
          running: ExperimentStatus.RUNNING,
          cancelled: ExperimentStatus.CANCELLED,
          owner,
          exclude,
        },
      )
      .returning(["id"])
      .execute();
    const rows = result.raw as { id: string }[];
    return rows[0]?.id;
  }

  async renewLease(id: string, owner: string): Promise<void> {
    await this.updateHeld(id, owner, {
      lease_until: () =>
        `now() + interval '${EXPERIMENT_LEASE_SECONDS} seconds'`,
    });
  }

  async release(id: string, owner: string, retryAt: Date): Promise<void> {
    await this.updateHeld(id, owner, {
      lease_owner: null,
      lease_until: retryAt,
    });
  }

  async getExperiment(id: string): Promise<Experiment | null> {
    return this.experimentRepository.findOne({
      where: { id },
      relations: {
        organization: true,
        created_by: true,
        dataset: { integration: true },
        analyzer: true,
      },
    });
  }

  async getStatus(id: string): Promise<ExperimentStatus | null> {
    const experiment = await this.experimentRepository.findOne({
      where: { id },
      select: { id: true, status: true },
    });
    return experiment?.status ?? null;
  }

  async start(
    id: string,
    owner: string,
    patch: Pick<Experiment, "analyzer_steps" | "provenance">,
  ): Promise<void> {
    await this.updateHeld(id, owner, {
      status: ExperimentStatus.RUNNING,
      started_on: new Date(),
      analyzer_steps: patch.analyzer_steps ?? null,
      provenance: jsonb(patch.provenance ?? null),
    });
  }

  async finish(
    id: string,
    owner: string,
    finish: ExperimentFinish,
  ): Promise<void> {
    await this.experimentRepository.manager.transaction(async (manager) => {
      const update = await manager
        .createQueryBuilder()
        .update(Experiment)
        .set({
          status: finish.status,
          error: finish.error?.slice(0, ERROR_MAX_LENGTH) ?? null,
          ...(finish.provenance === undefined
            ? {}
            : { provenance: jsonb(finish.provenance) }),
          ended_on: new Date(),
          lease_owner: null,
          lease_until: null,
        })
        .where("id = :id AND lease_owner = :owner", { id, owner })
        .execute();
      if (!update.affected) throw new ExperimentLeaseLost();

      if (finish.status === ExperimentStatus.FAILED) {
        await manager.update(
          ExperimentRun,
          { experiment: { id }, status: ExperimentRunStatus.PENDING },
          {
            status: ExperimentRunStatus.SKIPPED,
            error: `experiment failed: ${finish.error ?? ""}`.slice(
              0,
              ERROR_MAX_LENGTH,
            ),
            ended_on: new Date(),
          },
        );
      }
    });
  }

  async cancel(id: string): Promise<boolean> {
    return this.experimentRepository.manager.transaction(async (manager) => {
      const update = await manager
        .createQueryBuilder()
        .update(Experiment)
        .set({ status: ExperimentStatus.CANCELLED })
        .where("id = :id AND status IN (:...statuses)", {
          id,
          statuses: [ExperimentStatus.PENDING, ExperimentStatus.RUNNING],
        })
        .execute();
      if (!update.affected) return false;
      await this.skipUnsubmittedWith(manager, id);
      return true;
    });
  }

  async skipUnsubmitted(experimentId: string): Promise<void> {
    await this.skipUnsubmittedWith(this.runRepository.manager, experimentId);
  }

  async getInFlightRuns(experimentId: string): Promise<ExperimentRun[]> {
    return this.runRepository.find({
      where: {
        experiment: { id: experimentId },
        status: ExperimentRunStatus.PENDING,
        submitted_on: Not(IsNull()),
      },
      relations: { analysis: true, dataset_entry: true },
    });
  }

  async getUnsubmittedRuns(
    experimentId: string,
    limit: number,
  ): Promise<ExperimentRun[]> {
    if (limit <= 0) return [];
    return this.runRepository.find({
      where: {
        experiment: { id: experimentId },
        status: ExperimentRunStatus.PENDING,
        submitted_on: IsNull(),
      },
      relations: { dataset_entry: true },
      order: { dataset_entry: { rank: "ASC" } },
      take: limit,
    });
  }

  async countInFlight(): Promise<number> {
    return this.runRepository.count({
      where: {
        status: ExperimentRunStatus.PENDING,
        submitted_on: Not(IsNull()),
      },
    });
  }

  async countPending(experimentId: string): Promise<number> {
    return this.runRepository.count({
      where: {
        experiment: { id: experimentId },
        status: ExperimentRunStatus.PENDING,
      },
    });
  }

  async updateRun(runId: string, patch: RunPatch): Promise<boolean> {
    const { analysis, ...fields } = patch;
    const result = await this.runRepository
      .createQueryBuilder()
      .update(ExperimentRun)
      .set({
        ...fields,
        ...(fields.error === undefined
          ? {}
          : { error: fields.error?.slice(0, ERROR_MAX_LENGTH) ?? null }),
        ...(analysis ? { analysis: { id: analysis.id } } : {}),
      })
      .where("id = :id AND status = :pending", {
        id: runId,
        pending: ExperimentRunStatus.PENDING,
      })
      .execute();
    return Boolean(result.affected);
  }

  async getPluginResult(analysisId: string, plugin: string): Promise<unknown> {
    const result = await this.resultRepository.findOne({
      where: { analysis: { id: analysisId }, plugin },
      select: { id: true, result: true },
    });
    return result?.result ?? null;
  }

  async copyRunRows(
    experimentId: string,
    runId: string,
    rows: RunRows,
  ): Promise<boolean> {
    return this.runRepository.manager.transaction(async (manager) => {
      // Locking the run serializes concurrent copies of it
      const run = await manager
        .createQueryBuilder(ExperimentRun, "run")
        .setLock("pessimistic_write")
        .where("run.id = :runId", { runId })
        .getOne();
      if (
        run?.status !== ExperimentRunStatus.PENDING &&
        run?.status !== ExperimentRunStatus.DONE
      ) {
        return false;
      }

      const owner = { experiment: { id: experimentId }, run: { id: runId } };
      await manager.delete(ExperimentVulnerabilityInstance, {
        run: { id: runId },
      });
      await manager.delete(ExperimentRunSummaryRow, { run: { id: runId } });
      await manager.insert(ExperimentRunSummaryRow, {
        ...rows.summary,
        ...owner,
      });
      for (let i = 0; i < rows.vulnerabilities.length; i += INSERT_CHUNK) {
        await manager.insert(
          ExperimentVulnerabilityInstance,
          rows.vulnerabilities
            .slice(i, i + INSERT_CHUNK)
            .map((row) => ({ ...row, ...owner })),
        );
      }
      await manager.update(
        ExperimentRun,
        { id: runId },
        {
          status: ExperimentRunStatus.DONE,
          error: null,
          ended_on: run.ended_on ?? new Date(),
        },
      );
      return true;
    });
  }

  private async skipUnsubmittedWith(
    manager: EntityManager,
    experimentId: string,
  ): Promise<void> {
    await manager.update(
      ExperimentRun,
      {
        experiment: { id: experimentId },
        status: ExperimentRunStatus.PENDING,
        submitted_on: IsNull(),
      },
      {
        status: ExperimentRunStatus.SKIPPED,
        error: "cancelled",
        ended_on: new Date(),
      },
    );
  }

  /** @throws {ExperimentLeaseLost} If the lease is no longer ours */
  private async updateHeld(
    id: string,
    owner: string,
    set: QueryDeepPartialEntity<Experiment>,
  ): Promise<void> {
    const result = await this.experimentRepository
      .createQueryBuilder()
      .update(Experiment)
      .set(set)
      .where("id = :id AND lease_owner = :owner", { id, owner })
      .execute();
    if (!result.affected) throw new ExperimentLeaseLost();
  }
}
