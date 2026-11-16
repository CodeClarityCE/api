import { CodeClarityLogger } from "src/services/logger.service";

import { AnalyzerUnavailable } from "./plugin-availability.errors";
import { PluginAvailabilityService } from "./plugin-availability.service";
import { InMemoryConsumerProbe } from "./testing/in-memory-consumer-probe";

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
    service = Object.assign(new PluginAvailabilityService(probe), {
      cacheMs: 0,
    });
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

  it("says a stopped default plugin is temporarily down, naming it", async () => {
    probe.consumers.set("vuln-finder", 0);
    await expect(service.ofAnalyzer(defaultAnalyzer)).resolves.toEqual({
      state: "down",
      plugins: ["vuln-finder"],
      message: "vuln-finder is temporarily down. Try again shortly.",
    });
  });

  it("names every stopped default plugin", async () => {
    probe.consumers.set("js-sbom", 0);
    probe.consumers.set("license-finder", 0);
    await expect(service.ofAnalyzer(defaultAnalyzer)).resolves.toMatchObject({
      state: "down",
      plugins: ["js-sbom", "license-finder"],
      message:
        "js-sbom and license-finder are temporarily down. Try again shortly.",
    });
  });

  it("says off rather than down when an optional component is also off", async () => {
    probe.consumers.set("js-sbom", 0);
    await expect(service.ofAnalyzer(codeqlAnalyzer)).resolves.toMatchObject({
      state: "off",
      components: ["CodeQL"],
    });
  });

  it("says the analyzer is available again once the plugin restarts", async () => {
    probe.consumers.set("vuln-finder", 0);
    await service.ofAnalyzer(defaultAnalyzer);
    probe.consumers.set("vuln-finder", 1);
    await expect(service.ofAnalyzer(defaultAnalyzer)).resolves.toEqual({
      state: "available",
    });
  });

  it("refuses an analyzer whose plugin is down with the same reason", async () => {
    probe.consumers.set("vuln-finder", 0);
    await expect(
      service.assertAvailable(defaultAnalyzer),
    ).rejects.toMatchObject({
      error_code: "AnalyzerUnavailable",
      error_message: "vuln-finder is temporarily down. Try again shortly.",
      status_code: 409,
    });
  });

  it("warns once, naming the plugin, when a default plugin goes down", async () => {
    const warn = jest.spyOn(CodeClarityLogger.prototype, "warn");
    probe.consumers.set("vuln-finder", 0);
    await service.ofAnalyzer(defaultAnalyzer);
    await service.ofAnalyzer(defaultAnalyzer);
    const downWarnings = warn.mock.calls.filter(
      ([message]) => message === "A plugin that should run is down",
    );
    expect(downWarnings).toEqual([
      ["A plugin that should run is down", { plugin: "vuln-finder" }],
    ]);
    warn.mockRestore();
  });

  it("logs when a down plugin is back", async () => {
    const log = jest.spyOn(CodeClarityLogger.prototype, "log");
    probe.consumers.set("vuln-finder", 0);
    await service.ofAnalyzer(defaultAnalyzer);
    probe.consumers.set("vuln-finder", 1);
    await service.ofAnalyzer(defaultAnalyzer);
    expect(log).toHaveBeenCalledWith("A plugin that was down is back", {
      plugin: "vuln-finder",
    });
    log.mockRestore();
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
    const cached = Object.assign(new PluginAvailabilityService(probe), {
      cacheMs: 60_000,
    });
    await cached.ofAnalyzer(codeqlAnalyzer);
    probe.consumers.set("codeql", 1);
    await expect(cached.ofAnalyzer(codeqlAnalyzer)).resolves.toMatchObject({
      state: "off",
    });
  });
});
