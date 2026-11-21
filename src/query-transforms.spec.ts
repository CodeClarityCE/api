import { ValidationPipe } from "@nestjs/common";

import { DashboardQueryOptions } from "./codeclarity_modules/dashboard/dashboard.types";
import { OrganizationVulnerabilitiesQuery } from "./codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";

// The global pipe, configured as in app.globals.ts.
const pipe = new ValidationPipe({ stopAtFirstError: true });

async function parse(
  metatype: new () => object,
  query: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return (await pipe.transform(query, { type: "query", metatype })) as Record<
    string,
    unknown
  >;
}

describe("query transforms through the global pipe", () => {
  it("leave unset vulnerability list filters unset", async () => {
    const parsed = await parse(OrganizationVulnerabilitiesQuery, {});

    expect(parsed["project"]).toBeUndefined();
    expect(parsed["severity"]).toBeUndefined();
    expect(parsed["ecosystem"]).toBeUndefined();
    expect(parsed["show"]).toBeUndefined();
    expect(parsed["known_exploited"]).toBeUndefined();
    expect(parsed["page"]).toBe(0);
  });

  it("split lists and parse numbers and booleans", async () => {
    const parsed = await parse(OrganizationVulnerabilitiesQuery, {
      page: "2",
      severity: "HIGH,CRITICAL",
      ecosystem: ["npm", "PyPI"],
      known_exploited: "true",
    });

    expect(parsed["page"]).toBe(2);
    expect(parsed["severity"]).toEqual(["HIGH", "CRITICAL"]);
    expect(parsed["ecosystem"]).toEqual(["npm", "PyPI"]);
    expect(parsed["known_exploited"]).toBe(true);
  });

  it("leave unset dashboard integrations unset", async () => {
    const parsed = await parse(DashboardQueryOptions, {});

    expect(parsed["integrationIds"]).toBeUndefined();
  });
});
