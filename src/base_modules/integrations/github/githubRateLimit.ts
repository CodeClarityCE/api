export type GithubResponseHeaders = Record<string, string | number | undefined>;

/** GitHub API error with status code and (rate limit) response headers */
export interface GithubApiError {
  status?: number;
  message?: string;
  response?: {
    headers?: GithubResponseHeaders;
  };
}

/**
 * The delay GitHub asks for before the next request: retry-after, or the
 * reset of an exhausted primary rate limit. 0 when it names none.
 */
export function requestedRetryDelayMs(
  headers: GithubResponseHeaders,
  now: number,
): number {
  const retryAfterSeconds = Number(headers["retry-after"]);
  const rateLimitExhausted = String(headers["x-ratelimit-remaining"]) === "0";
  const resetEpochSeconds = Number(headers["x-ratelimit-reset"]);

  if (retryAfterSeconds > 0) return retryAfterSeconds * 1000;
  if (rateLimitExhausted && resetEpochSeconds > 0) {
    return Math.max(0, resetEpochSeconds * 1000 - now);
  }
  return 0;
}

/**
 * Whether a failed request hit a primary or secondary rate limit. GitHub
 * answers both with 403 or 429; a 403 without rate limit signals is a
 * permission problem (blocked or private repository) instead.
 */
export function isRateLimitError(err: GithubApiError): boolean {
  if (err.status === 429) return true;
  if (err.status !== 403) return false;
  const headers = err.response?.headers ?? {};
  return (
    String(headers["x-ratelimit-remaining"]) === "0" ||
    Number(headers["retry-after"]) > 0 ||
    /rate limit/i.test(err.message ?? "")
  );
}
