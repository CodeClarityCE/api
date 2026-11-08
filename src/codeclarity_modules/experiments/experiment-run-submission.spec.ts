import type { AnalysesRepository } from "src/base_modules/analyses/analyses.repository";
import type { AnalysesService } from "src/base_modules/analyses/analyses.service";
import type { AnalysisCreateBody } from "src/base_modules/analyses/analysis.types";
import type { Analyzer } from "src/base_modules/analyzers/analyzer.entity";
import type { AnalyzersRepository } from "src/base_modules/analyzers/analyzers.repository";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import type { ProjectService } from "src/base_modules/projects/projects.service";

import type { DatasetEntry } from "../datasets/dataset-entry.entity";

import type { Experiment } from "./experiment.entity";
import { ExperimentRunSubmission } from "./experiment-run-submission";
import type { ExperimentStore } from "./experiment-store";

/** Analyzers of one org, as the table holds them. */
class FakeAnalyzers {
  saved: Analyzer[] = [];
  lookupError: Error | undefined;

  async findByNameAndOrganization(
    name: string,
    orgId: string,
  ): Promise<Analyzer | null> {
    if (this.lookupError) throw this.lookupError;
    return (
      this.saved.find((a) => a.name === name && a.organization?.id === orgId) ??
      null
    );
  }

  async saveAnalyzer(analyzer: Analyzer): Promise<Analyzer> {
    const stored = Object.assign(analyzer, {
      id: analyzer.id ?? `analyzer-${this.saved.length + 1}`,
    });
    if (!this.saved.includes(stored)) this.saved.push(stored);
    return stored;
  }
}

function experiment(sbomVersion: string): Experiment {
  return {
    id: `exp-${sbomVersion}`,
    organization: { id: "org-1" },
    created_by: { id: "user-1" },
    analyzer: {
      id: "analyzer-js",
      steps: [
        [{ name: "js-sbom", version: sbomVersion, config: {} }],
        [{ name: "vuln-finder", version: "v2.0.0", config: {} }],
      ],
    },
  } as unknown as Experiment;
}

describe("ExperimentRunSubmission fix probes", () => {
  let analyzers: FakeAnalyzers;
  let bodies: AnalysisCreateBody[];
  let submission: ExperimentRunSubmission;

  beforeEach(() => {
    analyzers = new FakeAnalyzers();
    bodies = [];
    const analysesService = {
      create: async (
        _org: string,
        _project: string,
        body: AnalysisCreateBody,
        _creator: AuthenticatedUser,
        options: {
          inTransaction: (manager: unknown, id: string) => Promise<void>;
        },
      ) => {
        bodies.push(body);
        const id = `analysis-${bodies.length}`;
        await options.inTransaction(null, id);
        return id;
      },
    };
    submission = new ExperimentRunSubmission(
      {
        importForExperiment: async () => "project-1",
      } as unknown as ProjectService,
      analysesService as unknown as AnalysesService,
      {} as AnalysesRepository,
      { linkProbe: async () => true } as unknown as ExperimentStore,
      analyzers as unknown as AnalyzersRepository,
    );
  });

  function probe(exp: Experiment): Promise<string | undefined> {
    return submission.submitProbe({
      experiment: exp,
      probeId: "probe-1",
      entry: {
        git_url: "https://github.com/octo/app",
        full_name: "octo/app",
      } as DatasetEntry,
      integrationId: "integration-1",
      head: {
        branch: "main",
        commitHash: "d4e",
        committedAt: null,
        description: null,
      },
      creator: new AuthenticatedUser("user-1", [ROLE.USER], true),
    });
  }

  it("runs probes with an analyzer of the experiment's js-sbom step alone, named as managed by experiments", async () => {
    await probe(experiment("v1.0.0"));

    expect(analyzers.saved).toHaveLength(1);
    const [analyzer] = analyzers.saved;
    expect(analyzer!.name).toMatch(/experiment/i);
    expect(analyzer!.name).toContain("v1.0.0");
    expect(analyzer!.description).toMatch(/managed by experiments/i);
    expect(analyzer!.steps).toEqual([
      [{ name: "js-sbom", version: "v1.0.0", config: {} }],
    ]);
    expect(bodies[0]!.analyzer_id).toBe(analyzer!.id);
  });

  it("gives experiments with different js-sbom versions their own analyzer, never rewriting one in use", async () => {
    await probe(experiment("v1.0.0"));
    const first = structuredClone(analyzers.saved[0]!.steps);
    await probe(experiment("v1.1.0"));
    await probe(experiment("v1.0.0"));

    expect(analyzers.saved).toHaveLength(2);
    expect(analyzers.saved[0]!.steps).toEqual(first);
    expect(bodies.map((b) => b.analyzer_id)).toEqual([
      "analyzer-1",
      "analyzer-2",
      "analyzer-1",
    ]);
  });

  it("keeps probe analyzer names within the 25 characters analyzers allow, distinct per version", async () => {
    await probe(experiment("v1.0.0"));
    await probe(experiment("v1.0.0-beta.10+build.2"));
    await probe(experiment("v1.0.0-beta.10+build.3"));

    const names = analyzers.saved.map((a) => a.name);
    expect(names.every((n) => n.length <= 25)).toBe(true);
    expect(new Set(names).size).toBe(3);
  });

  it("fails the submission when the analyzer lookup fails", async () => {
    analyzers.lookupError = new Error("connection reset");

    await expect(probe(experiment("v1.0.0"))).rejects.toThrow(
      "connection reset",
    );
    expect(analyzers.saved).toEqual([]);
  });
});
