// What each source verdict says, shared by the instance status and the uncorroborated label.
import {
  type SourceVerdict,
  SourceVerdictValue,
} from "src/codeclarity_modules/results/source-comparison/source-match.types";

interface VerdictTraits {
  /** Denies a match made by a source of another origin. */
  contradicts: boolean;
  /** The source holds a live record for the instance. */
  liveRecord: boolean;
  /** The source holds a record that names packages for the vulnerability. */
  holdsPackageData: boolean;
}

export const VERDICT_TRAITS: Record<SourceVerdictValue, VerdictTraits> = {
  [SourceVerdictValue.Matched]: {
    contradicts: false,
    liveRecord: true,
    holdsPackageData: true,
  },
  [SourceVerdictValue.NoRecord]: {
    contradicts: false,
    liveRecord: false,
    holdsPackageData: false,
  },
  [SourceVerdictValue.StaleOrFailed]: {
    contradicts: false,
    liveRecord: false,
    holdsPackageData: false,
  },
  [SourceVerdictValue.VersionExcluded]: {
    contradicts: true,
    liveRecord: true,
    holdsPackageData: true,
  },
  [SourceVerdictValue.Retired]: {
    contradicts: true,
    liveRecord: false,
    holdsPackageData: true,
  },
  // Contradicts only when it names a package of the instance's ecosystem.
  [SourceVerdictValue.NamesAnotherProduct]: {
    contradicts: true,
    liveRecord: true,
    holdsPackageData: true,
  },
  [SourceVerdictValue.NoPackageData]: {
    contradicts: false,
    liveRecord: false,
    holdsPackageData: false,
  },
};

// True when the verdict denies a match on an instance of the given ecosystem.
export function contradicts(
  verdict: SourceVerdict,
  ecosystem: string | undefined,
): boolean {
  if (!VERDICT_TRAITS[verdict.verdict]?.contradicts) return false;
  if (verdict.verdict !== SourceVerdictValue.NamesAnotherProduct) return true;
  const wanted = ecosystem?.toLowerCase();
  const names: unknown = verdict.evidence?.names;
  return (
    !!wanted &&
    Array.isArray(names) &&
    (names as ({ ecosystem?: unknown } | null)[]).some(
      (name) =>
        typeof name?.ecosystem === "string" &&
        name.ecosystem.toLowerCase() === wanted,
    )
  );
}
