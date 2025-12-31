import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test, TestingModule } from "@nestjs/testing";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from "class-validator";

// Mock Authorization Guard
class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // Simple mock: check for authorization header
    return !!request.headers.authorization;
  }
}

// DTOs for comprehensive testing
class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  first_name!: string;

  @IsString()
  last_name!: string;

  @IsString()
  organization_name!: string;

  @IsString()
  organization_description!: string;
}

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

class CreateProjectDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  url!: string;

  @IsString()
  branch!: string;
}

class CreateAnalysisDto {
  @IsUUID()
  analyzer_id!: string;

  @IsString()
  tag!: string;

  @IsString()
  branch!: string;

  @IsString()
  commit_hash!: string;

  @IsOptional()
  config?: Record<string, any>;
}

class PaginationDto {
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(0)
  @IsOptional()
  page?: number = 0;

  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  entries_per_page?: number = 10;

  @IsString()
  @IsOptional()
  search?: string;
}

// Comprehensive test controllers
@Controller("auth")
class TestAuthController {
  @Post("signup")
  signup(@Body() signupDto: SignupDto) {
    return {
      message: "User and organization created successfully",
      data: {
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        user: {
          id: "user-123",
          email: signupDto.email,
          first_name: signupDto.first_name,
          last_name: signupDto.last_name,
          email_verified: false,
          created_on: new Date().toISOString(),
          updated_on: new Date().toISOString(),
        },
        organization: {
          id: "org-123",
          name: signupDto.organization_name,
          description: signupDto.organization_description,
          color_scheme: "blue",
          personal: false,
          created_on: new Date().toISOString(),
        },
      },
    };
  }

  @Post("login")
  login(@Body() loginDto: LoginDto) {
    return {
      message: "Login successful",
      data: {
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        user: {
          id: "user-123",
          email: loginDto.email,
          first_name: "Test",
          last_name: "User",
          email_verified: true,
          created_on: new Date().toISOString(),
          updated_on: new Date().toISOString(),
        },
      },
    };
  }

  @Get("profile")
  @UseGuards(MockAuthGuard)
  getProfile() {
    return {
      message: "Profile retrieved successfully",
      data: {
        id: "user-123",
        email: "test@example.com",
        first_name: "Test",
        last_name: "User",
        email_verified: true,
        created_on: new Date().toISOString(),
        updated_on: new Date().toISOString(),
      },
    };
  }
}

@Controller("organizations/:orgId/projects")
class TestProjectsController {
  @Post()
  @UseGuards(MockAuthGuard)
  createProject(
    @Param("_orgId") _orgId: string,
    @Body() createProjectDto: CreateProjectDto,
  ) {
    return {
      message: "Project created successfully",
      data: {
        id: "project-123",
        name: createProjectDto.name,
        description: createProjectDto.description,
        url: createProjectDto.url,
        branch: createProjectDto.branch,
        added_on: new Date().toISOString(),
        added_by: {
          id: "user-123",
          email: "test@example.com",
          first_name: "Test",
          last_name: "User",
        },
      },
    };
  }

  @Get()
  @UseGuards(MockAuthGuard)
  getProjects(
    @Param("_orgId") _orgId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    const mockProjects = [
      {
        id: "project-1",
        name: "Project Alpha",
        description: "First project",
        url: "https://github.com/test/alpha.git",
        branch: "main",
        added_on: new Date().toISOString(),
      },
      {
        id: "project-2",
        name: "Project Beta",
        description: "Second project",
        url: "https://github.com/test/beta.git",
        branch: "main",
        added_on: new Date().toISOString(),
      },
    ];

    const search = paginationDto.search ?? "";
    const page = paginationDto.page ?? 0;
    const entriesPerPage = paginationDto.entries_per_page ?? 10;

    const filteredProjects = search
      ? mockProjects.filter((p) => p.name.includes(search))
      : mockProjects;

    const startIndex = page * entriesPerPage;
    const endIndex = startIndex + entriesPerPage;
    const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

    return {
      message: "Projects retrieved successfully",
      data: {
        data: paginatedProjects,
        page: page,
        entry_count: paginatedProjects.length,
        entries_per_page: entriesPerPage,
        total_entries: filteredProjects.length,
        total_pages: Math.ceil(filteredProjects.length / entriesPerPage),
      },
    };
  }

