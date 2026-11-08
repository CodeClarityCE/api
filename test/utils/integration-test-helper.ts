import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import { getDataSourceToken } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { DataSource } from "typeorm";

import { AppModule } from "../../src/app.module";
import {
  AnalysisPublisher,
  InMemoryAnalysisPublisher,
} from "../../src/base_modules/analyses/analysis-publisher";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "../../src/base_modules/shared/repositories";
import { User } from "../../src/base_modules/users/users.entity";
import { ErrorFilter } from "../../src/filters/ExceptionFilter";
import { ResponseBodyInterceptor } from "../../src/interceptors/ResponseBodyInterceptor";
import { ValidationFailed } from "../../src/types/error.types";
import { validate } from "../../src/utils/validate-env";

export interface TestUser {
  user: User;
  organization: Organization;
  accessToken: string;
  refreshToken: string;
}

export class IntegrationTestHelper {
  private app!: NestFastifyApplication;
  private dataSource!: DataSource;
  private usersRepository!: UsersRepository;
  private organizationsRepository!: OrganizationsRepository;
  private membershipsRepository!: MembershipsRepository;

  async setupTestApp(): Promise<NestFastifyApplication> {
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

    // Same global setup as main.ts, so responses match the real API.
    this.app.useGlobalPipes(
      new ValidationPipe({
        exceptionFactory: (errors) => new ValidationFailed(errors),
        stopAtFirstError: true,
      }),
    );
    this.app.useGlobalFilters(new ErrorFilter());
    this.app.useGlobalInterceptors(new ResponseBodyInterceptor());
    this.app.useGlobalInterceptors(
      new ClassSerializerInterceptor(this.app.get(Reflector), {
        excludeExtraneousValues: true,
      }),
    );

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

    // The test database is restored from an old dump, so rebuild it from the entities.
    this.assertTestDatabase();
    await this.dataSource.synchronize(true);

    return this.app;
  }

  // Refuses to wipe a database that is not a test one, such as dev's.
  private assertTestDatabase(): void {
    const database = this.dataSource.options.database ?? "";
    if (typeof database !== "string" || !database.endsWith("_test")) {
      throw new Error(
        `Refusing to truncate "${String(database)}": not a test database`,
      );
    }
  }

  async teardownTestApp(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }
  }

  async cleanDatabase(): Promise<void> {
    if (!this.dataSource) return;

    this.assertTestDatabase();

    // Get all entity metadata
    const entities = this.dataSource.entityMetadatas;

    // Disable foreign key checks temporarily
    await this.dataSource.query("SET session_replication_role = replica;");

    try {
      // Truncate all tables
      for (const entity of entities) {
        await this.dataSource.query(
          `TRUNCATE TABLE "${entity.tableName}" CASCADE;`,
        );
      }
    } finally {
      // Re-enable foreign key checks
      await this.dataSource.query("SET session_replication_role = DEFAULT;");
    }
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
    const tokens = JSON.parse(login.payload).data as {
      token: string;
      refresh_token: string;
    };

    return {
      user: savedUser,
      organization: savedOrganization,
      accessToken: tokens.token,
      refreshToken: tokens.refresh_token,
    };
  }

  async makeAuthenticatedRequest(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    accessToken: string,
    body?: any,
  ): Promise<any> {
    const requestOptions: any = {
      method,
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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
  ): Promise<any> {
    const requestOptions: any = {
      method,
      url,
      headers: {},
    };

    if (body) {
      // Fastify rejects a JSON content type with an empty body.
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.payload = JSON.stringify(body);
    }

    const request = this.app.inject(requestOptions);

    return request;
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
