/* eslint-disable security/detect-non-literal-fs-filename -- reads the certificates the test just generated */
import { execFileSync } from "child_process";
import { lookup } from "dns/promises";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { createServer as createHttpServer, type Server } from "http";
import { createServer as createHttpsServer } from "https";
import { type AddressInfo,createServer as createNetServer } from "net";
import { tmpdir } from "os";
import { join } from "path";

import { ImportTargetNotAllowed } from "src/types/error.types";

import {
  gitlabAllowedPrivateHosts,
  pinnedFetch,
  resolveOutboundUrl,
} from "./outbound-url";

// Name resolution is the network boundary of the outbound check.
jest.mock("dns/promises", () => ({ lookup: jest.fn() }));
const mockedLookup = lookup as unknown as jest.Mock;

function resolvesTo(...addresses: string[]): void {
  mockedLookup.mockResolvedValue(
    addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    })),
  );
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

async function close(server: { close: (cb: () => void) => void }) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("outbound url", () => {
  afterEach(() => {
    mockedLookup.mockReset();
  });

  describe("resolveOutboundUrl", () => {
    it.each([
      ["loopback", ["127.0.0.1"]],
      ["private", ["10.0.0.7"]],
      ["cloud metadata", ["169.254.169.254"]],
      ["one internal among public", ["8.8.8.8", "192.168.1.1"]],
    ])("refuses a host resolving to a %s address", async (_label, addrs) => {
      resolvesTo(...addrs);

      await expect(
        resolveOutboundUrl("https://evil.example/x"),
      ).rejects.toThrow(ImportTargetNotAllowed);
    });

    it("returns the vetted addresses of a public host", async () => {
      resolvesTo("172.65.251.78");

      const vetted = await resolveOutboundUrl("https://gitlab.com/a/b");

      expect(vetted.url.hostname).toBe("gitlab.com");
      expect(vetted.addresses).toEqual([
        { address: "172.65.251.78", family: 4 },
      ]);
    });

    it("allows a private address for a host in the allowlist", async () => {
      resolvesTo("10.0.0.7");

      const vetted = await resolveOutboundUrl("https://GitLab.Internal.lan/", {
        allowedPrivateHosts: ["gitlab.internal.lan"],
      });

      expect(vetted.addresses).toEqual([{ address: "10.0.0.7", family: 4 }]);
    });

    it("refuses plain http when https is required", async () => {
      resolvesTo("172.65.251.78");

      await expect(
        resolveOutboundUrl("http://gitlab.com/", { httpsOnly: true }),
      ).rejects.toThrow(ImportTargetNotAllowed);
    });

    it("allows plain http to an allowlisted host when https is required", async () => {
      resolvesTo("10.0.0.7");

      await expect(
        resolveOutboundUrl("http://gitlab.internal.lan/", {
          httpsOnly: true,
          allowedPrivateHosts: ["gitlab.internal.lan"],
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("pinnedFetch", () => {
    let server: Server;
    let port: number;
    let hits: number;

    beforeEach(async () => {
      hits = 0;
      server = createHttpServer((_req, res) => {
        hits++;
        res.setHeader("x-next-page", "2");
        res.end("hello");
      });
      port = await listen(server);
    });

    afterEach(async () => {
      await close(server);
    });

    it("connects to the vetted address, not a fresh lookup (DNS rebinding)", async () => {
      // The check sees a public address; the system resolver (which a plain
      // fetch would use at connect time) answers 127.0.0.1 for localhost.
      resolvesTo("203.0.113.10");

      await expect(
        pinnedFetch(`http://localhost:${port}/`, { timeoutMs: 300 }),
      ).rejects.toThrow();
      expect(hits).toBe(0);
      expect(mockedLookup).toHaveBeenCalledTimes(1);
    });

    it("refuses an internal address before connecting", async () => {
      resolvesTo("127.0.0.1");

      await expect(pinnedFetch(`http://evil.test:${port}/`)).rejects.toThrow(
        ImportTargetNotAllowed,
      );
      expect(hits).toBe(0);
    });

    it("returns the response of an allowlisted host", async () => {
      resolvesTo("127.0.0.1");

      const response = await pinnedFetch(`http://gitlab.test:${port}/`, {
        allowedPrivateHosts: ["gitlab.test"],
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("x-next-page")).toBe("2");
      expect(await response.text()).toBe("hello");
      expect(hits).toBe(1);
    });

    it("does not follow redirects", async () => {
      await close(server);
      server = createHttpServer((_req, res) => {
        hits++;
        res.writeHead(302, { location: "http://169.254.169.254/" });
        res.end();
      });
      port = await listen(server);
      resolvesTo("127.0.0.1");

      const response = await pinnedFetch(`http://gitlab.test:${port}/`, {
        allowedPrivateHosts: ["gitlab.test"],
      });

      expect(response.status).toBe(302);
      expect(hits).toBe(1);
    });

    it("sends the request headers", async () => {
      await close(server);
      let token: string | string[] | undefined;
      server = createHttpServer((req, res) => {
        token = req.headers["private-token"];
        res.end("{}");
      });
      port = await listen(server);
      resolvesTo("127.0.0.1");

      await pinnedFetch(`http://gitlab.test:${port}/api/v4/x?a=1`, {
        headers: { "PRIVATE-TOKEN": "glpat-test-token" },
        allowedPrivateHosts: ["gitlab.test"],
      });

      expect(token).toBe("glpat-test-token");
    });
  });

  describe("pinnedFetch over TLS", () => {
    it("sends the original hostname as the TLS server name", async () => {
      let hello = "";
      const raw = createNetServer((socket) => {
        socket.once("data", (chunk) => {
          hello = chunk.toString("latin1");
          socket.destroy();
        });
      });
      await new Promise<void>((resolve) => raw.listen(0, "127.0.0.1", resolve));
      const port = (raw.address() as AddressInfo).port;
      resolvesTo("127.0.0.1");

      await expect(
        pinnedFetch(`https://gitlab.test:${port}/`, {
          allowedPrivateHosts: ["gitlab.test"],
        }),
      ).rejects.toThrow();
      await close(raw);

      expect(hello).toContain("gitlab.test");
    });

    const hasOpenssl = (() => {
      try {
        execFileSync("openssl", ["version"], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();

    (hasOpenssl ? describe : describe.skip)("with a certificate", () => {
      let dir: string;
      let ca: string;
      let server: ReturnType<typeof createHttpsServer>;
      let port: number;

      beforeAll(async () => {
        dir = mkdtempSync(join(tmpdir(), "pinned-fetch-"));
        const run = (...args: string[]) =>
          execFileSync("openssl", args, { cwd: dir, stdio: "ignore" });
        run(
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          "ca.key",
          "-out",
          "ca.crt",
          "-days",
          "1",
          "-subj",
          "/CN=test-ca",
        );
        run(
          "req",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          "leaf.key",
          "-out",
          "leaf.csr",
          "-subj",
          "/CN=gitlab.test",
          "-addext",
          "subjectAltName=DNS:gitlab.test",
        );
        run(
          "x509",
          "-req",
          "-in",
          "leaf.csr",
          "-CA",
          "ca.crt",
          "-CAkey",
          "ca.key",
          "-CAcreateserial",
          "-out",
          "leaf.crt",
          "-days",
          "1",
          "-copy_extensions",
          "copy",
        );
        ca = readFileSync(join(dir, "ca.crt"), "utf8");
        server = createHttpsServer(
          {
            key: readFileSync(join(dir, "leaf.key")),
            cert: readFileSync(join(dir, "leaf.crt")),
          },
          (_req, res) => res.end("ok"),
        );
        await new Promise<void>((resolve) =>
          server.listen(0, "127.0.0.1", resolve),
        );
        port = (server.address() as AddressInfo).port;
      });

      afterAll(async () => {
        await close(server);
        rmSync(dir, { recursive: true, force: true });
      });

      it("accepts a certificate for the original hostname", async () => {
        resolvesTo("127.0.0.1");

        const response = await pinnedFetch(`https://gitlab.test:${port}/`, {
          allowedPrivateHosts: ["gitlab.test"],
          ca,
        });

        expect(await response.text()).toBe("ok");
      });

      it("refuses a certificate for another hostname on the same address", async () => {
        resolvesTo("127.0.0.1");

        await expect(
          pinnedFetch(`https://other.test:${port}/`, {
            allowedPrivateHosts: ["other.test"],
            ca,
          }),
        ).rejects.toThrow(/altname|does not match|Hostname/i);
      });
    });
  });

  describe("gitlabAllowedPrivateHosts", () => {
    const saved = process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];
    afterEach(() => {
      if (saved === undefined)
        delete process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];
      else process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = saved;
    });

    it("is empty by default", () => {
      delete process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];
      expect(gitlabAllowedPrivateHosts()).toEqual([]);
    });

    it("reads a comma-separated list of hosts", () => {
      process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] =
        " gitlab.internal.lan, ,10.0.0.5,";
      expect(gitlabAllowedPrivateHosts()).toEqual([
        "gitlab.internal.lan",
        "10.0.0.5",
      ]);
    });
  });
});
