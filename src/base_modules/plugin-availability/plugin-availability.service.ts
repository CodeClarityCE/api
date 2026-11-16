import { Injectable } from "@nestjs/common";

import { CodeClarityLogger } from "src/services/logger.service";

import { ConsumerProbe } from "./consumer-probe";
import { OPTIONAL_COMPONENTS } from "./optional-components";
import { AnalyzerUnavailable } from "./plugin-availability.errors";
import type {
  AnalyzerAvailability,
  PluginState,
} from "./plugin-availability.types";

type Steps = readonly (readonly { name: string }[])[];

function listOf(names: string[]): string {
  return names.length === 1
    ? names[0]!
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}

function offMessage(components: string[]): string {
  const verb = components.length === 1 ? "is" : "are";
  return `Needs ${listOf(components)}, which ${verb} off on this instance.`;
}

function downMessage(plugins: string[]): string {
  const verb = plugins.length === 1 ? "is" : "are";
  return `${listOf(plugins)} ${verb} temporarily down. Try again shortly.`;
}

/**
 * Tells live which plugins can take work, from whether anything consumes
 * their dispatch queues, so no setting has to be kept in sync with Compose.
 */
@Injectable()
export class PluginAvailabilityService {
  private readonly logger = CodeClarityLogger.forService("PluginAvailability");
  /** How long a plugin's consumer count is reused before the broker is asked again. */
  cacheMs = 5_000;
  private readonly cache = new Map<
    string,
    { at: number; state: Promise<PluginState> }
  >();
  // Default plugins last seen down, so each outage is logged once
  private readonly down = new Set<string>();

  constructor(private readonly probe: ConsumerProbe) {}

  /** The state of one plugin; a broker that cannot be asked never blocks it. */
  pluginState(plugin: string): Promise<PluginState> {
    const now = Date.now();
    const cached = this.cache.get(plugin);
    if (cached && now - cached.at < this.cacheMs) return cached.state;
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
    if (off.length > 0) {
      return { state: "off", components: off, message: offMessage(off) };
    }
    const down = plugins.filter((_, i) => states[i] === "down");
    if (down.length > 0) {
      return { state: "down", plugins: down, message: downMessage(down) };
    }
    return { state: "available" };
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
      // Fail open: a broker that cannot be asked counts as available
      this.cache.delete(plugin);
      this.logger.warn("Could not count a plugin's consumers", {
        plugin,
        error: err instanceof Error ? err.message : String(err),
      });
      return "available";
    }
    // Only an optional component can be off; a stopped default plugin is down.
    if (consumers === 0 && plugin in OPTIONAL_COMPONENTS) return "off";
    const state = consumers > 0 ? "available" : "down";
    this.noteTransition(plugin, state);
    return state;
  }

  /** Warns the operator when a default plugin stops, and says when it is back. */
  private noteTransition(plugin: string, state: "available" | "down"): void {
    if (state === "down" && !this.down.has(plugin)) {
      this.down.add(plugin);
      this.logger.warn("A plugin that should run is down", { plugin });
    } else if (state === "available" && this.down.delete(plugin)) {
      this.logger.log("A plugin that was down is back", { plugin });
    }
  }
}
