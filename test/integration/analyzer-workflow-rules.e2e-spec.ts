import { ValidationPipe } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AnalyzersController } from "src/base_modules/analyzers/analyzers.controller";
import { AnalyzersRepository } from "src/base_modules/analyzers/analyzers.repository";
import { AnalyzersService } from "src/base_modules/analyzers/analyzers.service";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { OrganizationLoggerService } from "src/base_modules/organizations/log/organizationLogger.service";
import type { Plugin } from "src/base_modules/plugins/plugin.entity";
import { PluginsRepository } from "src/base_modules/plugins/plugin.repository";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import { Experiment } from "src/codeclarity_modules/experiments/experiment.entity";
import { ErrorFilter } from "src/filters/ExceptionFilter";
import { ValidationFailed } from "src/types/error.types";

// The installed plugins, as the live instance registers them.
const installed: Plugin[] = [
  { id: "1", name: "js-sbom", depends_on: [] },
  { id: "2", name: "php-sbom", depends_on: [] },
  { id: "3", name: "vuln-finder", depends_on: ["js-sbom", "php-sbom"] },
  { id: "4", name: "license-finder", depends_on: ["js-sbom", "php-sbom"] },
  {
    id: "5",
    name: "js-patching",
    depends_on: ["js-sbom", "php-sbom", "vuln-finder"],
  },
];

function step(name: string): Record<string, unknown> {
  return { name, version: "v1", config: {}, persistant_config: {} };
}

function body(steps: unknown): Record<string, unknown> {
  return { name: "JS audit", description: "Audits JavaScript", steps };
}

