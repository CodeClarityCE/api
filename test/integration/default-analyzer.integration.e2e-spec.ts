import { type DataSource } from "typeorm";

import { Analyzer } from "../../src/base_modules/analyzers/analyzer.entity";
import { AnalyzersRepository } from "../../src/base_modules/analyzers/analyzers.repository";
import { AnalyzersService } from "../../src/base_modules/analyzers/analyzers.service";
import {
  AuthenticatedUser,
  ROLE,
} from "../../src/base_modules/auth/auth.types";
import { OrganizationMemberships } from "../../src/base_modules/organizations/memberships/organization.memberships.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "../../src/base_modules/shared/repositories";
import { User } from "../../src/base_modules/users/users.entity";
import { createDefaultAnalyzer } from "../../src/scripts/create-default-analyzer";
import { openScratchDatabase } from "../utils/scratch-database";

describe("create-default-analyzer job against Postgres", () => {
  let dataSource: DataSource;
  let service: AnalyzersService;

  beforeAll(async () => {
    dataSource = await openScratchDatabase("codeclarity_default_analyzer_it");
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    const unused = undefined as never;
    service = new AnalyzersService(
      unused,
      new MembershipsRepository(
        dataSource.getRepository(OrganizationMemberships),
      ),
      new OrganizationsRepository(dataSource.getRepository(Organization)),
      new UsersRepository(dataSource.getRepository(User)),
      new AnalyzersRepository(dataSource.getRepository(Analyzer)),
      unused,
      unused,
    );
  });

  // A user who owns a personal org, as signup creates.
  async function newUser(
    handle: string,
  ): Promise<{ user: AuthenticatedUser; orgId: string }> {
    const saved = await dataSource.getRepository(User).save({
      email: `${handle}@example.com`,
      password: "x",
      first_name: "First",
      last_name: "Last",
      handle,
      registration_verified: true,
      created_on: new Date(),
      activated: true,
      social: false,
      setup_done: true,
    });
    const org = await dataSource.getRepository(Organization).save({
      name: `${handle}'s Org`,
      description: "",
      color_scheme: "1",
      personal: true,
      created_on: new Date(),
      created_by: saved,
    });
    await dataSource.getRepository(OrganizationMemberships).save({
      user: saved,
      organization: org,
      role: MemberRole.OWNER,
      joined_on: new Date(),
    });
    return {
      user: new AuthenticatedUser(saved.id, [ROLE.USER], true),
      orgId: org.id,
    };
  }

  async function listed(handle: string): Promise<Analyzer[]> {
    const { user, orgId } = await newUser(handle);
    return (await service.getMany(orgId, {}, user)).data;
  }

  it("gives every user the default analyzer with the core plugins", async () => {
    await createDefaultAnalyzer(dataSource.getRepository(Analyzer));

    for (const handle of ["alice", "bobby"]) {
      const analyzers = await listed(handle);
      expect(analyzers.map((a) => a.name)).toEqual(["Default Analyzer"]);
      expect(
        analyzers[0]?.steps.map((stage) => stage.map((step) => step.name)),
      ).toEqual([
        ["js-sbom", "php-sbom"],
        ["vuln-finder", "license-finder"],
      ]);
      expect(analyzers[0]?.supported_languages).toEqual(["javascript", "php"]);
    }
  });

  it("creates no second analyzer when run again", async () => {
    await createDefaultAnalyzer(dataSource.getRepository(Analyzer));
    await createDefaultAnalyzer(dataSource.getRepository(Analyzer));

    expect((await listed("alice")).map((a) => a.name)).toEqual([
      "Default Analyzer",
    ]);
  });
});
