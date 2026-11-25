import { lookup } from "dns/promises";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";

import { Integration } from "../../src/base_modules/integrations/integrations.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const BASE = "https://gitlab.example.com";

// Name resolution is the boundary: names resolve to a public address unless a test says otherwise.
jest.mock("dns/promises", () => ({ lookup: jest.fn() }));
const mockedLookup = lookup as unknown as jest.Mock;
function resolvesTo(address: string): void {
  mockedLookup.mockResolvedValue([{ address, family: 4 }]);
}

// A valid GitLab URL of exactly `length` characters.
function urlOfLength(length: number): string {
  return `${BASE}/${"a".repeat(length - BASE.length - 1)}`;
}

describe("GitLab instance URL length (e2e)", () => {
  let admin: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    resolvesTo("203.0.113.10");
    await testHelper.cleanDatabase();
    admin = await testHelper.createTestUser({
      email: "admin@gitlaburl.com",
      orgName: "GitLab URL Org",
      role: MemberRole.ADMIN,
    });
  });

  function linkGitlab(url: string): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/integrations/gitlab/add`,
      admin.accessToken,
      {
        token: "glpat-test-token",
        token_type: "PERSONAL_ACCESS_TOKEN",
        gitlab_instance_url: url,
      },
    );
  }

  function integrations(): Promise<Integration[]> {
    return testHelper.getDataSource().getRepository(Integration).find();
  }

  it.each([BASE, urlOfLength(255)])(
    "links an instance whose URL is over 25 characters (%s)",
    async (url) => {
      const response = await linkGitlab(url);

      expect(response.statusCode).toBe(201);
      expect((await integrations()).map((i) => i.service_domain)).toEqual([
        url,
      ]);
    },
  );

  it("answers ValidationFailed for a URL over 255 characters and saves nothing", async () => {
    const response = await linkGitlab(urlOfLength(256));

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("ValidationFailed");
    expect(await integrations()).toEqual([]);
  });

  describe("address checks", () => {
    const savedAllowlist = process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];
    let server: Server;
    let port: number;
    let hits: number;

    beforeEach(async () => {
      hits = 0;
      server = createServer((_req, res) => {
        hits++;
        res.end("{}");
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      port = (server.address() as AddressInfo).port;
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (savedAllowlist === undefined)
        delete process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];
      else process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = savedAllowlist;
    });

    it.each([
      ["a loopback literal over http", () => `http://127.0.0.1:${port}`],
      ["a loopback literal over https", () => `https://127.0.0.1:${port}`],
      ["the cloud metadata address", () => "https://169.254.169.254"],
    ])("refuses %s and sends it nothing", async (_label, url) => {
      const response = await linkGitlab(url());

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe(
        "IntegrationInstanceUrlNotAllowed",
      );
      expect(hits).toBe(0);
      expect(await integrations()).toEqual([]);
    });

    it("refuses a name that resolves to a private address", async () => {
      resolvesTo("10.0.0.7");

      const response = await linkGitlab("https://gitlab.internal.lan");

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe(
        "IntegrationInstanceUrlNotAllowed",
      );
      expect(await integrations()).toEqual([]);
    });

    it("answers IntegrationInstanceUnreachable for a name that does not resolve", async () => {
      mockedLookup.mockRejectedValue(
        Object.assign(new Error("not found"), { code: "ENOTFOUND" }),
      );

      const response = await linkGitlab("https://gitlab.typo.example");

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("IntegrationInstanceUnreachable");
      expect(await integrations()).toEqual([]);
    });

    it("refuses plain http on a public host", async () => {
      const response = await linkGitlab("http://gitlab.example.com");

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe(
        "IntegrationInstanceUrlNotAllowed",
      );
      expect(await integrations()).toEqual([]);
    });

    it("accepts a private host the operator allows, over http too", async () => {
      process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = "gitlab.internal.lan";
      resolvesTo("10.0.0.7");

      const response = await linkGitlab("http://gitlab.internal.lan:8080");

      expect(response.statusCode).toBe(201);
      expect((await integrations()).map((i) => i.service_domain)).toEqual([
        "http://gitlab.internal.lan:8080",
      ]);
    });

    it("accepts a single-label host the operator allows", async () => {
      process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = "gitlab";
      resolvesTo("172.18.0.4");

      const response = await linkGitlab("http://gitlab");

      expect(response.statusCode).toBe(201);
    });
  });
});
