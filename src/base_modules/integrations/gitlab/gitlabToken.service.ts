import { Injectable } from "@nestjs/common";

import { IntegrationTokenMissingPermissions } from "src/types/error.types";

import { BaseVCSTokenService } from "../base/baseVCSTokenService";
import {
  hasRequiredScopes,
  parseTokenExpiry,
  validateNotExpired,
} from "../utils/tokenValidation.utils";

import { gitlabFetch, instanceBase } from "./gitlabInstance";

@Injectable()
export class GitlabIntegrationTokenService extends BaseVCSTokenService {
  protected getDefaultScopes(): string[] {
    return ["read_repository", "read_user", "read_api", "self_rotate"];
  }

  protected async validateTokenScopes(
    token: string,
    requiredScopes: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const gitlabInstanceUrl = options?.["gitlabInstanceUrl"];
    if (!gitlabInstanceUrl || typeof gitlabInstanceUrl !== "string") {
      throw new Error(
        "gitlabInstanceUrl is required for GitLab token validation",
      );
    }

    const response = await gitlabFetch(
      `${instanceBase(gitlabInstanceUrl)}/api/v4/personal_access_tokens/self`,
      { headers: { "PRIVATE-TOKEN": token } },
    );

    if (!response.ok) {
      const error = new Error(
        `Failed to fetch token info: ${response.status}`,
      ) as Error & {
        status: number;
      };
      error.status = response.status;
      throw error;
    }

    const tokenInfo = (await response.json()) as { scopes?: string[] };

    // GitLab uses strict scope checking (no hierarchy)
    if (
      !tokenInfo?.scopes ||
      !hasRequiredScopes(tokenInfo.scopes, requiredScopes)
    ) {
      throw new IntegrationTokenMissingPermissions();
    }
  }

  protected async fetchTokenExpiry(
    token: string,
    options?: Record<string, unknown>,
  ): Promise<[boolean, Date | undefined]> {
    const gitlabInstanceUrl = options?.["gitlabInstanceUrl"];
    if (!gitlabInstanceUrl || typeof gitlabInstanceUrl !== "string") {
      throw new Error("gitlabInstanceUrl is required");
    }

    // Any token may read its own details; the admin token API needs an admin.
    const response = await gitlabFetch(
      `${instanceBase(gitlabInstanceUrl)}/api/v4/personal_access_tokens/self`,
      { headers: { "PRIVATE-TOKEN": token } },
    );

    if (!response.ok) {
      const error = new Error(
        `Failed to fetch token expiry: ${response.status}`,
      ) as Error & {
        status: number;
      };
      error.status = response.status;
      throw error;
    }

    const data = (await response.json()) as { expires_at?: string } | null;

    if (data?.expires_at) {
      const date = parseTokenExpiry(data.expires_at);
      if (date) {
        validateNotExpired(date);
        return [true, date];
      }
    }

    return [false, undefined];
  }

  /**
   * Validates that a given gitlab personal access token has the necessary scopes/permissions to perform the necessary actions withing the API
   * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param token The personal access token
   * @param gitlabInstanceUrl The host of the gitlab server (ex: https://gitlab.uni.lu)
   * @param additionalScopes We check the basic scopes needed for common actions. Any additional scopes can be defined here.
   * @returns
   */
  async validatePersonalAccessTokenPermissions(
    token: string,
    gitlabInstanceUrl: string,
    { additionalScopes = [] }: { additionalScopes?: string[] },
  ): Promise<void> {
    return this.validatePermissions(token, {
      additionalScopes,
      gitlabInstanceUrl,
    });
  }

  /**
   * Retrieves the expiry date of a personal access token from the provider
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param token The personal access token
   * @param gitlabInstanceUrl The host of the gitlab server (ex: https://gitlab.uni.lu)
   * @returns (1) a boolean indicating whether it has an expiry data at all (2) the expiry date (if any)
   */
  async getPersonalAccessTokenExpiryRemote(
    token: string,
    gitlabInstanceUrl: string,
  ): Promise<[boolean, Date | undefined]> {
    return this.getTokenExpiry(token, { gitlabInstanceUrl });
  }
}
