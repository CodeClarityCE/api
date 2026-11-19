import { type DataSource } from "typeorm";

import {
  Analysis,
  AnalysisStatus,
} from "../../src/base_modules/analyses/analysis.entity";
import {
  AuthenticatedUser,
  ROLE,
} from "../../src/base_modules/auth/auth.types";
import { OrganizationMemberships } from "../../src/base_modules/organizations/memberships/organization.memberships.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import { Project } from "../../src/base_modules/projects/project.entity";
import { MembershipsRepository } from "../../src/base_modules/shared/repositories";
import { User } from "../../src/base_modules/users/users.entity";
import { DashboardService } from "../../src/codeclarity_modules/dashboard/dashboard.service";
import type { SeverityInfoByWeek } from "../../src/codeclarity_modules/dashboard/dashboard.types";
import { Result } from "../../src/codeclarity_modules/results/result.entity";
import {
  closeScratchDatabase,
  openScratchDatabase,
} from "../utils/scratch-database";

const DAY = 86_400_000;

// One score on each side of every CVSS class boundary.
const BOUNDARY_SCORES = [0, 0.1, 3.9, 4.0, 6.9, 7.0, 7.5, 8.9, 9.0, 10];

function vulnOutput(scores: number[], prefix: string): object {
  return {
    workspaces: {
      ".": {
        Vulnerabilities: scores.map((score, i) => ({
          VulnerabilityId: `${prefix}-${i}`,
          Severity: {
            Severity: score,
            Vector: "NETWORK",
            ConfidentialityImpactNumerical: 1,
            IntegrityImpactNumerical: 1,
            AvailabilityImpactNumerical: 1,
          },
        })),
      },
    },
    analysis_info: { status: "success" },
  };
}

function licenseOutput(dist: Record<string, number>): object {
  return { workspaces: {}, analysis_info: { stats: { license_dist: dist } } };
}

function weekTotals(weeks: SeverityInfoByWeek[]): Record<string, number> {
  const sum = (key: keyof SeverityInfoByWeek): number =>
    weeks.reduce((n, w) => n + (w[key] as number), 0);
  return {
    critical: sum("nmb_critical"),
    high: sum("nmb_high"),
    medium: sum("nmb_medium"),
    low: sum("nmb_low"),
    none: sum("nmb_none"),
  };
}

