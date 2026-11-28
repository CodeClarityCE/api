import multipart from "@fastify/multipart";
import { ConfigModule } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import { getDataSourceToken } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { type DataSource } from "typeorm";

import { useGlobalHandlers } from "../../src/app.globals";
import { AppModule } from "../../src/app.module";
import {
  AnalysisPublisher,
  InMemoryAnalysisPublisher,
} from "../../src/base_modules/analyses/analysis-publisher";
import {
  ACCESS_COOKIE,
  CSRF_HEADER,
  REFRESH_COOKIE,
} from "../../src/base_modules/auth/session-cookies";
import { UPLOAD_FILE_SIZE_LIMIT } from "../../src/base_modules/file/upload-limits";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import { ORGANIZATION_TOKEN_PREFIX } from "../../src/base_modules/organizations/tokens/organization-token.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "../../src/base_modules/shared/repositories";
import { User } from "../../src/base_modules/users/users.entity";
import { validate } from "../../src/utils/validate-env";

import {
  createRunDatabase,
  dropRunDatabase,
  runDatabaseName,
} from "./run-database";

/** The session tokens a response set as cookies; a cleared cookie reads as "". */
export function sessionOf(response: { headers: Record<string, unknown> }): {
  accessToken: string | undefined;
  refreshToken: string | undefined;
} {
  const lines = [response.headers["set-cookie"] ?? []].flat();
  const valueOf = (name: string): string | undefined => {
    const line = (lines as string[]).find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).split(";")[0];
  };
  return {
    accessToken: valueOf(ACCESS_COOKIE),
    refreshToken: valueOf(REFRESH_COOKIE),
  };
}

/** The headers the web app sends on a sign-in: its cookies and the CSRF header. */
export function sessionHeaders(
  tokens: {
    accessToken?: string | undefined;
    refreshToken?: string | undefined;
  },
  extra: Record<string, string> = {},
): Record<string, string> {
  const cookies = [
    tokens.accessToken !== undefined &&
      `${ACCESS_COOKIE}=${tokens.accessToken}`,
    tokens.refreshToken !== undefined &&
      `${REFRESH_COOKIE}=${tokens.refreshToken}`,
  ].filter(Boolean);
  return {
    ...(cookies.length > 0 && { cookie: cookies.join("; ") }),
    [CSRF_HEADER]: "1",
    ...extra,
  };
}

export interface TestUser {
  user: User;
  organization: Organization;
  accessToken: string;
  refreshToken: string;
}

class IntegrationTestHelper {
  private app!: NestFastifyApplication;
  private dataSource!: DataSource;
  private usersRepository!: UsersRepository;
  private organizationsRepository!: OrganizationsRepository;
  private membershipsRepository!: MembershipsRepository;
  private database: string | undefined;

