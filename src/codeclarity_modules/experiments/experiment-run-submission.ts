import { Injectable } from "@nestjs/common";

import { AnalysesRepository } from "src/base_modules/analyses/analyses.repository";
import { AnalysesService } from "src/base_modules/analyses/analyses.service";
import { AnalysisCreateBody } from "src/base_modules/analyses/analysis.types";
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
  ) {}

  /**
   * @returns the linked analysis id, or undefined if the run is no longer
   * pending, in which case nothing was saved or published
   * @throws {NotAuthorized} If the creator may no longer analyze the org's projects
   * @throws {EntityNotFound} If the integration no longer belongs to the org
   */
  async submit(request: RunSubmissionRequest): Promise<string | undefined> {
    const { experiment, runId, entry, head, creator } = request;
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
        analysisBody(experiment, orgId, projectId, head),
        creator,
        {
          inTransaction: async (manager, analysisId) => {
            if (!(await this.store.linkRun(manager, runId, analysisId))) {
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
