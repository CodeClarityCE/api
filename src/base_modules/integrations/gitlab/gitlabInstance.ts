import {
  ImportTargetNotAllowed,
  IntegrationInstanceUnreachable,
  IntegrationInstanceUrlNotAllowed,
} from "src/types/error.types";
import {
  gitlabAllowedPrivateHosts,
  HostLookupFailed,
  pinnedFetch,
  resolveOutboundUrl,
} from "src/utils/outbound-url";

/** https and public addresses only, unless the operator allows the host */
export function gitlabPolicy(): {
  httpsOnly: true;
  allowedPrivateHosts: string[];
} {
  return { httpsOnly: true, allowedPrivateHosts: gitlabAllowedPrivateHosts() };
}

function refusal(err: unknown): unknown {
  if (err instanceof HostLookupFailed)
    return new IntegrationInstanceUnreachable(err);
  if (err instanceof ImportTargetNotAllowed)
    return new IntegrationInstanceUrlNotAllowed(err);
  return err;
}

/**
 * Check that a GitLab instance url may be called.
 * @throws {IntegrationInstanceUrlNotAllowed}
 * @throws {IntegrationInstanceUnreachable}
 */
export async function assertGitlabInstanceAllowed(url: string): Promise<void> {
  try {
    await resolveOutboundUrl(url, gitlabPolicy());
  } catch (err) {
    throw refusal(err);
  }
}

/**
 * Fetch a url on a GitLab instance, connecting only to its vetted addresses.
 * @throws {IntegrationInstanceUrlNotAllowed}
 * @throws {IntegrationInstanceUnreachable}
 */
export async function gitlabFetch(
  url: string,
  init: { headers?: Record<string, string> } = {},
): Promise<Response> {
  try {
    return await pinnedFetch(url, { ...gitlabPolicy(), ...init });
  } catch (err) {
    throw refusal(err);
  }
}

/** An instance url without trailing slashes, ready for "/api/v4/..." */
export function instanceBase(instanceUrl: string): string {
  // A loop, not /\/+$/, which is quadratic on long runs of slashes
  let end = instanceUrl.length;
  while (end > 0 && instanceUrl[end - 1] === "/") end--;
  return instanceUrl.slice(0, end);
}
