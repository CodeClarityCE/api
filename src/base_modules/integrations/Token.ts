import { GithubTokenType } from "src/base_modules/integrations/github/githubIntegration.types";
import { GitlabTokenType } from "src/base_modules/integrations/gitlab/gitlabIntegration.types";
import {
  IntegrationTokenExpired,
  IntegrationTokenRefreshFailed,
  IntegrationWrongTokenType,
} from "src/types/error.types";

import type { GithubIntegrationTokenService } from "./github/githubToken.service";
import type { GitlabIntegrationTokenService } from "./gitlab/gitlabToken.service";

export class UnkownTokenType extends Error {}

export abstract class IntegrationToken {
  protected token: string;
  protected refreshToken?: string;
  protected expiresOn?: Date;
  protected integrationId: string;

  constructor(
    integrationId: string,
    token: string,
    refreshToken?: string,
    expiresOn?: Date,
  ) {
    this.token = token;
    if (refreshToken !== undefined) {
      this.refreshToken = refreshToken;
    }
    if (expiresOn !== undefined) {
      this.expiresOn = expiresOn;
    }
    this.integrationId = integrationId;
  }

  /**
   * Validate the permissions of the token
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   */
  abstract validatePermissions(): Promise<void>;

  /**
   * Refresh an access token if necessary (i.e. the token has expired)
   * @throws {IntegrationTokenRefreshFailed} In the case the token could not be refreshed
   */
  abstract refreshIfNecessary(): Promise<void>;

  abstract validate(): Promise<void>;

  /**
   * Checks if the token is expired
   */
  async isExpired(): Promise<boolean> {
    if (this.expiresOn) {
      return new Date().getTime() - this.expiresOn.getTime() > 0;
    } else {
      return false;
    }
  }

  /**
   * Return the token
   * @returns the token
   */
  getToken(): string {
    return this.token;
  }
}

export class GitlabIntegrationToken extends IntegrationToken {
  private gitlabTokenType: GitlabTokenType;
  private gitlabInstanceUrl: string;
  private gitlabIntegrationTokenService: GitlabIntegrationTokenService;

  /**
   * @param integrationId The integration id
   * @param token The token
   * @param refreshToken The refresh token
   * @param expiresOn The date on which the token expires
   */
  constructor(
    gitlabIntegrationTokenService: GitlabIntegrationTokenService,
    integrationId: string,
    token: string,
    gitlabTokenType: GitlabTokenType,
    gitlabInstanceUrl: string,
    refreshToken?: string,
    expiresOn?: Date,
  ) {
    super(integrationId, token, refreshToken, expiresOn);
    this.gitlabIntegrationTokenService = gitlabIntegrationTokenService;
    this.gitlabTokenType = gitlabTokenType;
    this.gitlabInstanceUrl = gitlabInstanceUrl;
  }

  getInstanceUrl(): string {
    return this.gitlabInstanceUrl;
  }

  /**
   * Validate the token
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @throws {IntegrationWrongTokenType} In case the token type is not supported
   */
  async validate(): Promise<void> {
    await this.refreshIfNecessary();
    await this.validatePermissions();
    await this.validateExpiry();
  }

  /**
   * Validate the permissions of the token
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @throws {IntegrationWrongTokenType} In case the token type is not supported
   */
  async validatePermissions(): Promise<void> {
    if (this.gitlabTokenType === GitlabTokenType.OAUTH_TOKEN) {
      await this.gitlabIntegrationTokenService.validateOAuthAccessTokenPermissions(
        this.token,
        {},
      );
    } else if (this.gitlabTokenType === GitlabTokenType.PERSONAL_ACCESS_TOKEN) {
      await this.gitlabIntegrationTokenService.validatePersonalAccessTokenPermissions(
        this.token,
        this.gitlabInstanceUrl,
        {},
      );
    } else {
      throw new IntegrationWrongTokenType();
    }
  }