describe("Dashboard aggregates against Postgres", () => {
  let dataSource: DataSource;
  let service: DashboardService;
  let user: AuthenticatedUser;
  let creator: User;

  beforeAll(async () => {
    dataSource = await openScratchDatabase("codeclarity_dashboard_it");
  });

  afterAll(async () => {
    await closeScratchDatabase(dataSource);
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    service = new DashboardService(
      new MembershipsRepository(
        dataSource.getRepository(OrganizationMemberships),
      ),
      dataSource.getRepository(Organization),
    );
    creator = await dataSource.getRepository(User).save({
      email: "lead@example.com",
      password: "x",
      first_name: "Sec",
      last_name: "Lead",
      handle: "lead",
      registration_verified: true,
      created_on: new Date(),
      activated: true,
      social: false,
      setup_done: true,
    });
    user = new AuthenticatedUser(creator.id, [ROLE.USER], true);
  });

  async function org(name: string): Promise<Organization> {
    const saved = await dataSource.getRepository(Organization).save({
      name,
      description: "",
      color_scheme: "1",
      personal: false,
      created_on: new Date(),
      created_by: creator,
    });
    await dataSource.getRepository(OrganizationMemberships).save({
      user: creator,
      organization: saved,
      role: MemberRole.ADMIN,
      joined_on: new Date(),
    });
    return saved;
  }

  async function project(owner: Organization, name: string): Promise<Project> {
    return dataSource.getRepository(Project).save({
      added_on: new Date(),
      integration_type: "VCS",
      integration_provider: "GITHUB",
      invalid: false,
      downloaded: false,
      default_branch: "main",
      url: `https://github.com/acme/${name}`,
      name: `acme/${name}`,
      description: "",
      type: "GITHUB",
      organizations: [owner],
      added_by: creator,
    } as unknown as Project);
  }

  async function analysis(
    of: Project,
    createdOn: Date,
    status: AnalysisStatus,
    results: { plugin: string; result: object; created_on?: Date }[],
  ): Promise<void> {
    const saved = await dataSource.getRepository(Analysis).save({
      created_on: createdOn,
      config: {},
      stage: 0,
      status,
      steps: [],
      branch: "main",
      project: of,
    } as unknown as Analysis);
    for (const r of results) {
      await dataSource.getRepository(Result).save({
        analysis: saved,
        plugin: r.plugin,
        result: r.result as never,
        created_on: r.created_on ?? createdOn,
      });
    }
  }

  // A project analysed twice (plus a failed run after), and a second project
  // analysed six weeks ago, inside the default period of every endpoint.
  async function seedOrganisation(): Promise<string> {
    const o = await org("Org");
    const widget = await project(o, "widget");
    const now = Date.now();

    await analysis(widget, new Date(now - 3 * DAY), AnalysisStatus.SUCCESS, [
      { plugin: "vuln-finder", result: vulnOutput([9.8, 9.8, 9.8], "OLD") },
      { plugin: "license-finder", result: licenseOutput({ MIT: 5 }) },
    ]);
    const latest = new Date(now - 2 * DAY);
    await analysis(widget, latest, AnalysisStatus.COMPLETED, [
      // A redelivered copy stored before the newest row must not double count.
      {
        plugin: "vuln-finder",
        result: vulnOutput(BOUNDARY_SCORES, "NEW"),
        created_on: new Date(latest.getTime() - 1000),
      },
      { plugin: "vuln-finder", result: vulnOutput(BOUNDARY_SCORES, "NEW") },
      { plugin: "license-finder", result: licenseOutput({ MIT: 2, ISC: 1 }) },
    ]);
    await analysis(widget, new Date(now - DAY), AnalysisStatus.FAILED, [
      { plugin: "vuln-finder", result: vulnOutput([9.9], "FAILED") },
      { plugin: "license-finder", result: licenseOutput({ GPL: 9 }) },
    ]);

    const gadget = await project(o, "gadget");
    await analysis(gadget, new Date(now - 42 * DAY), AnalysisStatus.SUCCESS, [
      { plugin: "vuln-finder", result: vulnOutput([9.1, 5.5], "GADGET") },
      { plugin: "license-finder", result: licenseOutput({ MIT: 3 }) },
    ]);
    return o.id;
  }

  it("classes scores like the results pages", async () => {
    const orgId = await seedOrganisation();

    const recent = await service.getRecentVuls(orgId, user);

    expect(recent.vulns["NEW-0"]!.severity_class).toBe("NONE");
    expect(recent.vulns["NEW-1"]!.severity_class).toBe("LOW");
    expect(recent.vulns["NEW-2"]!.severity_class).toBe("LOW");
    expect(recent.vulns["NEW-3"]!.severity_class).toBe("MEDIUM");
    expect(recent.vulns["NEW-4"]!.severity_class).toBe("MEDIUM");
    expect(recent.vulns["NEW-5"]!.severity_class).toBe("HIGH");
    expect(recent.vulns["NEW-6"]!.severity_class).toBe("HIGH");
    expect(recent.vulns["NEW-7"]!.severity_class).toBe("HIGH");
    expect(recent.vulns["NEW-8"]!.severity_class).toBe("CRITICAL");
    expect(recent.vulns["NEW-9"]!.severity_class).toBe("CRITICAL");
  });

  it("leaves disputed vulnerabilities out of the grade", async () => {
    const o = await org("Disputed org");
    const widget = await project(o, "widget");
    const output = vulnOutput([9.8, 0], "DISPUTED") as {
      workspaces: Record<string, { Vulnerabilities: object[] }>;
    };
    output.workspaces["."]!.Vulnerabilities[0] = {
      ...output.workspaces["."]!.Vulnerabilities[0],
      Disputed: true,
    };
    await analysis(widget, new Date(Date.now() - DAY), AnalysisStatus.SUCCESS, [
      { plugin: "vuln-finder", result: output },
    ]);

    const quick = await service.getQuickStats(o.id, user);

    expect(quick.max_grade.score).toBe(10);
  });

  it("counts only each project's latest completed analysis", async () => {
    const orgId = await seedOrganisation();

    const recent = await service.getRecentVuls(orgId, user);
    const weeks = await service.getWeeklySeverityInfo(orgId, user);

    expect(Object.keys(recent.vulns).sort()).toEqual(
      [
        ...BOUNDARY_SCORES.map((_, i) => `NEW-${i}`),
        "GADGET-0",
        "GADGET-1",
      ].sort(),
    );
    expect(recent.severity_count).toEqual([
      { severity_class: "CRITICAL", count: 3 },
      { severity_class: "HIGH", count: 3 },
      { severity_class: "MEDIUM", count: 3 },
      { severity_class: "LOW", count: 2 },
      { severity_class: "NONE", count: 1 },
    ]);
    expect(weekTotals(weeks)).toEqual({
      critical: 3,
      high: 3,
      medium: 3,
      low: 2,
      none: 1,
    });
  });

  it("shows the same critical count on the tile and in weekly exposure", async () => {
    const orgId = await seedOrganisation();

    const recent = await service.getRecentVuls(orgId, user);
    const weeks = await service.getWeeklySeverityInfo(orgId, user);

    const tile = recent.severity_count.find(
      (c) => c.severity_class === "CRITICAL",
    )!.count;
    expect(weekTotals(weeks)["critical"]).toBe(tile);
  });

  it("lists each project once per week", async () => {
    const orgId = await seedOrganisation();

    const weeks = await service.getWeeklySeverityInfo(orgId, user);

    const projects = weeks.flatMap((w) => w.projects);
    expect(projects).toHaveLength(2);
    expect(new Set(projects).size).toBe(2);
  });

  it("sums licenses over each project's latest completed analysis", async () => {
    const orgId = await seedOrganisation();

    const licenses = await service.getOverallLicenseDist(orgId, user);

    expect(licenses).toEqual({ MIT: 5, ISC: 1 });
  });

  it("bases the other aggregates on the latest completed analysis", async () => {
    const orgId = await seedOrganisation();

    const vectors = await service.getOverallAttackVectorDist(orgId, user);
    const cia = await service.getOverallCIAImpact(orgId, user);
    const quick = await service.getQuickStats(orgId, user);

    expect(vectors).toEqual([{ attack_vector: "NETWORK", count: 12 }]);
    expect(cia).toHaveLength(36);
    expect(quick.nmb_projects).toBe(2);
  });

  it("labels a week with its ISO week and week-year", async () => {
    const o = await org("Calendar");
    const p = await project(o, "calendar");
    // Monday 30 December 2024 starts ISO week 1 of 2025.
    await analysis(
      p,
      new Date("2024-12-30T12:00:00Z"),
      AnalysisStatus.SUCCESS,
      [{ plugin: "vuln-finder", result: vulnOutput([9.5], "CAL") }],
    );

    const weeks = await service.getWeeklySeverityInfo(
      o.id,
      user,
      new Date("2024-12-01T00:00:00Z"),
      new Date("2025-01-31T00:00:00Z"),
    );

    expect(weeks.map((w) => w.week_number)).toEqual([{ week: 1, year: 2025 }]);
  });

  it("leaves out analyses after the end of the period", async () => {
    const o = await org("Ranged");
    const p = await project(o, "ranged");
    await analysis(
      p,
      new Date("2025-03-03T12:00:00Z"),
      AnalysisStatus.SUCCESS,
      [{ plugin: "vuln-finder", result: vulnOutput([9.5], "IN") }],
    );
    await analysis(
      p,
      new Date("2025-03-20T12:00:00Z"),
      AnalysisStatus.SUCCESS,
      [{ plugin: "vuln-finder", result: vulnOutput([1.0], "AFTER") }],
    );
    const start = new Date("2025-03-01T00:00:00Z");
    const end = new Date("2025-03-10T00:00:00Z");

    const recent = await service.getRecentVuls(o.id, user, start, end);
    const weeks = await service.getWeeklySeverityInfo(o.id, user, start, end);

    expect(Object.keys(recent.vulns)).toEqual(["IN-0"]);
    expect(weekTotals(weeks)["critical"]).toBe(1);
  });
});
