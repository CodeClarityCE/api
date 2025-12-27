import { ConfigModule } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import { OrganizationsRepository } from "../../src/base_modules/organizations/organizations.repository";
import { User } from "../../src/base_modules/users/users.entity";
import { UsersRepository } from "../../src/base_modules/users/users.repository";
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
    }).compile();

    this.app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // Get services for test data creation
    this.dataSource = moduleFixture.get<DataSource>(DataSource);
    this.usersRepository = moduleFixture.get<UsersRepository>(UsersRepository);
    this.organizationsRepository = moduleFixture.get<OrganizationsRepository>(
      OrganizationsRepository,
    );

    await this.app.init();
    await this.app.getHttpAdapter().getInstance().ready();

    return this.app;
  }

  async teardownTestApp(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }
  }

  async cleanDatabase(): Promise<void> {
    if (!this.dataSource) return;

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

    // Create organization
    const organization = new Organization();
    organization.name = userData.orgName;
    organization.description = userData.orgDescription;
    organization.color_scheme = "#1f2937";
    organization.personal = false;
    organization.created_on = new Date();
    organization.created_by = savedUser;

    const savedOrganization =
      await this.organizationsRepository.saveOrganization(organization);

    // Create membership
    await this.organizationsRepository.saveMembership({
      user: savedUser,
      organization: savedOrganization,
      role: userData.role,
      joined_on: new Date(),
    } as any);

    // Generate tokens (mock since generateTokens doesn't exist)
    const tokens = {
      access_token: `mock-access-token-${savedUser.id}`,
      refresh_token: `mock-refresh-token-${savedUser.id}`,
    };

    return {
      user: savedUser,
      organization: savedOrganization,
      accessToken: tokens.access_token,
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
        "Content-Type": "application/json",
      },
    };

    if (body) {
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
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
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