  /**
   * Refresh an access token if necessary (i.e. the token has expired)
   * @throws {IntegrationTokenRefreshFailed} In the case the token could not be refreshed
   */
  async refreshIfNecessary(): Promise<void> {
    // Gitlab Oauth tokens expire and Gitlab personal access tokens cannot be refreshed
    if (this.gitlabTokenType !== GitlabTokenType.OAUTH_TOKEN) return;

    const expired = await this.isExpired();
    if (expired) {
      if (this.refreshToken) {
        const newIntegration =
          await this.gitlabIntegrationTokenService.refreshOAuthToken(
            this.refreshToken,
            this.integrationId,
          );

        this.token = newIntegration.access_token;
        if (newIntegration.refresh_token !== undefined) {
          this.refreshToken = newIntegration.refresh_token;
        }
        if (newIntegration.expiry_date !== undefined) {
          this.expiresOn = newIntegration.expiry_date;
        }
      } else {
        throw new IntegrationTokenRefreshFailed();
      }
    }
  }

  /**
   * Validates whether the token is still "alive"
   * @throws {IntegrationTokenExpired} In case the token is already expired
   */
  async validateExpiry(): Promise<void> {
    const expired = await this.isExpired();
    if (expired) {
      throw new IntegrationTokenExpired();
    }
  }

  /**
   * Returns the type of gitlab token used for the integration (oauth, personal access token)
   * @returns
   */
  getTokenType(): GitlabTokenType {
    return this.gitlabTokenType;
  }
}

export class GithubIntegrationToken extends IntegrationToken {
  private githubTokenType: GithubTokenType;
  private githubIntegrationTokenService: GithubIntegrationTokenService;

  /**
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @throws {IntegrationWrongTokenType} In case the token type is not supported
   * @param integrationId The integration id
   * @param token The token
   * @param refreshToken The refresh token
   * @param expiresOn The date on which the token expires
   */
  constructor(
    githubIntegrationTokenService: GithubIntegrationTokenService,
    integrationId: string,
    token: string,
    githubTokenType: GithubTokenType,
    refreshToken?: string,
    expiresOn?: Date,
  ) {
    super(integrationId, token, refreshToken, expiresOn);
    this.githubIntegrationTokenService = githubIntegrationTokenService;
    this.githubTokenType = githubTokenType;
  }

  /**
   * Validate the token
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @throws {IntegrationWrongTokenType} In case the token type is not supported
   */
  async validate(): Promise<void> {
    await this.refreshIfNecessary();
    await this.validatePermissions();
    await this.validateExpiry();
  }

  /**
   * Validate the permissions of the token
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @throws {IntegrationWrongTokenType} In case the token type is not supported
   */
  async validatePermissions(): Promise<void> {
    if (this.githubTokenType === GithubTokenType.OAUTH_TOKEN) {
      await this.githubIntegrationTokenService.validateOauthTokenPermissions(
        this.token,
        {},
      );
    } else if (this.githubTokenType === GithubTokenType.CLASSIC_TOKEN) {
      await this.githubIntegrationTokenService.validateClassicTokenPermissions(
        this.token,
        {},
      );
    } else {
      throw new IntegrationWrongTokenType();
    }
  }

  /**
   * Validates whether the token is still "alive"
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   */
  async validateExpiry(): Promise<void> {
    const expired = await this.isExpired();
    if (expired) {
      throw new IntegrationTokenExpired();
    }
  }

  /**
   * Refresh an access token if necessary (i.e. the token has expired)
   * @throws {IntegrationTokenRefreshFailed} In the case the token could not be refreshed
   */
  async refreshIfNecessary(): Promise<void> {
    // Github Oauth tokens cannot expire and Github classic tokens cannot be refreshed
  }

  /**
   * Returns the type of gitlab token used for the integration (oauth, classic token)
   * @returns
   */
  getTokenType(): GithubTokenType {
    return this.githubTokenType;
  }
}