  @Get(":projectId")
  @UseGuards(MockAuthGuard)
  getProject(
    @Param("_orgId") _orgId: string,
    @Param("projectId") _projectId: string,
  ) {
    if (_projectId === "non-existent") {
      throw new Error("Project not found");
    }

    return {
      message: "Project retrieved successfully",
      data: {
        id: _projectId,
        name: "Test Project",
        description: "Test project description",
        url: "https://github.com/test/repo.git",
        branch: "main",
        added_on: new Date().toISOString(),
        added_by: {
          id: "user-123",
          email: "test@example.com",
        },
        analyses: [],
        files: [],
      },
    };
  }

  @Delete(":projectId")
  @UseGuards(MockAuthGuard)
  deleteProject(
    @Param("_orgId") _orgId: string,
    @Param("projectId") _projectId: string,
  ) {
    if (_projectId === "non-existent") {
      throw new Error("Project not found");
    }

    return {
      message: "Project deleted successfully",
    };
  }
}

@Controller("organizations/:orgId/projects/:projectId/analyses")
class TestAnalysesController {
  @Post()
  @UseGuards(MockAuthGuard)
  createAnalysis(
    @Param("orgId") _orgId: string,
    @Param("projectId") _projectId: string,
    @Body() _createAnalysisDto: CreateAnalysisDto,
  ) {
    return {
      message: "Analysis created successfully",
      data: {
        id: "analysis-123",
      },
    };
  }

  @Get()
  @UseGuards(MockAuthGuard)
  getAnalyses(
    @Param("_orgId") _orgId: string,
    @Param("_projectId") _projectId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    const mockAnalyses = [
      {
        id: "analysis-1",
        tag: "v1.0.0",
        branch: "main",
        status: "completed",
        created_on: new Date().toISOString(),
      },
      {
        id: "analysis-2",
        tag: "v1.1.0",
        branch: "main",
        status: "running",
        created_on: new Date().toISOString(),
      },
    ];

    return {
      message: "Analyses retrieved successfully",
      data: {
        data: mockAnalyses,
        page: paginationDto.page ?? 0,
        entry_count: mockAnalyses.length,
        entries_per_page: paginationDto.entries_per_page ?? 10,
        total_entries: mockAnalyses.length,
        total_pages: Math.ceil(
          mockAnalyses.length / (paginationDto.entries_per_page ?? 10),
        ),
      },
    };
  }

  @Get(":analysisId")
  @UseGuards(MockAuthGuard)
  getAnalysis(
    @Param("_orgId") _orgId: string,
    @Param("_projectId") _projectId: string,
    @Param("analysisId") analysisId: string,
  ) {
    if (analysisId === "non-existent") {
      throw new Error("Analysis not found");
    }

    return {
      message: "Analysis retrieved successfully",
      data: {
        id: analysisId,
        tag: "v1.0.0",
        branch: "main",
        commit_hash: "abc123",
        status: "completed",
        stage: 3,
        created_on: new Date().toISOString(),
        created_by: {
          id: "user-123",
          email: "test@example.com",
        },
        analyzer: {
          id: "analyzer-123",
          name: "Test Analyzer",
        },
        project: {
          id: "project-123",
          name: "Test Project",
        },
      },
    };
  }

  @Delete(":analysisId")
  @UseGuards(MockAuthGuard)
  deleteAnalysis(
    @Param("_orgId") _orgId: string,
    @Param("_projectId") _projectId: string,
    @Param("analysisId") analysisId: string,
  ) {
    if (analysisId === "non-existent") {
      throw new Error("Analysis not found");
    }

    return {
      message: "Analysis deleted successfully",
    };
  }
}

/**
 * Comprehensive Contract Integration Tests
 *
 * These tests validate API contract compliance across multiple endpoints using simplified controllers.
 * They test validation, authentication guards, pagination, and response formats.
 */
