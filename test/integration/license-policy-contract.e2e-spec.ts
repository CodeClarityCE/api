import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { useGlobalHandlers } from "src/app.globals";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import { LicensePolicyController } from "src/codeclarity_modules/policies/license/license.controller";
import { LicensePolicyService } from "src/codeclarity_modules/policies/license/license.service";
import {
  Policy,
  PolicyType,
} from "src/codeclarity_modules/policies/policy.entity";

const ORG = "00000000-0000-4000-8000-000000000001";
const POLICY = "00000000-0000-4000-8000-0000000000aa";
const UNKNOWN = "00000000-0000-4000-8000-0000000000bb";

// A saved policy as TypeORM hands it back: a Policy instance with its creator.
function storedPolicy(): Policy {
  return Object.assign(new Policy(), {
    id: POLICY,
    name: "Permissive only",
    description: "Only permissive licenses",
    content: ["MIT", "Apache-2.0"],
    policy_type: PolicyType.LICENSE_POLICY,
    default: true,
    created_on: new Date("2026-10-01T09:00:00.000Z"),
    created_by: { id: "user-1", email: "john.doe@codeclarity.io" },
  });
}

describe("GET /org/:org/policies/license_policy/:policy over HTTP", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const policies = {
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === POLICY ? storedPolicy() : null),
      ),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [LicensePolicyController],
      providers: [
        LicensePolicyService,
        {
          provide: MembershipsRepository,
          useValue: { hasRequiredRole: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: OrganizationsRepository, useValue: {} },
        { provide: UsersRepository, useValue: {} },
        {
          provide: getRepositoryToken(Policy, "codeclarity"),
          useValue: policies,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    useGlobalHandlers(app);
    // Stands in for the auth guard
    app
      .getHttpAdapter()
      .getInstance()
      .addHook("preHandler", (request, _reply, done) => {
        (request as unknown as { user: AuthenticatedUser }).user =
          new AuthenticatedUser("user-1", [ROLE.USER], true);
        done();
      });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the saved policy", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/org/${ORG}/policies/license_policy/${POLICY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status_code: 200,
      status: "success",
      data: {
        id: POLICY,
        name: "Permissive only",
        description: "Only permissive licenses",
        content: ["MIT", "Apache-2.0"],
        policy_type: "LICENSE_POLICY",
        default: true,
        created_on: "2026-10-01T09:00:00.000Z",
        created_by: "john.doe@codeclarity.io",
      },
    });
  });

  it("answers an unknown policy with 404", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/org/${ORG}/policies/license_policy/${UNKNOWN}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error_code: "EntityNotFound" });
  });
});
