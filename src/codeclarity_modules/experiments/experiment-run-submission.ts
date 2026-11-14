import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";

import { AnalysesRepository } from "src/base_modules/analyses/analyses.repository";
import { AnalysesService } from "src/base_modules/analyses/analyses.service";
import { AnalysisCreateBody } from "src/base_modules/analyses/analysis.types";
import { Analyzer } from "src/base_modules/analyzers/analyzer.entity";
import { AnalyzersRepository } from "src/base_modules/analyzers/analyzers.repository";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { ProjectService } from "src/base_modules/projects/projects.service";

import { DatasetEntry } from "../datasets/dataset-entry.entity";

import { Experiment } from "./experiment.entity";
import { ExperimentStore } from "./experiment-store";
import { SBOM_PLUGIN, VULN_PLUGIN } from "./experiments.types";

/** The commit an experiment run analyzes, pinned before its first attempt. */
export interface PinnedHead {
  branch: string;
  commitHash: string;
  committedAt: Date | null;
  description: string | null;
}

export interface RunSubmissionRequest {
  experiment: Experiment;
  runId: string;
  entry: DatasetEntry;
  /** The GitHub integration the dataset resolved its repositories with */
  integrationId: string;
  head: PinnedHead;
  creator: AuthenticatedUser;
}

export interface ProbeSubmissionRequest extends Omit<
  RunSubmissionRequest,
  "runId"
> {
  probeId: string;
}

/** Longest analyzer name the analyzer table allows */
const ANALYZER_NAME_MAX = 25;
const PROBE_ANALYZER_PREFIX = "Experiment probes";

/** The SBOM-only analyzer fix probes run with (ADR 0005), one per js-sbom version. */
export function probeAnalyzerName(sbomVersion: string): string {
  const name = `${PROBE_ANALYZER_PREFIX} ${sbomVersion}`;
  if (name.length <= ANALYZER_NAME_MAX) return name;
  // Too long a version: a short hash keeps the name unique per version
  return `${PROBE_ANALYZER_PREFIX} ${createHash("sha256").update(sbomVersion).digest("hex").slice(0, 7)}`;
}

/** Thrown inside the transaction to roll back an analysis whose run ended. */
class RunEnded extends Error {}

/**
 * Submits the analysis of one experiment run: the run is linked to its analysis
 * in the same transaction that saves it, so no analysis outlives a failed link.
 */
@Injectable()
export class ExperimentRunSubmission {
  constructor(
    private readonly projectService: ProjectService,
    private readonly analysesService: AnalysesService,
    private readonly analysesRepository: AnalysesRepository,
    private readonly store: ExperimentStore,
    private readonly analyzersRepository: AnalyzersRepository,
  ) {}

  /**
   * @returns the linked analysis id, or undefined if the run is no longer
   * pending, in which case nothing was saved or published
   * @throws {NotAuthorized} If the creator may no longer analyze the org's projects
   * @throws {EntityNotFound} If the integration no longer belongs to the org
   */
  async submit(request: RunSubmissionRequest): Promise<string | undefined> {
    const { experiment, runId } = request;
    return this.create(
      request,
      (orgId, projectId) =>
        analysisBody(experiment, orgId, projectId, request.head),
      (manager, analysisId) => this.store.linkRun(manager, runId, analysisId),
    );
  }

  /**
   * Submit a fix probe: an analysis of the commit with the org's SBOM-only
   * analyzer, linked to the probe in the same transaction.
   * @returns the linked analysis id, or undefined if the probe is no longer pending
   */
  async submitProbe(
    request: ProbeSubmissionRequest,
  ): Promise<string | undefined> {
    const analyzerId = await this.probeAnalyzerId(request.experiment);
    return this.create(
      request,
      (orgId, projectId) =>
        probeBody(analyzerId, orgId, projectId, request.head),
      (manager, analysisId) =>
        this.store.linkProbe(manager, request.probeId, analysisId),
    );
  }

  private async create(
    request: Omit<RunSubmissionRequest, "runId">,
    body: (orgId: string, projectId: string) => AnalysisCreateBody,
    link: (manager: EntityManager, analysisId: string) => Promise<boolean>,
  ): Promise<string | undefined> {
    const { experiment, entry, head, creator } = request;
    const orgId = experiment.organization.id;
    const projectId = await this.projectService.importForExperiment(
      orgId,
      request.integrationId,
      {
        url: entry.git_url,
        full_name: entry.full_name,
        description: head.description,
        default_branch: head.branch,
      },
      creator,
    );
    try {
      return await this.analysesService.create(
        orgId,
        projectId,
        body(orgId, projectId),
        creator,
        {
          inTransaction: async (manager, analysisId) => {
            if (!(await link(manager, analysisId))) {
              throw new RunEnded();
            }
          },
        },
      );
    } catch (err) {
      if (err instanceof RunEnded) return undefined;
      throw err;
    }
  }

  /**
   * The org's SBOM-only analyzer for the experiment's js-sbom step, created
   * on first use. Keyed by version, so one in use is never changed.
   */
  private async probeAnalyzerId(experiment: Experiment): Promise<string> {
    const step = experiment.analyzer?.steps
      .flat()
      .find((s) => s.name === SBOM_PLUGIN);
    if (!step)
      throw new Error("The analyzer of this experiment has no js-sbom step");
    const orgId = experiment.organization.id;
    const name = probeAnalyzerName(step.version);
    const found = await this.analyzersRepository.findByNameAndOrganization(
      name,
      orgId,
    );
    if (found) return found.id;
    const created = await this.analyzersRepository.saveAnalyzer(
      Object.assign(new Analyzer(), {
        name,
        global: false,
        description: `Managed by experiments: SBOM-only analyses with js-sbom ${step.version} that date fixes to a commit`,
        created_on: new Date(),
        steps: [[step]],
        supported_languages: ["javascript"],
        language_config: { javascript: { plugins: [SBOM_PLUGIN] } },
        logo: "js",
        organization: { id: orgId },
        ...(experiment.created_by
          ? { created_by: { id: experiment.created_by.id } }
          : {}),
      }),
    );
    return created.id;
  }

  /** Stop an analysis that is still running; a finished one is left as is. */
  async abandon(analysisId: string): Promise<void> {
    await this.analysesRepository.cancelByIds([analysisId]);
  }
}

/** Same body as the archived harness, pinned to the SHA. */
function analysisBody(
  experiment: Experiment,
  orgId: string,
  projectId: string,
  head: PinnedHead,
): AnalysisCreateBody {
  return {
    analyzer_id: experiment.analyzer!.id,
    branch: head.branch,
    commit_hash: head.commitHash,
    schedule_type: "once",
    languages: ["javascript"],
    config: {
      [SBOM_PLUGIN]: {
        project: `${orgId}/projects/${projectId}/${head.commitHash}`,
        branch: head.branch,
      },
      [VULN_PLUGIN]: {},
      "license-finder": { licensePolicy: [] },
    },
  };
}

/** An SBOM-only analysis of the probed commit. */
function probeBody(
  analyzerId: string,
  orgId: string,
  projectId: string,
  head: PinnedHead,
): AnalysisCreateBody {
  return {
    analyzer_id: analyzerId,
    branch: head.branch,
    commit_hash: head.commitHash,
    schedule_type: "once",
    languages: ["javascript"],
    config: {
      [SBOM_PLUGIN]: {
        project: `${orgId}/projects/${projectId}/${head.commitHash}`,
        branch: head.branch,
      },
    },
  };
}