describe("Comprehensive Contract Integration (e2e)", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        TestAuthController,
        TestProjectsController,
        TestAnalysesController,
      ],
      providers: [
        {
          provide: APP_PIPE,
          useClass: ValidationPipe,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Authentication Contract", () => {
    describe("POST /auth/signup", () => {
      it("should accept valid signup and return proper structure", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/auth/signup",
          payload: {
            email: "test@example.com",
            password: "SecurePassword123!",
            first_name: "John",
            last_name: "Doe",
            organization_name: "Test Org",
            organization_description: "Test description",
          },
        });

        expect(response.statusCode).toBe(201);
        expect(JSON.parse(response.payload)).toMatchObject({
          message: expect.any(String),
          data: {
            access_token: expect.any(String),
            refresh_token: expect.any(String),
            user: {
              id: expect.any(String),
              email: "test@example.com",
              first_name: "John",
              last_name: "Doe",
              email_verified: false,
            },
            organization: {
              id: expect.any(String),
              name: "Test Org",
              description: "Test description",
            },
          },
        });
      });

      it("should validate email format", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/auth/signup",
          payload: {
            email: "invalid-email",
            password: "SecurePassword123!",
            first_name: "John",
            last_name: "Doe",
            organization_name: "Test Org",
            organization_description: "Test description",
          },
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.payload).message).toEqual(
          expect.arrayContaining([expect.stringContaining("email")]),
        );
      });

      it("should validate password length", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/auth/signup",
          payload: {
            email: "test@example.com",
            password: "123",
            first_name: "John",
            last_name: "Doe",
            organization_name: "Test Org",
            organization_description: "Test description",
          },
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.payload).message).toEqual(
          expect.arrayContaining([expect.stringContaining("password")]),
        );
      });
    });

    describe("GET /auth/profile", () => {
      it("should return profile with valid authorization", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/auth/profile",
          headers: {
            authorization: "Bearer valid-token",
          },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload)).toMatchObject({
          message: "Profile retrieved successfully",
          data: {
            id: expect.any(String),
            email: expect.any(String),
            first_name: expect.any(String),
            last_name: expect.any(String),
            email_verified: expect.any(Boolean),
          },
        });
      });

      it("should reject unauthorized requests", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/auth/profile",
        });

        expect(response.statusCode).toBe(403);
      });
    });
  });

  describe("Projects Contract", () => {
    describe("POST /organizations/:orgId/projects", () => {
      it("should create project with valid data", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/organizations/org-123/projects",
          headers: {
            authorization: "Bearer valid-token",
          },
          payload: {
            name: "Test Project",
            description: "A test project",
            url: "https://github.com/test/repo.git",
            branch: "main",
          },
        });

        expect(response.statusCode).toBe(201);
        expect(JSON.parse(response.payload)).toMatchObject({
          message: "Project created successfully",
          data: {
            id: expect.any(String),
            name: "Test Project",
            description: "A test project",
            url: "https://github.com/test/repo.git",
            branch: "main",
            added_on: expect.any(String),
            added_by: {
              id: expect.any(String),
              email: expect.any(String),
            },
          },
        });
      });

      it("should validate required fields", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/organizations/org-123/projects",
          headers: {
            authorization: "Bearer valid-token",
          },
          payload: {
            name: "Test Project",
            // Missing required fields
          },
        });

        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.payload);
        expect(responseBody.message).toEqual(
          expect.arrayContaining([
            expect.stringContaining("url"),
            expect.stringContaining("branch"),
          ]),
        );
      });
    });

    describe("GET /organizations/:orgId/projects", () => {
      it("should return paginated projects", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/organizations/org-123/projects?page=0&entries_per_page=10",
          headers: {
            authorization: "Bearer valid-token",
          },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload)).toMatchObject({
          message: "Projects retrieved successfully",
          data: {
            data: expect.any(Array),
            page: 0,
            entry_count: expect.any(Number),
            entries_per_page: 10,
            total_entries: expect.any(Number),
            total_pages: expect.any(Number),
          },
        });
      });

      it("should support search functionality", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/organizations/org-123/projects?search=Alpha",
          headers: {
            authorization: "Bearer valid-token",
          },
        });

        expect(response.statusCode).toBe(200);
        const responseBody = JSON.parse(response.payload);
        expect(responseBody.data.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining("Alpha"),
            }),
          ]),
        );
      });

      it("should validate pagination parameters", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/organizations/org-123/projects?page=-1&entries_per_page=200",
          headers: {
            authorization: "Bearer valid-token",
          },
        });

        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.payload);
        expect(responseBody.message).toEqual(
          expect.arrayContaining([
            expect.stringContaining("page"),
            expect.stringContaining("entries_per_page"),
          ]),
        );
      });
    });
  });

  describe("Analyses Contract", () => {
    describe("POST /organizations/:orgId/projects/:projectId/analyses", () => {
      it("should create analysis with valid data", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/organizations/org-123/projects/project-123/analyses",
          headers: {
            authorization: "Bearer valid-token",
          },
          payload: {
            analyzer_id: "550e8400-e29b-41d4-a716-446655440000",
            tag: "v1.0.0",
            branch: "main",
            commit_hash: "abc123",
            config: {},
          },
        });

        expect(response.statusCode).toBe(201);
        expect(JSON.parse(response.payload)).toMatchObject({
          message: "Analysis created successfully",
          data: {
            id: expect.any(String),
          },
        });
      });

      it("should validate analyzer_id format", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/organizations/org-123/projects/project-123/analyses",
          headers: {
            authorization: "Bearer valid-token",
          },
          payload: {
            analyzer_id: "invalid-uuid",
            tag: "v1.0.0",
            branch: "main",
            commit_hash: "abc123",
          },
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.payload).message).toEqual(
          expect.arrayContaining([expect.stringContaining("analyzer_id")]),
        );
      });
    });

    describe("GET /organizations/:orgId/projects/:projectId/analyses/:analysisId", () => {
      it("should return analysis details", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/organizations/org-123/projects/project-123/analyses/analysis-123",
          headers: {
            authorization: "Bearer valid-token",
          },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload)).toMatchObject({
          message: "Analysis retrieved successfully",
          data: {
            id: "analysis-123",
            tag: expect.any(String),
            branch: expect.any(String),
            commit_hash: expect.any(String),
            status: expect.any(String),
            stage: expect.any(Number),
            created_on: expect.any(String),
            created_by: {
              id: expect.any(String),
              email: expect.any(String),
            },
            analyzer: {
              id: expect.any(String),
              name: expect.any(String),
            },
            project: {
              id: expect.any(String),
              name: expect.any(String),
            },
          },
        });
      });
    });
  });

  describe("Error Handling Contract", () => {
    it("should return consistent 400 error format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toMatchObject({
        statusCode: 400,
        message: expect.any(Array),
        error: "Bad Request",
      });
    });

    it("should return consistent 403 error format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/auth/profile",
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload)).toMatchObject({
        statusCode: 403,
        message: expect.any(String),
        error: "Forbidden",
      });
    });

    it("should return consistent 404 error format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/non-existent-endpoint",
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toMatchObject({
        statusCode: 404,
        message: expect.any(String),
        error: "Not Found",
      });
    });
  });

  describe("Content Type and Encoding", () => {
    it("should handle Unicode characters correctly", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: {
          email: "test@example.com",
          password: "SecurePassword123!",
          first_name: "José",
          last_name: "Müller",
          organization_name: "Тест Org",
          organization_description: "测试 description 🚀",
        },
      });

      expect(response.statusCode).toBe(201);
      const responseBody = JSON.parse(response.payload);
      expect(responseBody.data.user.first_name).toBe("José");
      expect(responseBody.data.user.last_name).toBe("Müller");
      expect(responseBody.data.organization.name).toBe("Тест Org");
      expect(responseBody.data.organization.description).toBe(
        "测试 description 🚀",
      );
    });

    it("should return JSON content type", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/auth/profile",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.headers["content-type"]).toContain("application/json");
    });
  });
});
