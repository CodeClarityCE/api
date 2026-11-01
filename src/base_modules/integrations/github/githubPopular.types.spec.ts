import {
  parsePopularLanguages,
  POPULAR_GITHUB_LANGUAGES,
} from "./githubPopular.types";

describe("parsePopularLanguages", () => {
  it("returns every supported language when the parameter is absent or blank", () => {
    expect(parsePopularLanguages(undefined)).toEqual([
      ...POPULAR_GITHUB_LANGUAGES,
    ]);
    expect(parsePopularLanguages("")).toEqual([...POPULAR_GITHUB_LANGUAGES]);
    expect(parsePopularLanguages(" , ")).toEqual([...POPULAR_GITHUB_LANGUAGES]);
  });

  it("matches case-insensitively, dedupes and keeps the canonical order", () => {
    expect(parsePopularLanguages("php, TYPESCRIPT,php")).toEqual([
      "TypeScript",
      "PHP",
    ]);
  });

  it("drops unknown languages and falls back to all when nothing matches", () => {
    expect(parsePopularLanguages("TypeScript,Rust")).toEqual(["TypeScript"]);
    expect(parsePopularLanguages("Rust,Go")).toEqual([
      ...POPULAR_GITHUB_LANGUAGES,
    ]);
  });
});
