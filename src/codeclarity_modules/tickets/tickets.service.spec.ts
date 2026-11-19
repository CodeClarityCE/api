import type { Repository } from "typeorm";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import type { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import { OSVRepository } from "src/codeclarity_modules/knowledge/osv/osv.repository";

import { TicketsService } from "./tickets.service";

describe("TicketsService vulnerability details from knowledge", () => {
  const user = new AuthenticatedUser("user-1", [ROLE.USER], true);
  const drupal = {
    osv_id: "DRUPAL-CORE-2019-006",
    details: "drupal",
    affected: [{ package: { name: "drupal/core", ecosystem: "Packagist" } }],
  };
  const jquery = {
    osv_id: "GHSA-6c3j-c64m-qhgq",
    details: "jquery",
    affected: [{ package: { name: "jquery", ecosystem: "npm" } }],
  };

  // A service whose only ticket is about the given package, with no analysis behind it.
  function serviceFor(
    affectedPackage: string,
    analysis: { id: string } | null = null,
  ): TicketsService {
    const ticket = {
      id: "ticket-1",
      vulnerability_id: "CVE-2019-11358",
      affected_package: affectedPackage,
      project: { id: "project-1" },
      source_analysis: analysis,
    };
    const osvRows = {
      find: jest.fn().mockResolvedValue([drupal, jquery]),
    } as unknown as Repository<OSV>;
    const deps = {
      memberships: { hasRequiredRole: jest.fn() },
      nvd: { getVulnWithoutFailing: jest.fn().mockResolvedValue(null) },
      epss: { getByCVE: jest.fn().mockResolvedValue(null) },
      tickets: { findOne: jest.fn().mockResolvedValue(ticket) },
      vulnerabilities: {
        getVulnerability: jest.fn().mockRejectedValue(new Error("no result")),
      },
    };
    const unused = {} as never;
    return new TicketsService(
      deps.memberships as never,
      unused,
      unused,
      unused,
      deps.vulnerabilities as never,
      unused,
      deps.nvd as never,
      new OSVRepository(osvRows),
      deps.epss as never,
      deps.tickets as never,
      unused,
      unused,
    );
  }

  it("links the OSV record for the ticket's package", async () => {
    const details = await serviceFor("jquery").getVulnerabilityDetails(
      "org-1",
      "ticket-1",
      user,
    );

    expect(details?.vulnerability_info.sources).toEqual([
      {
        name: "OSV",
        vuln_url: "https://osv.dev/vulnerability/GHSA-6c3j-c64m-qhgq",
      },
    ]);
  });

  it("has no OSV source when no record affects the ticket's package", async () => {
    const details = await serviceFor("lodash").getVulnerabilityDetails(
      "org-1",
      "ticket-1",
      user,
    );

    expect(details).toBeNull();
  });

  it("logs a ticket id with format directives verbatim when the analysis lookup fails", async () => {
    const lines: string[] = [];
    const log = jest
      .spyOn(console, "log")
      .mockImplementation((line: string) => lines.push(line));

    await serviceFor("jquery", { id: "analysis-1" }).getVulnerabilityDetails(
      "org-1",
      "%s%o ticket",
      user,
    );
    log.mockRestore();

    const entry = lines
      .map((line) => JSON.parse(line) as Record<string, any>)
      .find((e) => e["level"] === "error");
    expect(entry).toMatchObject({
      msg: "Failed to fetch vulnerability details for ticket",
      fields: { ticketId: "%s%o ticket", error: "no result" },
    });
  });
});
