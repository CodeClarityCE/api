import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

/**
 * Primary languages the "Popular on GitHub" source ranks. Restricted to what
 * the SBOM plugins can analyse (js-sbom covers JavaScript and TypeScript,
 * php-sbom covers PHP): the unrestricted GitHub star ranking is dominated by
 * Markdown "awesome" lists that produce empty analyses.
 */
export const POPULAR_GITHUB_LANGUAGES = [
  "JavaScript",
  "TypeScript",
  "PHP",
] as const;

export type PopularGithubLanguage = (typeof POPULAR_GITHUB_LANGUAGES)[number];

/**
 * Parse the `languages` query parameter (comma separated, case-insensitive).
 * Unknown tokens are dropped; an empty or absent value means "all".
 */
export function parsePopularLanguages(raw?: string): PopularGithubLanguage[] {
  if (!raw) return [...POPULAR_GITHUB_LANGUAGES];
  const wanted = new Set(
    raw
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0),
  );
  const languages = POPULAR_GITHUB_LANGUAGES.filter((language) =>
    wanted.has(language.toLowerCase()),
  );
  return languages.length > 0 ? languages : [...POPULAR_GITHUB_LANGUAGES];
}

/**
 * A popular public repository as served to the import table. Shape mirrors
 * the frontend `Repository` entity (the same table renders both), plus the
 * star count and primary language. Every field is exposed explicitly because
 * the global ClassSerializerInterceptor runs with excludeExtraneousValues.
 */
export class PopularGithubRepository {
  /** GitHub's numeric repository id as a string; stable across refreshes. */
  @ApiProperty()
  @Expose()
  id!: string;

  /** html_url; the exact string the client posts back as the project url. */
  @ApiProperty()
  @Expose()
  url!: string;

  @ApiProperty()
  @Expose()
  default_branch!: string;

  @ApiProperty()
  @Expose()
  visibility!: string;

  @ApiProperty()
  @Expose()
  fully_qualified_name!: string;

  @ApiProperty()
  @Expose()
  description!: string;

  @ApiProperty()
  @Expose()
  created_at!: Date;

  /** Whether any member of the requesting organization already imported it. */
  @ApiProperty()
  @Expose()
  imported_already!: boolean;

  @ApiProperty()
  @Expose()
  integration_id!: string;

  @ApiProperty()
  @Expose()
  stargazers_count!: number;

  @ApiProperty()
  @Expose()
  language!: string;
}
