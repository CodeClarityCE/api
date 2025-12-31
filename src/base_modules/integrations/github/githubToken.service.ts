import { Injectable } from "@nestjs/common";
import axios from "axios";

import { IntegrationTokenMissingPermissions } from "src/types/error.types";

import { BaseVCSTokenService } from "../base/baseVCSTokenService";
import {
  parseTokenExpiry,
  validateNotExpired,
} from "../utils/tokenValidation.utils";

@Injectable()
export class GithubIntegrationTokenService extends BaseVCSTokenService {
  private readonly GITHUB_API_URL = "https://api.github.com";

  protected getDefaultScopes(): string[] {
    return ["public_repo"];
  }

  protected async validateTokenScopes(
    token: string,
    requiredScopes: string[],
    _options?: Record<string, unknown>,
  ): Promise<void> {
    const response = await axios.head(this.GITHUB_API_URL, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const headersString: string | undefined = response.headers[
      "x-oauth-scopes"
    ] as string | undefined;

    if (!headersString) {
      throw new IntegrationTokenMissingPermissions();
    }

    const scopes = new Set(headersString.split(",").map((s) => s.trim()));

    // GitHub-specific: check scope hierarchy
    for (const required of requiredScopes) {
      if (required === "public_repo" && scopes.has("repo")) {
        continue; // 'repo' supersedes 'public_repo'
      }
      if (!scopes.has(required)) {
        throw new IntegrationTokenMissingPermissions();
      }
    }
  }

  protected async fetchTokenExpiry(
    token: string,
    _options?: Record<string, unknown>,
  ): Promise<[boolean, Date | undefined]> {
    const response = await axios.head(this.GITHUB_API_URL, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const tokenExpiry = response.headers[
      "github-authentication-token-expiration"
    ] as string | undefined;

    const date = parseTokenExpiry(tokenExpiry ?? undefined);
    if (date) {
      validateNotExpired(date);
      return [true, date];
    }

    return [false, undefined];
  }

  /**
   * Validates that a given github oauth token has the necessary scopes/permissions to perform the necessary actions withing the API
   * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param token The oauth access token
   * @param additionalScopes We check the basic scopes needed for common actions. Any additional scopes can be defined here.
   * @returns
   */
  async validateOauthTokenPermissions(
    token: string,
    { additionalScopes = [] }: { additionalScopes?: string[] },
  ): Promise<void> {
    return this.validatePermissions(token, { additionalScopes });
  }

  /**
   * Validates that a given github classic token has the necessary scopes/permissions to perform the necessary actions withing the API
   * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param token The classic access token
   * @param additionalScopes We check the basic scopes needed for common actions. Any additional scopes can be defined here.
   * @returns
   */
  async validateClassicTokenPermissions(
    token: string,
    { additionalScopes = [] }: { additionalScopes?: string[] },
  ): Promise<void> {
    return this.validatePermissions(token, { additionalScopes });
  }

  /**
   * Retrieves the expiry date of a personal access token from the provider
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param token The personal access token
   * @returns (1) a boolean indicating whether it has an expiry data at all (2) the expiry date (if any)
   */
  async getClassicTokenExpiryRemote(
    token: string,
  ): Promise<[boolean, Date | undefined]> {
    return this.getTokenExpiry(token);
  }
}
