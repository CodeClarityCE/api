import type { EntityManager } from "typeorm";

import {
  RepositoryCache,
  type RepositoryType,
} from "src/base_modules/projects/repositoryCache.entity";

/** One repository as a provider's full listing returned it */
export interface ProviderRepository {
  /** The provider's stable repository id */
  provider_id: string;
  repository_type: RepositoryType;
  url: string;
  fully_qualified_name: string;
  description: string;
  visibility: string;
  default_branch: string;
  created_at: Date;
}

/**
 * Make an integration's repository cache match a provider listing: update
 * rows by provider id and add new ones. When the listing is complete, also
 * delete the rows it lacks. Rows cached before provider ids are matched by url.
 */
export async function syncRepositoryCache(
  manager: EntityManager,
  integrationId: string,
  listing: ProviderRepository[],
  { complete }: { complete: boolean },
): Promise<void> {
  await manager.transaction(async (tx) => {
    // Serializes concurrent syncs of one integration, across API instances too
    await tx.query(`SELECT 1 FROM "integration" WHERE "id" = $1 FOR UPDATE`, [
      integrationId,
    ]);

    const rows = await tx.find(RepositoryCache, {
      where: { integration: { id: integrationId } },
    });
    const byProviderId = new Map<string, RepositoryCache>();
    const legacyByUrl = new Map<string, RepositoryCache>();
    for (const row of rows) {
      if (row.provider_id) byProviderId.set(row.provider_id, row);
      else if (!legacyByUrl.has(row.url)) legacyByUrl.set(row.url, row);
    }

    const kept = new Set<string>();
    const toSave: RepositoryCache[] = [];
    const seen = new Set<string>();
    for (const repo of listing) {
      // A paged listing can return a repository twice
      if (seen.has(repo.provider_id)) continue;
      seen.add(repo.provider_id);

      let row = byProviderId.get(repo.provider_id);
      if (!row) {
        row = legacyByUrl.get(repo.url);
        legacyByUrl.delete(repo.url);
      }
      row ??= tx.create(RepositoryCache, {
        integration: { id: integrationId },
      });
      Object.assign(row, repo);
      if (row.id) kept.add(row.id);
      toSave.push(row);
    }

    const stale = complete ? rows.filter((row) => !kept.has(row.id)) : [];
    if (stale.length > 0) await tx.remove(stale);
    if (toSave.length > 0) await tx.save(toSave);
  });
}
