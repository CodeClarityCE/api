import {
  createCVSS3Calculator,
  createCVSS3Parser,
  createCVSS31Calculator,
  createCVSS31Parser,
} from "src/lib/cvss-parser";

// Base score of a CVSS 3.0 or 3.1 vector, or null when it cannot be parsed.
export function cvss3Score(vector: string): number | null {
  try {
    if (vector.startsWith("CVSS:3.1/")) {
      const calculator = createCVSS31Calculator();
      calculator.computeBaseScore(createCVSS31Parser().parse(vector));
      return calculator.getBaseScore(true);
    }
    if (vector.startsWith("CVSS:3.0/")) {
      const calculator = createCVSS3Calculator();
      calculator.computeBaseScore(createCVSS3Parser().parse(vector));
      return calculator.getBaseScore(true);
    }
  } catch {
    return null;
  }
  return null;
}
