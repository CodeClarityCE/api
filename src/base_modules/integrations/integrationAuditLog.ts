import { IntegrationProvider } from "./integrations.entity";

const providerNames: Record<IntegrationProvider, string> = {
  [IntegrationProvider.GITHUB]: "GitHub",
  [IntegrationProvider.GITLAB]: "GitLab",
  [IntegrationProvider.FILE]: "file",
};

/** Names an integration for an audit log description, e.g. "GitHub integration at github.com". Never includes its token. */
export function describeIntegration(integration: {
  integration_provider: IntegrationProvider;
  service_domain: string;
}): string {
  return `${providerNames[integration.integration_provider]} integration at ${integration.service_domain}`;
}
