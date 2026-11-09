import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";

import {
  KnowledgeStatus,
  KnowledgeStatusService,
} from "../status/knowledge-status.service";

import {
  ADVISORY_SOURCES,
  dateKind,
  DisclosureLag,
  FIX_RELEASE_DATED_SOURCES,
  round,
  severityClass,
} from "./comparison.types";
import { fixedVersions, osvFixedVersions } from "./fixed-versions";
import { canonicalVulnerabilities } from "./canonical-vulnerability";
import { cvss3Score } from "./osv-score";

export interface KnowledgeDbSourceCoverage {
  source: string;
  status: string;
  comparable: boolean;
  // Active records, malicious package advisories and retired records left out.
  records: number;
  records_without_cve: number;
  // Distinct canonical vulnerabilities, resolved through transitive aliases.
  vulnerabilities: number;
  // Vulnerabilities no other comparable source has.
  only_source: number;
}

export interface KnowledgeDbOverlap {
  sources: [string, string];
  vulnerabilities: number;
  // Both sources hold a record from the same origin, so it is not corroboration.
  same_origin: number;
  corroborating: number;
}

export interface KnowledgeDbSeverityAgreement {
  sources: [string, string];
  // Vulnerabilities both sources score with CVSS v3.
  compared: number;
  class_disagreements: number;
  mean_score_difference: number | null;
}

export interface KnowledgeDbAffectedAgreement {
  sources: [string, string];
  // Vulnerability and package pairs both sources give affected versions for.
  compared: number;
  fixed_version_disagreements: number;
  // FriendsOfPHP packages the OSV records of the same vulnerability do not name.
  package_not_named: number;
}

export interface KnowledgeDbSourceComparison {
  generated_at: string;
  sources: KnowledgeDbSourceCoverage[];
  overlap: KnowledgeDbOverlap[];
  severity: KnowledgeDbSeverityAgreement[];
  affected_versions: KnowledgeDbAffectedAgreement[];
  disclosure_lag: DisclosureLag[];
}

// Every active advisory record with its ID, aliases, earliest CVE, origin, date and CVSS v3 score or vector.
const RECORDS_SQL = String.raw`
  CREATE TEMP TABLE comparison_record ON COMMIT DROP AS
  SELECT *, COALESCE(cve, upper(node)) AS vulnerability FROM (
    SELECT 'osv'::text AS source, osv_id AS record_id, osv_id AS node,
      ARRAY(
        SELECT a FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(aliases) = 'array' THEN aliases ELSE '[]' END
        ) a
        UNION ALL SELECT cve WHERE COALESCE(cve, '') <> ''
      ) AS links,
      (SELECT upper(trim(a)) FROM (
         SELECT osv_id AS a UNION ALL SELECT cve
         UNION ALL SELECT jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(aliases) = 'array' THEN aliases ELSE '[]' END)
       ) ids WHERE upper(trim(a)) ~ '^CVE-\d{4}-\d{4,}$'
       ORDER BY split_part(upper(trim(a)), '-', 2)::int, split_part(upper(trim(a)), '-', 3)::numeric LIMIT 1
      ) AS cve,
      origin, published, NULL::float8 AS score,
      (SELECT s->>'score' FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(severity) = 'array' THEN severity ELSE '[]' END
       ) WITH ORDINALITY e(s, i) WHERE s->>'type' = 'CVSS_V3' ORDER BY i LIMIT 1) AS vector
    FROM osv WHERE retired_at IS NULL AND kind = 'vulnerability'
    UNION ALL
    SELECT 'friends_of_php', advisory_id, 'FRIENDSOFPHP-' || advisory_id,
      ARRAY_REMOVE(ARRAY[NULLIF(cve, '')], NULL), upper(NULLIF(trim(cve), '')),
      origin, published, NULL, NULL
    FROM friends_of_php WHERE retired_at IS NULL
    UNION ALL
    SELECT 'gcve', gcve_id, gcve_id, ARRAY_REMOVE(ARRAY[NULLIF(cve_id, '')], NULL),
      upper(NULLIF(trim(cve_id), '')), origin, date_published,
      (SELECT COALESCE(m->'cvssV3_1'->>'baseScore', m->'cvssV3_0'->>'baseScore')::float8
       FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(metrics) = 'array' THEN metrics ELSE '[]' END
       ) WITH ORDINALITY e(m, i) WHERE m ? 'cvssV3_1' OR m ? 'cvssV3_0' ORDER BY i LIMIT 1),
      NULL
    FROM gcve WHERE retired_at IS NULL
    UNION ALL
    SELECT 'nvd', nvd_id, nvd_id, '{}'::text[], upper(nvd_id), origin, published,
      COALESCE(metrics->'cvssMetricV31'->0->'cvssData'->>'baseScore',
               metrics->'cvssMetricV30'->0->'cvssData'->>'baseScore')::float8,
      NULL
    FROM nvd WHERE retired_at IS NULL
  ) r`;

