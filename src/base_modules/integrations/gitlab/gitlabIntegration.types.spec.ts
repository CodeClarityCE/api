import { plainToClass } from "class-transformer";
import { validate } from "class-validator";

import {
  IntegrationProvider,
  IntegrationType,
  VCSIntegrationMetaData,
} from "../integration.types";

import {
  GitlabIntegration,
  GitLabIntegrationCreate,
  GitLabIntegrationUpdate,
  GitlabTokenType,
  LinkGitlabCreateBody,
  LinkGitlabPatchBody,
} from "./gitlabIntegration.types";

describe("GitlabIntegration Types", () => {
  describe("GitlabTokenType", () => {
    it("should have correct enum values", () => {
      expect(GitlabTokenType.OAUTH_TOKEN).toBe("OAUTH_TOKEN");
      expect(GitlabTokenType.PERSONAL_ACCESS_TOKEN).toBe(
        "PERSONAL_ACCESS_TOKEN",
      );
    });
  });

  describe("GitlabIntegration", () => {
    it("should create a valid GitlabIntegration instance", () => {
      const gitlabIntegration = new GitlabIntegration();
      gitlabIntegration.id = "test-id";
      gitlabIntegration.service_base_url = "https://gitlab.com";
      gitlabIntegration.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      gitlabIntegration.organization_id = "test-org-id";
      gitlabIntegration.access_token = "glpat-test-token";
      gitlabIntegration.integration_type = IntegrationType.VCS;
      gitlabIntegration.integration_provider = IntegrationProvider.GITLAB;
      gitlabIntegration.added_on = new Date();
      gitlabIntegration.added_by = "test-user-id";
      gitlabIntegration.service_domain = "https://gitlab.com";
      gitlabIntegration.invalid = false;
      // expiry_date and refresh_token are already undefined by default
      gitlabIntegration.meta_data = new VCSIntegrationMetaData();

      expect(gitlabIntegration).toBeDefined();
      expect(gitlabIntegration.id).toBe("test-id");
      expect(gitlabIntegration.service_base_url).toBe("https://gitlab.com");
      expect(gitlabIntegration.token_type).toBe(
        GitlabTokenType.PERSONAL_ACCESS_TOKEN,
      );
      expect(gitlabIntegration.organization_id).toBe("test-org-id");
    });

    it("should properly transform and expose properties", () => {
      const plainObject = {
        id: "test-id",
        service_base_url: "https://gitlab.com",
        token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
        organization_id: "test-org-id",
        access_token: "glpat-test-token",
        integration_type: IntegrationType.VCS,
        integration_provider: IntegrationProvider.GITLAB,
        added_on: new Date(),
        added_by: "test-user-id",
        service_domain: "https://gitlab.com",
        invalid: false,
        expiry_date: undefined,
        refresh_token: undefined,
        meta_data: new VCSIntegrationMetaData(),
      };

      const gitlabIntegration = plainToClass(GitlabIntegration, plainObject);

      expect(gitlabIntegration.id).toBe("test-id");
      expect(gitlabIntegration.service_base_url).toBe("https://gitlab.com");
      expect(gitlabIntegration.token_type).toBe(
        GitlabTokenType.PERSONAL_ACCESS_TOKEN,
      );
      expect(gitlabIntegration.organization_id).toBe("test-org-id");
    });
  });

  describe("LinkGitlabCreateBody", () => {
    it("should validate a valid LinkGitlabCreateBody", async () => {
      const linkGitlabCreateBody = new LinkGitlabCreateBody();
      linkGitlabCreateBody.token = "glpat-test-token";
      linkGitlabCreateBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabCreateBody.gitlab_instance_url = "https://gitlab.com";

      const errors = await validate(linkGitlabCreateBody);
      expect(errors).toHaveLength(0);
    });

    it("should fail validation when token is empty", async () => {
      const linkGitlabCreateBody = new LinkGitlabCreateBody();
      linkGitlabCreateBody.token = "";
      linkGitlabCreateBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabCreateBody.gitlab_instance_url = "https://gitlab.com";

      const errors = await validate(linkGitlabCreateBody);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("token");
      expect(errors[0]!.constraints?.["isNotEmpty"]).toBeDefined();
    });

    it("should fail validation when token_type is invalid", async () => {
      const linkGitlabCreateBody = new LinkGitlabCreateBody();
      linkGitlabCreateBody.token = "glpat-test-token";
      linkGitlabCreateBody.token_type = "INVALID_TYPE" as GitlabTokenType;
      linkGitlabCreateBody.gitlab_instance_url = "https://gitlab.com";

      const errors = await validate(linkGitlabCreateBody);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("token_type");
      expect(errors[0]!.constraints?.["isEnum"]).toBeDefined();
    });

    it("should fail validation when gitlab_instance_url is not a valid URL", async () => {
      const linkGitlabCreateBody = new LinkGitlabCreateBody();
      linkGitlabCreateBody.token = "glpat-test-token";
      linkGitlabCreateBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabCreateBody.gitlab_instance_url = "not-a-valid-url";

      const errors = await validate(linkGitlabCreateBody);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("gitlab_instance_url");
      expect(errors[0]!.constraints?.["isUrl"]).toBeDefined();
    });

    it("should fail validation when gitlab_instance_url has no protocol", async () => {
      const linkGitlabCreateBody = new LinkGitlabCreateBody();
      linkGitlabCreateBody.token = "glpat-test-token";
      linkGitlabCreateBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabCreateBody.gitlab_instance_url = "gitlab.com";

      const errors = await validate(linkGitlabCreateBody);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("gitlab_instance_url");
      expect(errors[0]!.constraints?.["isUrl"]).toBeDefined();
    });

    it("should validate successfully with https protocol", async () => {
      const linkGitlabCreateBody = new LinkGitlabCreateBody();
      linkGitlabCreateBody.token = "glpat-test-token";
      linkGitlabCreateBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabCreateBody.gitlab_instance_url = "https://gitlab.example.com";

      const errors = await validate(linkGitlabCreateBody);
      expect(errors).toHaveLength(0);
    });

    it("should validate successfully with http protocol", async () => {
      const linkGitlabCreateBody = new LinkGitlabCreateBody();
      linkGitlabCreateBody.token = "glpat-test-token";
      linkGitlabCreateBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabCreateBody.gitlab_instance_url = "http://gitlab.example.com";

      const errors = await validate(linkGitlabCreateBody);
      expect(errors).toHaveLength(0);
    });
  });

  describe("LinkGitlabPatchBody", () => {
    it("should validate a valid LinkGitlabPatchBody", async () => {
      const linkGitlabPatchBody = new LinkGitlabPatchBody();
      linkGitlabPatchBody.token = "glpat-new-token";
      linkGitlabPatchBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabPatchBody.gitlab_instance_url = "https://gitlab.com";

      const errors = await validate(linkGitlabPatchBody);
      expect(errors).toHaveLength(0);
    });

    it("should fail validation when token is empty", async () => {
      const linkGitlabPatchBody = new LinkGitlabPatchBody();
      linkGitlabPatchBody.token = "";
      linkGitlabPatchBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabPatchBody.gitlab_instance_url = "https://gitlab.com";

      const errors = await validate(linkGitlabPatchBody);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("token");
      expect(errors[0]!.constraints?.["isNotEmpty"]).toBeDefined();
    });

    it("should fail validation when token_type is invalid", async () => {
      const linkGitlabPatchBody = new LinkGitlabPatchBody();
      linkGitlabPatchBody.token = "glpat-new-token";
      linkGitlabPatchBody.token_type = "INVALID_TYPE" as GitlabTokenType;
      linkGitlabPatchBody.gitlab_instance_url = "https://gitlab.com";

      const errors = await validate(linkGitlabPatchBody);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("token_type");
      expect(errors[0]!.constraints?.["isEnum"]).toBeDefined();
    });

    it("should fail validation when gitlab_instance_url is not a valid URL", async () => {
      const linkGitlabPatchBody = new LinkGitlabPatchBody();
      linkGitlabPatchBody.token = "glpat-new-token";
      linkGitlabPatchBody.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      linkGitlabPatchBody.gitlab_instance_url = "not-a-valid-url";

      const errors = await validate(linkGitlabPatchBody);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("gitlab_instance_url");
      expect(errors[0]!.constraints?.["isUrl"]).toBeDefined();
    });
  });

  describe("GitLabIntegrationCreate", () => {
    it("should create a valid GitLabIntegrationCreate instance", () => {
      const gitlabIntegrationCreate = new GitLabIntegrationCreate();
      gitlabIntegrationCreate.integration_type = IntegrationType.VCS;
      gitlabIntegrationCreate.integration_provider = IntegrationProvider.GITLAB;
      gitlabIntegrationCreate.added_on = new Date();
      gitlabIntegrationCreate.added_by = "test-user-id";
      gitlabIntegrationCreate.service_domain = "https://gitlab.com";
      gitlabIntegrationCreate.access_token = "glpat-test-token";
      // refresh_token and expiry_date are optional, omit if not needed
      gitlabIntegrationCreate.invalid = false;
      gitlabIntegrationCreate.service_base_url = "https://gitlab.com";
      gitlabIntegrationCreate.token_type =
        GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      gitlabIntegrationCreate.organization_id = "test-org-id";
      gitlabIntegrationCreate.meta_data = new VCSIntegrationMetaData();

      expect(gitlabIntegrationCreate).toBeDefined();
      expect(gitlabIntegrationCreate.integration_type).toBe(
        IntegrationType.VCS,
      );
      expect(gitlabIntegrationCreate.integration_provider).toBe(
        IntegrationProvider.GITLAB,
      );
      expect(gitlabIntegrationCreate.token_type).toBe(
        GitlabTokenType.PERSONAL_ACCESS_TOKEN,
      );
      expect(gitlabIntegrationCreate.service_base_url).toBe(
        "https://gitlab.com",
      );
      expect(gitlabIntegrationCreate.organization_id).toBe("test-org-id");
    });

    it("should handle optional fields correctly", () => {
      const gitlabIntegrationCreate = new GitLabIntegrationCreate();
      gitlabIntegrationCreate.integration_type = IntegrationType.VCS;
      gitlabIntegrationCreate.integration_provider = IntegrationProvider.GITLAB;
      gitlabIntegrationCreate.added_on = new Date();
      gitlabIntegrationCreate.added_by = "test-user-id";
      gitlabIntegrationCreate.service_domain = "https://gitlab.com";
      gitlabIntegrationCreate.access_token = "glpat-test-token";
      gitlabIntegrationCreate.invalid = false;
      gitlabIntegrationCreate.service_base_url = "https://gitlab.com";
      gitlabIntegrationCreate.token_type =
        GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      gitlabIntegrationCreate.organization_id = "test-org-id";
      gitlabIntegrationCreate.meta_data = new VCSIntegrationMetaData();

      expect(gitlabIntegrationCreate.refresh_token).toBeUndefined();
      expect(gitlabIntegrationCreate.expiry_date).toBeUndefined();
    });

    it("should handle expiry date when provided", () => {
      const expiryDate = new Date();
      const gitlabIntegrationCreate = new GitLabIntegrationCreate();
      gitlabIntegrationCreate.integration_type = IntegrationType.VCS;
      gitlabIntegrationCreate.integration_provider = IntegrationProvider.GITLAB;
      gitlabIntegrationCreate.added_on = new Date();
      gitlabIntegrationCreate.added_by = "test-user-id";
      gitlabIntegrationCreate.service_domain = "https://gitlab.com";
      gitlabIntegrationCreate.access_token = "glpat-test-token";
      gitlabIntegrationCreate.expiry_date = expiryDate;
      gitlabIntegrationCreate.invalid = false;
      gitlabIntegrationCreate.service_base_url = "https://gitlab.com";
      gitlabIntegrationCreate.token_type =
        GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      gitlabIntegrationCreate.organization_id = "test-org-id";
      gitlabIntegrationCreate.meta_data = new VCSIntegrationMetaData();

      expect(gitlabIntegrationCreate.expiry_date).toBe(expiryDate);
    });
  });

  describe("GitLabIntegrationUpdate", () => {
    it("should create a valid GitLabIntegrationUpdate instance", () => {
      const gitlabIntegrationUpdate = new GitLabIntegrationUpdate();
      gitlabIntegrationUpdate.access_token = "glpat-new-token";
      gitlabIntegrationUpdate.refresh_token = undefined;
      gitlabIntegrationUpdate.expiry_date = undefined;
      gitlabIntegrationUpdate.invalid = false;
      gitlabIntegrationUpdate.token_type =
        GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      gitlabIntegrationUpdate.service_base_url = "https://gitlab.com";
      gitlabIntegrationUpdate.service_domain = "https://gitlab.com";
      gitlabIntegrationUpdate.meta_data = new VCSIntegrationMetaData();

      expect(gitlabIntegrationUpdate).toBeDefined();
      expect(gitlabIntegrationUpdate.access_token).toBe("glpat-new-token");
      expect(gitlabIntegrationUpdate.token_type).toBe(
        GitlabTokenType.PERSONAL_ACCESS_TOKEN,
      );
      expect(gitlabIntegrationUpdate.service_base_url).toBe(
        "https://gitlab.com",
      );
      expect(gitlabIntegrationUpdate.service_domain).toBe("https://gitlab.com");
    });

    it("should handle optional fields correctly", () => {
      const gitlabIntegrationUpdate = new GitLabIntegrationUpdate();
      gitlabIntegrationUpdate.access_token = "glpat-new-token";
      gitlabIntegrationUpdate.invalid = false;
      gitlabIntegrationUpdate.token_type =
        GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      gitlabIntegrationUpdate.service_base_url = "https://gitlab.com";
      gitlabIntegrationUpdate.service_domain = "https://gitlab.com";
      gitlabIntegrationUpdate.meta_data = new VCSIntegrationMetaData();

      expect(gitlabIntegrationUpdate.refresh_token).toBeUndefined();
      expect(gitlabIntegrationUpdate.expiry_date).toBeUndefined();
    });

    it("should handle refresh token when provided", () => {
      const gitlabIntegrationUpdate = new GitLabIntegrationUpdate();
      gitlabIntegrationUpdate.access_token = "glpat-new-token";
      gitlabIntegrationUpdate.refresh_token = "refresh-token";
      gitlabIntegrationUpdate.expiry_date = undefined;
      gitlabIntegrationUpdate.invalid = false;
      gitlabIntegrationUpdate.token_type =
        GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      gitlabIntegrationUpdate.service_base_url = "https://gitlab.com";
      gitlabIntegrationUpdate.service_domain = "https://gitlab.com";
      gitlabIntegrationUpdate.meta_data = new VCSIntegrationMetaData();

      expect(gitlabIntegrationUpdate.refresh_token).toBe("refresh-token");
    });

    it("should handle expiry date when provided", () => {
      const expiryDate = new Date();
      const gitlabIntegrationUpdate = new GitLabIntegrationUpdate();
      gitlabIntegrationUpdate.access_token = "glpat-new-token";
      gitlabIntegrationUpdate.refresh_token = undefined;
      gitlabIntegrationUpdate.expiry_date = expiryDate;
      gitlabIntegrationUpdate.invalid = false;
      gitlabIntegrationUpdate.token_type =
        GitlabTokenType.PERSONAL_ACCESS_TOKEN;
      gitlabIntegrationUpdate.service_base_url = "https://gitlab.com";
      gitlabIntegrationUpdate.service_domain = "https://gitlab.com";
      gitlabIntegrationUpdate.meta_data = new VCSIntegrationMetaData();

      expect(gitlabIntegrationUpdate.expiry_date).toBe(expiryDate);
    });
  });
});
