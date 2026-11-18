import { deriveLanguages, languagesToSync } from "./analyzer-languages";
import type { PluginDependencies } from "./workflow-rules";

// The installed plugins, with js-patching reading only the JavaScript SBOM.
const plugins: PluginDependencies[] = [
  { name: "js-sbom", depends_on: [] },
  { name: "php-sbom", depends_on: [] },
  { name: "vuln-finder", depends_on: ["js-sbom", "php-sbom"] },
  { name: "license-finder", depends_on: ["js-sbom", "php-sbom"] },
  { name: "js-patching", depends_on: ["js-sbom", "vuln-finder"] },
  { name: "codeql", depends_on: [] },
];

const step = (name: string) => ({ name, version: "v1", config: {} });

describe("deriveLanguages", () => {
  it("lists js-patching only under javascript in the multi-language template", () => {
    const steps = [
      [step("js-sbom"), step("php-sbom")],
      [step("vuln-finder"), step("license-finder")],
      [step("js-patching")],
    ];

    expect(deriveLanguages(steps, ["javascript", "php"], plugins)).toEqual({
      supported_languages: ["javascript", "php"],
      language_config: {
        javascript: {
          plugins: ["js-sbom", "vuln-finder", "license-finder", "js-patching"],
        },
        php: { plugins: ["php-sbom", "vuln-finder", "license-finder"] },
      },
    });
  });
});

describe("languagesToSync", () => {
  // Saved from the JavaScript template, then given codeql and js-patching.
  const staleAnalyzer = () => ({
    steps: [
      [step("js-sbom"), step("codeql")],
      [step("vuln-finder"), step("license-finder")],
      [step("js-patching")],
    ],
    supported_languages: ["javascript"],
    language_config: {
      javascript: { plugins: ["js-sbom", "vuln-finder", "license-finder"] },
    },
  });

  it("gives the derived languages of a template-based analyzer whose saved ones are stale", () => {
    expect(languagesToSync(staleAnalyzer(), plugins)).toEqual({
      supported_languages: ["javascript"],
      language_config: {
        javascript: {
          plugins: [
            "js-sbom",
            "codeql",
            "vuln-finder",
            "license-finder",
            "js-patching",
          ],
        },
      },
    });
  });

  it("gives nothing for an analyzer without a language configuration", () => {
    for (const language_config of [{}, null, undefined]) {
      expect(
        languagesToSync({ ...staleAnalyzer(), language_config }, plugins),
      ).toBeNull();
    }
  });

  it("gives nothing when the saved languages already match, in any order", () => {
    const analyzer = {
      ...staleAnalyzer(),
      steps: [[step("js-sbom"), step("php-sbom")], [step("vuln-finder")]],
      supported_languages: ["php", "javascript"],
      // Postgres returns jsonb keys shortest first.
      language_config: {
        php: { plugins: ["vuln-finder", "php-sbom"] },
        javascript: { plugins: ["js-sbom", "vuln-finder"] },
      },
    };

    expect(languagesToSync(analyzer, plugins)).toBeNull();
  });
});
