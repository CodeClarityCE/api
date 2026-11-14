import type { FindOptionsWhere, Repository } from "typeorm";

import { EntityInUse } from "src/types/error.types";

import type { Experiment } from "./experiment.entity";

/**
 * Refuse to delete something experiments still reference. A plain function
 * over the repository, not a provider: AnalyzersModule cannot import
 * ExperimentsModule, which already imports it.
 * @throws {EntityInUse} If an experiment matches `where`
 */
export async function assertNotUsedByExperiments(
  repository: Repository<Experiment>,
  where: FindOptionsWhere<Experiment>,
): Promise<void> {
  if (await repository.exists({ where })) throw new EntityInUse();
}