// Records that can link vulnerabilities: OSV and FriendsOfPHP ones, and GCVE records another record names.
const ALIASED_RECORDS_SQL = `
  SELECT node, links FROM comparison_record WHERE source IN ('osv', 'friends_of_php')
  UNION ALL
  SELECT node, links FROM comparison_record WHERE source = 'gcve' AND upper(node) IN (
    SELECT upper(trim(l)) FROM comparison_record, unnest(links) l
    WHERE source IN ('osv', 'friends_of_php'))`;

// One row per source and vulnerability; the record with the smallest id gives the score.
const VULNERABILITIES_SQL = `
  CREATE TEMP TABLE comparison_vulnerability ON COMMIT DROP AS
  SELECT source, vulnerability, array_agg(DISTINCT origin) AS origins, min(published) AS published,
    (array_agg(score ORDER BY record_id) FILTER (WHERE score IS NOT NULL))[1] AS score,
    (array_agg(vector ORDER BY record_id) FILTER (WHERE vector IS NOT NULL))[1] AS vector
  FROM comparison_record GROUP BY source, vulnerability`;

const severityClassSql = (score: string): string =>
  `CASE WHEN ${score} = 0 THEN 'NONE' WHEN ${score} < 4 THEN 'LOW' WHEN ${score} < 7 THEN 'MEDIUM' WHEN ${score} < 9 THEN 'HIGH' ELSE 'CRITICAL' END`;

const PAIRS_FROM = `
  FROM comparison_vulnerability a
  JOIN comparison_vulnerability b ON b.vulnerability = a.vulnerability AND a.source < b.source
  WHERE a.source = ANY($1) AND b.source = ANY($1)`;

type Pair = [string, string];
const pairKey = (a: string, b: string): string => [a, b].sort().join("|");
const toPair = (a: string, b: string): Pair => [a, b].sort() as Pair;

@Injectable()
export class KnowledgeDbComparisonService {
  constructor(
    @InjectDataSource("knowledge")
    private readonly knowledgeDataSource: DataSource,
    private readonly statusService: KnowledgeStatusService,
  ) {}

  // The last comparison and the source state it was computed from.
  private cached: {
    key: string;
    result: Promise<KnowledgeDbSourceComparison>;
  } | null = null;

  /** Compares the knowledge sources over the whole knowledge database, reusing the last result until a source changes. */
  async compare(): Promise<KnowledgeDbSourceComparison> {
    const status = await this.statusService.get();
    const key = JSON.stringify(
      status.sources.map((s) => [s.source, s.status, s.watermark]),
    );
    if (this.cached?.key !== key) {
      const result = this.computeComparison(status);
      this.cached = { key, result };
      // A failed comparison is not kept.
      result.catch(() => {
        if (this.cached?.result === result) this.cached = null;
      });
    }
    return this.cached.result;
  }

  private async computeComparison(
    status: KnowledgeStatus,
  ): Promise<KnowledgeDbSourceComparison> {
    const statusOf = new Map<string, string>(
      status.sources.map((s) => [s.source, s.status]),
    );
    const comparable = ADVISORY_SOURCES.filter(
      (source) => statusOf.get(source) === "healthy",
    );

    return this.knowledgeDataSource.transaction(async (manager) => {
      await manager.query(RECORDS_SQL);
      await keyOnCanonicalVulnerability(manager);
      await manager.query(VULNERABILITIES_SQL);
      await manager.query(
        `CREATE INDEX ON comparison_vulnerability (vulnerability, source)`,
      );
      return {
        generated_at: new Date().toISOString(),
        sources: await coverage(manager, comparable, statusOf),
        overlap: await overlap(manager, comparable),
        severity: await severity(manager, comparable),
        affected_versions: await affectedVersions(manager, comparable),
        disclosure_lag: await disclosureLag(manager, comparable),
      };
    });
  }
}

// Rekeys records whose aliases lead to a different canonical vulnerability than their own earliest CVE.
async function keyOnCanonicalVulnerability(
  manager: EntityManager,
): Promise<void> {
  const records =
    await manager.query<{ node: string; links: string[] }[]>(
      ALIASED_RECORDS_SQL,
    );
  const names = canonicalVulnerabilities(
    records.map((r) => ({ id: r.node, aliases: r.links })),
  );
  // Keys are compared upper-cased, like the IDs the records are linked by.
  const changed = [...names]
    .map(([id, name]) => [id, name.toUpperCase()])
    .filter(([id, name]) => id !== name);
  if (changed.length === 0) return;
  await manager.query(
    `CREATE TEMP TABLE comparison_alias ON COMMIT DROP AS
     SELECT * FROM unnest($1::text[], $2::text[]) AS m(id, vulnerability)`,
    [changed.map(([id]) => id), changed.map(([, name]) => name)],
  );
  // A record joins through its own ID, or through its CVE when no other record names it.
  await manager.query(
    `UPDATE comparison_record r SET vulnerability = m.vulnerability
     FROM comparison_alias m WHERE m.id = upper(trim(r.node))`,
  );
  await manager.query(
    `UPDATE comparison_record r SET vulnerability = m.vulnerability
     FROM comparison_alias m WHERE m.id = r.cve`,
  );
}

