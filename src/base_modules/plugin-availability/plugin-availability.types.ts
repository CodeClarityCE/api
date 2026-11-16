/** Whether a plugin can take work: "off" means its optional component was never turned on. */
export type PluginState = "available" | "off";

/** Whether an analyzer can run here, and if not, why in words for users. */
export type AnalyzerAvailability =
  | { state: "available" }
  | { state: "off"; components: string[]; message: string };
