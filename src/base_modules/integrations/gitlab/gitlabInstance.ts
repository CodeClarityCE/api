import {
  ImportTargetNotAllowed,
  IntegrationInstanceUrlNotAllowed,
} from "src/types/error.types";
import {
  gitlabAllowedPrivateHosts,
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
  return err instanceof ImportTargetNotAllowed
    ? new IntegrationInstanceUrlNotAllowed(err)
    : err;
}

/**
 * Check that a GitLab instance url may be called.
 * @throws {IntegrationInstanceUrlNotAllowed}
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
  return instanceUrl.replace(/\/+$/, "");
}