async function coverage(
  manager: EntityManager,
  comparable: string[],
  statusOf: Map<string, string>,
): Promise<KnowledgeDbSourceCoverage[]> {
  const counts = await manager.query<
    {
      source: string;
      records: string;
      without_cve: string;
      vulnerabilities: string;
    }[]
  >(`SELECT source, count(*) AS records, count(*) FILTER (WHERE cve IS NULL) AS without_cve,
            count(DISTINCT vulnerability) AS vulnerabilities
     FROM comparison_record GROUP BY source`);
  const only = await manager.query<{ source: string; total: string }[]>(
    `SELECT v.source, count(*) AS total FROM comparison_vulnerability v
     WHERE NOT EXISTS (
       SELECT 1 FROM comparison_vulnerability o
       WHERE o.vulnerability = v.vulnerability AND o.source <> v.source AND o.source = ANY($1))
     GROUP BY v.source`,
    [comparable],
  );
  const bySource = new Map(counts.map((row) => [row.source, row]));
  const onlyBySource = new Map(only.map((row) => [row.source, row.total]));
  return ADVISORY_SOURCES.map((source) => {
    const row = bySource.get(source);
    return {
      source,
      status: statusOf.get(source) ?? "unknown",
      comparable: comparable.includes(source),
      records: Number(row?.records ?? 0),
      records_without_cve: Number(row?.without_cve ?? 0),
      vulnerabilities: Number(row?.vulnerabilities ?? 0),
      only_source: Number(onlyBySource.get(source) ?? 0),
    };
  });
}

async function overlap(
  manager: EntityManager,
  comparable: string[],
): Promise<KnowledgeDbOverlap[]> {
  const rows = await manager.query<
    { a: string; b: string; total: string; same_origin: string }[]
  >(
    `SELECT a.source AS a, b.source AS b, count(*) AS total,
            count(*) FILTER (WHERE a.origins && b.origins) AS same_origin
     ${PAIRS_FROM} GROUP BY 1, 2 ORDER BY 1, 2`,
    [comparable],
  );
  return rows.map((row) => ({
    sources: [row.a, row.b],
    vulnerabilities: Number(row.total),
    same_origin: Number(row.same_origin),
    corroborating: Number(row.total) - Number(row.same_origin),
  }));
}

// OSV gives only vectors, so its scores are computed here; the other sources are compared in SQL.
async function severity(
  manager: EntityManager,
  comparable: string[],
): Promise<KnowledgeDbSeverityAgreement[]> {
  const totals = new Map<
    string,
    { sources: Pair; compared: number; disagreements: number; diff: number }
  >();
  const add = (
    a: string,
    b: string,
    compared: number,
    disagreements: number,
    diff: number,
  ): void => {
    const key = pairKey(a, b);
    const entry = totals.get(key) ?? {
      sources: toPair(a, b),
      compared: 0,
      disagreements: 0,
      diff: 0,
    };
    entry.compared += compared;
    entry.disagreements += disagreements;
    entry.diff += diff;
    totals.set(key, entry);
  };

  const scored = await manager.query<
    {
      a: string;
      b: string;
      total: string;
      disagreements: string;
      diff: number;
    }[]
  >(
    `SELECT a.source AS a, b.source AS b, count(*) AS total,
            count(*) FILTER (WHERE ${severityClassSql("a.score")} <> ${severityClassSql("b.score")}) AS disagreements,
            sum(abs(a.score - b.score)) AS diff
     ${PAIRS_FROM} AND a.score IS NOT NULL AND b.score IS NOT NULL
     GROUP BY 1, 2`,
    [comparable],
  );
  for (const row of scored) {
    add(row.a, row.b, Number(row.total), Number(row.disagreements), row.diff);
  }

  if (comparable.includes("osv")) {
    const vectors = await manager.query<
      { vector: string; source: string; score: number }[]
    >(
      `SELECT o.vector, b.source, b.score FROM comparison_vulnerability o
       JOIN comparison_vulnerability b ON b.vulnerability = o.vulnerability AND b.source <> 'osv'
       WHERE o.source = 'osv' AND o.vector IS NOT NULL
         AND b.score IS NOT NULL AND b.source = ANY($1)`,
      [comparable],
    );
    for (const row of vectors) {
      const osvScore = cvss3Score(row.vector);
      if (osvScore === null) continue;
      const differs = severityClass(osvScore) !== severityClass(row.score);
      add(
        "osv",
        row.source,
        1,
        differs ? 1 : 0,
        Math.abs(osvScore - row.score),
      );
    }
  }

  return [...totals.values()]
    .sort((x, y) => x.sources.join().localeCompare(y.sources.join()))
    .map((entry) => ({
      sources: entry.sources,
      compared: entry.compared,
      class_disagreements: entry.disagreements,
      mean_score_difference:
        entry.compared > 0 ? round(entry.diff / entry.compared) : null,
    }));
}

