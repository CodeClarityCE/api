import { CVSS2Calculator } from "./calculators/cvss2/calc";
import { CVSS3Calculator } from "./calculators/cvss3/calc";
import { CVSS31Calculator } from "./calculators/cvss31/calc";
import { CVSS4Calculator } from "./calculators/cvss4/calc";
import { CVSS2VectorParser } from "./parsers/cvss2/parser";
import { CVSS3VectorParser } from "./parsers/cvss3/parser";
import { CVSS31VectorParser } from "./parsers/cvss31/parser";
import { CVSS4VectorParser } from "./parsers/cvss4/parser";

export function createCVSS2Parser(): CVSS2VectorParser {
  return new CVSS2VectorParser();
}

export function createCVSS3Parser(): CVSS3VectorParser {
  return new CVSS3VectorParser();
}

export function createCVSS31Parser(): CVSS31VectorParser {
  return new CVSS31VectorParser();
}

export function createCVSS4Parser(): CVSS4VectorParser {
  return new CVSS4VectorParser();
}

export function createCVSS2Calculator(): CVSS2Calculator {
  return new CVSS2Calculator();
}

export function createCVSS3Calculator(): CVSS3Calculator {
  return new CVSS3Calculator();
}

export function createCVSS31Calculator(): CVSS31Calculator {
  return new CVSS31Calculator();
}

export function createCVSS4Calculator(): CVSS4Calculator {
  return new CVSS4Calculator();
}
