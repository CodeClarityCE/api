// Pure derivation of the uncorroborated label (see GLOSSARY.md); no Nest imports,
// so experiments can use it too.
import {
  type SourceVerdict,
  SourceVerdictValue,
} from "src/codeclarity_modules/results/source-comparison/source-match.types";

import { type SourceOrigin, sourceOrigin } from "./source-origin";

// Verdicts saying a source has a record that names packages for this vulnerability.
// No package data, no record and stale or failed say nothing about the package.
const HOLDS_PACKAGE_DATA: ReadonlySet<SourceVerdictValue> = new Set([
  SourceVerdictValue.Matched,
  SourceVerdictValue.VersionExcluded,
  SourceVerdictValue.NamesAnotherProduct,
  SourceVerdictValue.Retired,
]);

// True when sources of one origin only matched and no source of another origin
// holds package data. False for older analyses without verdicts.
export function isUncorroborated(
  verdicts: SourceVerdict[] | undefined,
): boolean {
  if (!verdicts) return false;
  const matched = new Set<SourceOrigin>();
  for (const v of verdicts) {
    const origin = sourceOrigin(v.source);
    if (origin && v.verdict === SourceVerdictValue.Matched) matched.add(origin);
  }
  if (matched.size !== 1) return false;
  const [origin] = matched;
  return !verdicts.some((v) => {
    const other = sourceOrigin(v.source);
    return (
      other !== undefined &&
      other !== origin &&
      HOLDS_PACKAGE_DATA.has(v.verdict)
    );
  });
}
