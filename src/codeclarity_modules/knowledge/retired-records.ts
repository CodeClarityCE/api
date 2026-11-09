import { type FindOperator, IsNull } from "typeorm";

export interface KnowledgeLookupOptions {
  includeRetired?: boolean;
}

// Where-clause fragment that keeps retired records out unless a caller asks for them.
export function activeRecordFilter(options?: KnowledgeLookupOptions): {
  retired_at?: FindOperator<string>;
} {
  return options?.includeRetired
    ? {}
    : { retired_at: IsNull() as FindOperator<string> };
}
