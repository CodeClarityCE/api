import { GitlabTokenType } from "src/base_modules/integrations/gitlab/gitlabIntegration.types";
import { IntegrationWrongTokenType } from "src/types/error.types";

import type { GitlabIntegrationTokenService } from "./gitlab/gitlabToken.service";
import { GitlabIntegrationToken } from "./Token";

describe("GitlabIntegrationToken", () => {
  const service = {
    validatePersonalAccessTokenPermissions: jest.fn(),
  };

  const tokenOfType = (type: GitlabTokenType): GitlabIntegrationToken =>
    new GitlabIntegrationToken(
      service as unknown as GitlabIntegrationTokenService,
      "integration-1",
      "glpat-test-token",
      type,
      "https://gitlab.example.com",
    );

  beforeEach(() => jest.clearAllMocks());

  it("validates a personal access token against its instance", async () => {
    await tokenOfType(GitlabTokenType.PERSONAL_ACCESS_TOKEN).validate();

    expect(service.validatePersonalAccessTokenPermissions).toHaveBeenCalledWith(
      "glpat-test-token",
      "https://gitlab.example.com",
      {},
    );
  });

  it("rejects an OAuth token, since GitLab integrations use personal access tokens", async () => {
    await expect(
      tokenOfType(GitlabTokenType.OAUTH_TOKEN).validate(),
    ).rejects.toThrow(IntegrationWrongTokenType);
  });
});
