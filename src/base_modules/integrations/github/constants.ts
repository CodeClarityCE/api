/* Defines after how many minutes the vcs repos should be marked as invalidated */
/* If the user then wants to retrieve repos, the cache date is check and if more than 10 minutes old, will be re-synced */
export const CONST_VCS_INTEGRATION_CACHE_INVALIDATION_MINUTES = 10;

/* "Popular on GitHub" import source: top-N most-starred repositories per supported language */
/* Maximum number of repositories exposed after merging the per-language rankings */
export const CONST_POPULAR_REPOS_LIMIT = 100;
/* Search qualifier lower bound; keeps the GitHub search cheap and the ranking meaningful */
export const CONST_POPULAR_REPOS_MIN_STARS = 1000;
/* How long a per-language ranking is served from memory before GitHub is asked again */
export const CONST_POPULAR_REPOS_CACHE_TTL_MINUTES = 60;
/* Shorter TTL used when GitHub reported incomplete_results (search timed out server-side) */
export const CONST_POPULAR_REPOS_INCOMPLETE_TTL_MINUTES = 5;
/* A force_refresh is honoured only if the cached ranking is older than this */
export const CONST_POPULAR_REPOS_MIN_REFRESH_MINUTES = 5;
