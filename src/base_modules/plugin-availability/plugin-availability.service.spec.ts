import { InMemoryConsumerProbe } from "./consumer-probe";
import { AnalyzerUnavailable } from "./plugin-availability.errors";
import { PluginAvailabilityService } from "./plugin-availability.service";

function steps(...stages: string[][]): { name: string }[][] {
  return stages.map((stage) => stage.map((name) => ({ name })));
}

const defaultAnalyzer = steps(
  ["js-sbom", "php-sbom"],
  ["vuln-finder", "license-finder"],
);
const codeqlAnalyzer = steps(["js-sbom", "codeql"], ["vuln-finder"]);

describe("PluginAvailabilityService", () => {
  let probe: InMemoryConsumerProbe;
  let service: PluginAvailabilityService;

  beforeEach(() => {
    probe = new InMemoryConsumerProbe();
    for (const plugin of ["js-sbom", "php-sbom", "vuln-finder"]) {
      probe.consumers.set(plugin, 1);
    }
    probe.consumers.set("license-finder", 2);
    service = new PluginAvailabilityService(probe, { cacheMs: 0 });
  });

  it("says an analyzer of running plugins is available", async () => {
    await expect(service.ofAnalyzer(defaultAnalyzer)).resolves.toEqual({
      state: "available",
    });
  });

  it("names CodeQL when nothing listens for it", async () => {
    await expect(service.ofAnalyzer(codeqlAnalyzer)).resolves.toEqual({
      state: "off",
      components: ["CodeQL"],
      message: "Needs CodeQL, which is off on this instance.",
    });
  });

  it("says the analyzer is available again once CodeQL listens", async () => {
    await service.ofAnalyzer(codeqlAnalyzer);
    probe.consumers.set("codeql", 1);
    await expect(service.ofAnalyzer(codeqlAnalyzer)).resolves.toEqual({
      state: "available",
    });
  });

  it("does not block an analyzer when the broker cannot be asked", async () => {
    probe.failWith = new Error("broker down");
    await expect(service.ofAnalyzer(codeqlAnalyzer)).resolves.toEqual({
      state: "available",
    });
  });

  it("refuses an unavailable analyzer with the same reason", async () => {
    const refusal = service.assertAvailable(codeqlAnalyzer);
    await expect(refusal).rejects.toBeInstanceOf(AnalyzerUnavailable);
    await expect(refusal).rejects.toMatchObject({
      error_code: "AnalyzerUnavailable",
      error_message: "Needs CodeQL, which is off on this instance.",
      status_code: 409,
    });
  });

  it("lets an available analyzer through", async () => {
    await expect(
      service.assertAvailable(defaultAnalyzer),
    ).resolves.toBeUndefined();
  });

  it("asks the broker once per plugin within the cache period", async () => {
    const cached = new PluginAvailabilityService(probe, { cacheMs: 60_000 });
    await cached.ofAnalyzer(codeqlAnalyzer);
    probe.consumers.set("codeql", 1);
    await expect(cached.ofAnalyzer(codeqlAnalyzer)).resolves.toMatchObject({
      state: "off",
    });
  });
});