// Only OSV and FriendsOfPHP name packages; NVD and GCVE name products, compared per analysis instead.
async function affectedVersions(
  manager: EntityManager,
  comparable: string[],
): Promise<KnowledgeDbAffectedAgreement[]> {
  if (!comparable.includes("osv") || !comparable.includes("friends_of_php")) {
    return [];
  }
  const rows = await manager.query<
    {
      vulnerability: string;
      composer: string;
      branches: unknown;
      affected: unknown;
    }[]
  >(
    `SELECT fr.vulnerability, f.composer, f.branches, o.affected
     FROM comparison_record fr
     JOIN friends_of_php f ON f.advisory_id = fr.record_id
     JOIN comparison_record orr ON orr.source = 'osv' AND orr.vulnerability = fr.vulnerability
     JOIN osv o ON o.osv_id = orr.record_id
     WHERE fr.source = 'friends_of_php' AND f.composer IS NOT NULL`,
  );
  const byPackage = new Map<
    string,
    { fop: Set<string>; osv: Set<string>; named: boolean }
  >();
  for (const row of rows) {
    const key = `${row.vulnerability}|${row.composer.toLowerCase()}`;
    const entry = byPackage.get(key) ?? {
      fop: new Set<string>(),
      osv: new Set<string>(),
      named: false,
    };
    fixedVersions(row.branches).forEach((v) => entry.fop.add(v));
    const osv = osvFixedVersions(row.affected, row.composer);
    if (osv !== null) {
      entry.named = true;
      osv.forEach((v) => entry.osv.add(v));
    }
    byPackage.set(key, entry);
  }
  const result: KnowledgeDbAffectedAgreement = {
    sources: ["friends_of_php", "osv"],
    compared: 0,
    fixed_version_disagreements: 0,
    package_not_named: 0,
  };
  for (const entry of byPackage.values()) {
    if (!entry.named) {
      result.package_not_named++;
      continue;
    }
    result.compared++;
    const same =
      entry.fop.size === entry.osv.size &&
      [...entry.fop].every((v) => entry.osv.has(v));
    if (!same) result.fixed_version_disagreements++;
  }
  return result.compared + result.package_not_named > 0 ? [result] : [];
}

// Lag behind the earliest publication; fix-release dates never set that reference.
async function disclosureLag(
  manager: EntityManager,
  comparable: string[],
): Promise<DisclosureLag[]> {
  const fixRelease = [...FIX_RELEASE_DATED_SOURCES];
  const rows = await manager.query<
    {
      source: string;
      compared: string;
      first: string;
      median_days: number | null;
      mean_days: number | null;
    }[]
  >(
    `WITH dated AS (
       SELECT source, vulnerability, published FROM comparison_vulnerability
       WHERE source = ANY($1) AND published IS NOT NULL
     ), reference AS (
       SELECT vulnerability, min(published) AS published, count(*) AS publishers
       FROM dated WHERE NOT (source = ANY($2)) GROUP BY vulnerability
     ), lag AS (
       SELECT d.source, d.published = r.published AND NOT (d.source = ANY($2)) AS first,
              extract(epoch FROM d.published - r.published) / 86400 AS days
       FROM dated d JOIN reference r USING (vulnerability)
       WHERE d.source = ANY($2) OR r.publishers >= 2
     )
     SELECT source, count(*) AS compared, count(*) FILTER (WHERE first) AS first,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY days) AS median_days,
            avg(days)::float8 AS mean_days
     FROM lag GROUP BY source`,
    [comparable, fixRelease],
  );
  const bySource = new Map(rows.map((row) => [row.source, row]));
  return comparable.map((source) => {
    const row = bySource.get(source);
    return {
      source,
      date_kind: dateKind(source),
      compared: Number(row?.compared ?? 0),
      first: Number(row?.first ?? 0),
      median_days: row?.median_days == null ? null : round(row.median_days),
      mean_days: row?.mean_days == null ? null : round(row.mean_days),
    };
  });
}
