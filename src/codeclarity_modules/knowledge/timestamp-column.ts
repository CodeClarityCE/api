import type { ValueTransformer } from "typeorm";

// Keeps knowledge timestamps as ISO strings, the type API consumers already read.
export const timestampAsIso: ValueTransformer = {
  to: (value: unknown) => value,
  from: (value: Date | null) => value?.toISOString() ?? null,
};