describe("Analyzer workflow rules (HTTP)", () => {
  let app: NestFastifyApplication;
  const saveAnalyzer = jest.fn();
  const getAnalyzerById = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyzersController],
      providers: [
        AnalyzersService,
        {
          provide: getRepositoryToken(Experiment, "codeclarity"),
          useValue: {},
        },
        {
          provide: OrganizationLoggerService,
          useValue: { addAuditLog: jest.fn() },
        },
        {
          provide: MembershipsRepository,
          useValue: { hasRequiredRole: jest.fn() },
        },
        {
          provide: OrganizationsRepository,
          useValue: { getOrganizationById: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: UsersRepository,
          useValue: { getUserById: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: AnalyzersRepository,
          useValue: {
            saveAnalyzer,
            getAnalyzerById,
          },
        },
        {
          provide: PluginsRepository,
          useValue: { getAll: jest.fn().mockResolvedValue(installed) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    // Same pipe and filter as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        exceptionFactory: (errors) => new ValidationFailed(errors),
        stopAtFirstError: true,
      }),
    );
    app.useGlobalFilters(new ErrorFilter());
    app
      .getHttpAdapter()
      .getInstance()
      .addHook("onRequest", (request, _reply, done) => {
        (request as unknown as { user: AuthenticatedUser }).user =
          new AuthenticatedUser("u1", [ROLE.USER], true);
        done();
      });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    saveAnalyzer.mockReset().mockResolvedValue({ id: "a1" });
    getAnalyzerById.mockReset().mockResolvedValue({ id: "a1" });
  });

  async function send(
    method: "POST" | "PUT",
    payload: Record<string, unknown>,
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await app.inject({
      method,
      url: method === "POST" ? "/org/o1/analyzers" : "/org/o1/analyzers/a1",
      payload,
    });
    return {
      status: res.statusCode,
      json: JSON.parse(res.payload) as Record<string, unknown>,
    };
  }

  it.each(["POST", "PUT"] as const)(
    "%s rejects an analyzer with no steps",
    async (method) => {
      for (const steps of [[], [[]]]) {
        const res = await send(method, body(steps));
        expect(res.status).toBe(400);
        expect(res.json["error_code"]).toBe("AnalyzerHasNoPlugins");
      }
      expect(saveAnalyzer).not.toHaveBeenCalled();
    },
  );

  it.each(["POST", "PUT"] as const)(
    "%s rejects a plugin whose dependency is missing, naming it",
    async (method) => {
      const res = await send(method, body([[step("js-patching")]]));
      expect(res.status).toBe(400);
      expect(res.json["error_code"]).toBe("AnalyzerDependencyMissing");
      expect(res.json["error_message"]).toContain("js-patching");
      expect(res.json["error_message"]).toContain("vuln-finder");
      expect(saveAnalyzer).not.toHaveBeenCalled();
    },
  );

  it("rejects a dependency that only runs in a later stage", async () => {
    const res = await send(
      "POST",
      body([[step("vuln-finder")], [step("js-sbom")]]),
    );
    expect(res.status).toBe(400);
    expect(res.json["error_code"]).toBe("AnalyzerDependencyMissing");
  });

  it("accepts one SBOM producer for plugins that list several", async () => {
    const res = await send(
      "POST",
      body([
        [step("js-sbom")],
        [step("vuln-finder"), step("license-finder")],
        [step("js-patching")],
      ]),
    );
    expect(res.status).toBe(201);
    expect(saveAnalyzer).toHaveBeenCalledTimes(1);
  });

  it("rejects a name longer than the column holds", async () => {
    const res = await send("POST", {
      ...body([[step("js-sbom")]]),
      name: "x".repeat(26),
    });
    expect(res.status).toBe(400);
    expect(res.json["error_code"]).toBe("ValidationFailed");
    expect(saveAnalyzer).not.toHaveBeenCalled();
  });

  describe("language configuration of a template-based analyzer", () => {
    const jsTemplate = {
      supported_languages: ["javascript"],
      language_config: {
        javascript: { plugins: ["js-sbom", "vuln-finder", "license-finder"] },
      },
    };

    function saved(): {
      supported_languages: string[];
      language_config?: Record<string, { plugins: string[] }>;
    } {
      return saveAnalyzer.mock.calls[0][0];
    }

    it("lists a plugin added to the template under its language", async () => {
      const res = await send("POST", {
        ...body([
          [step("js-sbom")],
          [step("vuln-finder"), step("license-finder")],
          [step("js-patching")],
        ]),
        ...jsTemplate,
      });
      expect(res.status).toBe(201);
      expect(saved().supported_languages).toEqual(["javascript"]);
      expect(saved().language_config).toEqual({
        javascript: {
          plugins: ["js-sbom", "vuln-finder", "license-finder", "js-patching"],
        },
      });
    });

    it("adds the language of an added SBOM producer", async () => {
      const res = await send("POST", {
        ...body([[step("js-sbom"), step("php-sbom")], [step("vuln-finder")]]),
        ...jsTemplate,
      });
      expect(res.status).toBe(201);
      expect(saved().supported_languages).toEqual(["javascript", "php"]);
      expect(saved().language_config).toEqual({
        javascript: { plugins: ["js-sbom", "vuln-finder"] },
        php: { plugins: ["php-sbom", "vuln-finder"] },
      });
    });

    it("updates the saved configuration when plugins change on edit", async () => {
      getAnalyzerById.mockResolvedValue({
        id: "a1",
        supported_languages: ["javascript", "php"],
        language_config: {
          javascript: { plugins: ["js-sbom", "vuln-finder"] },
          php: { plugins: ["php-sbom", "vuln-finder"] },
        },
      });
      // The edit page sends no language fields: php-sbom removed, js-patching added.
      const res = await send(
        "PUT",
        body([[step("js-sbom")], [step("vuln-finder")], [step("js-patching")]]),
      );
      expect(res.status).toBe(200);
      expect(saved().supported_languages).toEqual(["javascript"]);
      expect(saved().language_config).toEqual({
        javascript: { plugins: ["js-sbom", "vuln-finder", "js-patching"] },
      });
    });

    it("leaves an analyzer without a language configuration alone", async () => {
      const res = await send("POST", {
        ...body([[step("js-sbom")], [step("vuln-finder")]]),
        language_config: {},
      });
      expect(res.status).toBe(201);
      expect(saved().language_config).toEqual({});
    });
  });
});