  async setupTestApp(): Promise<NestFastifyApplication> {
    // Each spec file gets its own database, so parallel runs never share one.
    this.database = runDatabaseName("codeclarity");
    await createRunDatabase(this.database);
    process.env["CODECLARITY_TEST_DB_NAME"] = this.database;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          validate,
          isGlobal: true,
          envFilePath: "env/.env.test",
          expandVariables: true,
        }),
        AppModule,
      ],
    })
      // Keep test analyses off the real queue.
      .overrideProvider(AnalysisPublisher)
      .useClass(InMemoryAnalysisPublisher)
      .compile();

    this.app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    // As main.ts does, so uploads parse the same way.
    await this.app.register(multipart, {
      limits: { fileSize: UPLOAD_FILE_SIZE_LIMIT },
    });

    // Same global setup as main.ts, so responses match the real API.
    useGlobalHandlers(this.app);

    // Get services for test data creation
    this.dataSource = moduleFixture.get<DataSource>(
      getDataSourceToken("codeclarity"),
    );
    this.usersRepository = moduleFixture.get<UsersRepository>(UsersRepository);
    this.organizationsRepository = moduleFixture.get<OrganizationsRepository>(
      OrganizationsRepository,
    );
    this.membershipsRepository = moduleFixture.get<MembershipsRepository>(
      MembershipsRepository,
    );

    await this.app.init();
    await this.app.getHttpAdapter().getInstance().ready();

    // Build the new database's schema from the entities.
    this.assertTestDatabase();
    await this.dataSource.synchronize(true);

    return this.app;
  }

  // Refuses to wipe a database that is not a test one, such as dev's.
  private assertTestDatabase(): void {
    const database = this.dataSource.options.database ?? "";
    if (typeof database !== "string" || !database.endsWith("_test")) {
      throw new Error(
        `Refusing to empty "${String(database)}": not a test database`,
      );
    }
  }

  async teardownTestApp(): Promise<void> {
    try {
      if (this.app) {
        await this.app.close();
      }
    } finally {
      if (this.database) {
        await dropRunDatabase(this.database);
        this.database = undefined;
      }
    }
  }

  async cleanDatabase(): Promise<void> {
    if (!this.dataSource) return;

    this.assertTestDatabase();

    // Get all entity metadata
    const entities = this.dataSource.entityMetadatas;

    const tables = [...new Set(entities.map((e) => `"${e.tableName}"`))];
    if (tables.length === 0) return;
    // DELETE takes no lock that blocks readers; replica mode skips foreign key
    // checks, so the tables empty in any order (needs a superuser, as tests use).
    await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL session_replication_role = replica");
      await manager.query(tables.map((t) => `DELETE FROM ${t};`).join(" "));
    });
  }

  async createTestUser(
    overrides: Partial<{
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      orgName: string;
      orgDescription: string;
      role: MemberRole;
      // Join this organization instead of creating a new one.
      organization: Organization;
    }> = {},
  ): Promise<TestUser> {
    const userData = {
      email: overrides.email ?? "test@example.com",
      password: overrides.password ?? "TestPassword123!",
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "User",
      orgName: overrides.orgName ?? "Test Organization",
      orgDescription:
        overrides.orgDescription ?? "Test organization description",
      role: overrides.role ?? MemberRole.ADMIN,
    };

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create user
    const user = new User();
    user.email = userData.email;
    user.password = hashedPassword;
    user.first_name = userData.firstName;
    user.last_name = userData.lastName;
    user.registration_verified = true;
    user.created_on = new Date();
    user.activated = true;
    user.social = false;
    user.setup_done = true;
    user.handle = userData.email.split("@")[0] ?? "user";

    const savedUser = await this.usersRepository.saveUser(user);

    // Create organization unless the test joins an existing one
    let savedOrganization = overrides.organization;
    if (!savedOrganization) {
      const organization = new Organization();
      organization.name = userData.orgName;
      organization.description = userData.orgDescription;
      organization.color_scheme = "1";
      organization.personal = false;
      organization.created_on = new Date();
      organization.created_by = savedUser;

      savedOrganization =
        await this.organizationsRepository.saveOrganization(organization);
    }

    // Create membership
    await this.membershipsRepository.saveMembership({
      user: savedUser,
      organization: savedOrganization,
      role: userData.role,
      joined_on: new Date(),
    } as any);

    // Log in through the real endpoint so the tokens pass real auth.
    const login = await this.makeRequest("POST", "/auth/authenticate", {
      email: userData.email,
      password: userData.password,
    });
    if (login.statusCode !== 201) {
      throw new Error(`Test user login failed: ${login.payload}`);
    }
    const tokens = sessionOf(login);

    return {
      user: savedUser,
      organization: savedOrganization,
      accessToken: tokens.accessToken!,
      refreshToken: tokens.refreshToken!,
    };
  }

  /** Adds an existing user to an existing organisation. */
  async addMembership(
    user: User,
    organization: Organization,
    role: MemberRole,
  ): Promise<void> {
    await this.membershipsRepository.saveMembership({
      user,
      organization,
      role,
      joined_on: new Date(),
    } as any);
  }

  async makeAuthenticatedRequest(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    accessToken: string,
    body?: any,
    headers: Record<string, string> = {},
  ): Promise<any> {
    const requestOptions: any = {
      method,
      url,
      // An Organization token goes as a bearer, as the CLI sends it; a user
      // access token as the web app sends it, a cookie with the CSRF header.
      headers: accessToken.startsWith(ORGANIZATION_TOKEN_PREFIX)
        ? { ...headers, Authorization: `Bearer ${accessToken}` }
        : sessionHeaders({ accessToken }, headers),
    };

    if (body) {
      // Fastify rejects a JSON content type with an empty body.
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.payload = JSON.stringify(body);
    }

    const request = this.app.inject(requestOptions);

    return request;
  }

  async makeRequest(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    body?: any,
    headers: Record<string, string> = {},
  ): Promise<any> {
    const requestOptions: any = {
      method,
      url,
      headers: { ...headers },
    };

    if (body) {
      // Fastify rejects a JSON content type with an empty body.
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.payload = JSON.stringify(body);
    }

    const request = this.app.inject(requestOptions);

    return request;
  }

  /** Refreshes as the web app does: the refresh cookie and the CSRF header. */
  async refresh(refreshToken: string | undefined): Promise<any> {
    return this.makeRequest(
      "POST",
      "/auth/refresh",
      undefined,
      sessionHeaders({ refreshToken }),
    );
  }

  /** Signs out as the web app does: the refresh cookie and the CSRF header. */
  async signOut(refreshToken: string | undefined): Promise<any> {
    return this.makeRequest(
      "POST",
      "/auth/sign_out",
      undefined,
      sessionHeaders({ refreshToken }),
    );
  }

  getApp(): NestFastifyApplication {
    return this.app;
  }

  getDataSource(): DataSource {
    return this.dataSource;
  }
}

// Global test helper instance
export const testHelper = new IntegrationTestHelper();
