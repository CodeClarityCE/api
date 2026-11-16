/**
 * Whether a plugin can take work: "off" means its optional component was never
 * turned on, "down" that a plugin which should run has stopped.
 */
export type PluginState = "available" | "off" | "down";

/** Whether an analyzer can run here, and if not, why in words for users. */
export type AnalyzerAvailability =
  | { state: "available" }
  | { state: "off"; components: string[]; message: string }
  | { state: "down"; plugins: string[]; message: string };
