import { Inject, Injectable, Optional } from "@nestjs/common";

import { CodeClarityLogger } from "src/services/logger.service";

import { ConsumerProbe } from "./consumer-probe";
import { OPTIONAL_COMPONENTS } from "./optional-components";
import { AnalyzerUnavailable } from "./plugin-availability.errors";
import type {
  AnalyzerAvailability,
  PluginState,
} from "./plugin-availability.types";

export type { AnalyzerAvailability, PluginState };

export interface PluginAvailabilityOptions {
  /** How long a plugin's consumer count is reused before the broker is asked again. */
  cacheMs: number;
}

export const PLUGIN_AVAILABILITY_OPTIONS = Symbol("PluginAvailabilityOptions");

const DEFAULT_OPTIONS: PluginAvailabilityOptions = { cacheMs: 5_000 };

type Steps = readonly (readonly { name: string }[])[];

function offMessage(components: string[]): string {
  const names =
    components.length === 1
      ? components[0]!
      : `${components.slice(0, -1).join(", ")} and ${components.at(-1)!}`;
  const verb = components.length === 1 ? "is" : "are";
  return `Needs ${names}, which ${verb} off on this instance.`;
}

/**
 * Tells live which plugins can take work, from whether anything consumes
 * their dispatch queues, so no setting has to be kept in sync with Compose.
 */
@Injectable()
export class PluginAvailabilityService {
  private readonly logger = CodeClarityLogger.forService("PluginAvailability");
  private readonly options: PluginAvailabilityOptions;
  private readonly cache = new Map<
    string,
    { at: number; state: Promise<PluginState> }
  >();

  constructor(
    private readonly probe: ConsumerProbe,
    @Optional()
    @Inject(PLUGIN_AVAILABILITY_OPTIONS)
    options?: PluginAvailabilityOptions,
  ) {
    this.options = options ?? DEFAULT_OPTIONS;
  }

  /** The state of one plugin; a broker that cannot be asked never blocks it. */
  pluginState(plugin: string): Promise<PluginState> {
    const now = Date.now();
    const cached = this.cache.get(plugin);
    if (cached && now - cached.at < this.options.cacheMs) return cached.state;
    const state = this.probeState(plugin);
    this.cache.set(plugin, { at: now, state });
    return state;
  }

  /** Whether every plugin of an analyzer's steps can take work. */
  async ofAnalyzer(steps: Steps): Promise<AnalyzerAvailability> {
    const plugins = [...new Set(steps.flat().map((step) => step.name))];
    const states = await Promise.all(
      plugins.map((plugin) => this.pluginState(plugin)),
    );
    const off = plugins
      .filter((_, i) => states[i] === "off")
      .map((plugin) => OPTIONAL_COMPONENTS[plugin] ?? plugin);
    if (off.length === 0) return { state: "available" };
    return { state: "off", components: off, message: offMessage(off) };
  }

  /**
   * Throws unless an analyzer's plugins can all take work.
   * @throws {AnalyzerUnavailable} With the same message the UI shows
   */
  async assertAvailable(steps: Steps): Promise<void> {
    const availability = await this.ofAnalyzer(steps);
    if (availability.state !== "available") {
      throw new AnalyzerUnavailable(availability.message);
    }
  }

  private async probeState(plugin: string): Promise<PluginState> {
    let consumers: number;
    try {
      consumers = await this.probe.count(plugin);
    } catch (err) {
      this.cache.delete(plugin);
      this.logger.warn("Could not count a plugin's consumers", {
        plugin,
        error: err instanceof Error ? err.message : String(err),
      });
      return "available";
    }
    if (consumers > 0) return "available";
    // Only an optional component can be off; a stopped default plugin is not.
    return plugin in OPTIONAL_COMPONENTS ? "off" : "available";
  }
}
