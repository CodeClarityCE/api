import type { ObjectLiteral, Repository } from "typeorm";

import {
  type Analysis,
  AnalysisStatus,
} from "src/base_modules/analyses/analysis.entity";
import type { Organization } from "src/base_modules/organizations/organization.entity";
import type { Result } from "src/codeclarity_modules/results/result.entity";

import { type Ticket, TicketStatus } from "../ticket.entity";
import type { TicketEvent } from "../ticket-event.entity";

import { TicketAutomationService } from "./ticket-automation.service";

function repo<T extends ObjectLiteral>(
  overrides: Record<string, unknown>,
): Repository<T> {
  return overrides as unknown as Repository<T>;
}

describe("TicketAutomationService", () => {
  it("resolves the tickets of vulnerabilities hidden by default as no longer detected", async () => {
    const tickets = [
      {
        id: "t-shown",
        vulnerability_id: "CVE-SHOWN",
        status: TicketStatus.OPEN,
      },
      {
        id: "t-hidden",
        vulnerability_id: "CVE-HIDDEN",
        status: TicketStatus.OPEN,
      },
    ] as Ticket[];
    const result = {
      result: {
        workspaces: {
          ".": {
            Vulnerabilities: [
              { VulnerabilityId: "CVE-SHOWN" },
              {
                VulnerabilityId: "CVE-HIDDEN",
                SourceVerdicts: [
                  { source: "gcve", verdict: "matched" },
                  { source: "osv", verdict: "version_excluded" },
                ],
              },
            ],
          },
        },
      },
    };
    const service = new TicketAutomationService(
      repo<Ticket>({
        find: jest.fn().mockResolvedValue(tickets),
        save: jest.fn(),
      }),
      repo<TicketEvent>({ save: jest.fn() }),
      repo<Analysis>({
        findOne: jest.fn().mockResolvedValue({
          id: "a-1",
          status: AnalysisStatus.SUCCESS,
          organization: { id: "org-1" },
          project: { id: "p-1" },
        }),
      }),
      repo<Organization>({
        findOne: jest.fn().mockResolvedValue({ auto_resolve_tickets: true }),
      }),
      repo<Result>({ findOne: jest.fn().mockResolvedValue(result) }),
    );

    const resolved = await service.processCompletedAnalysis("a-1");

    expect(resolved).toEqual({ resolved_count: 1, ticket_ids: ["t-hidden"] });
  });
});
