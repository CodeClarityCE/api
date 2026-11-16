import { CodeClarityLogger } from "src/services/logger.service";

import type { PluginsRepository } from "../plugins/plugin.repository";

import { PluginAvailabilityService } from "./plugin-availability.service";
import { PluginDownWatch } from "./plugin-down-watch";
import { InMemoryConsumerProbe } from "./testing/in-memory-consumer-probe";

const DOWN = "A plugin that should run is down";

describe("PluginDownWatch", () => {
  let probe: InMemoryConsumerProbe;
  let getAll: jest.Mock;
  let watch: PluginDownWatch;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    probe = new InMemoryConsumerProbe();
    getAll = jest
      .fn()
      .mockResolvedValue([
        { name: "js-sbom" },
        { name: "vuln-finder" },
        { name: "codeql" },
      ]);
    probe.consumers.set("js-sbom", 1);
    probe.consumers.set("vuln-finder", 1);
    const plugins = { getAll } as unknown as PluginsRepository;
    watch = new PluginDownWatch(
      Object.assign(new PluginAvailabilityService(probe), {
        cacheMs: 0,
      }),
      plugins,
    );
    warn = jest.spyOn(CodeClarityLogger.prototype, "warn");
  });

  afterEach(() => {
    warn.mockRestore();
    watch.onApplicationShutdown();
  });

  function downWarnings(): unknown[][] {
    return warn.mock.calls.filter(([message]) => message === DOWN);
  }

  it("warns about a registered default plugin that stopped, with no request", async () => {
    probe.consumers.set("vuln-finder", 0);
    await watch.check();
    expect(downWarnings()).toEqual([[DOWN, { plugin: "vuln-finder" }]]);
  });

  it("says nothing about an optional component that is off", async () => {
    await watch.check();
    expect(downWarnings()).toEqual([]);
  });

  it("keeps watching when the plugin list cannot be read", async () => {
    getAll.mockRejectedValueOnce(new Error("db down"));
    await expect(watch.check()).resolves.toBeUndefined();
  });
});
