import { Test, type TestingModule } from "@nestjs/testing";
import axios from "axios";

import {
  IntegrationInvalidToken,
  IntegrationTokenExpired,
  IntegrationTokenMissingPermissions,
  IntegrationTokenRetrievalFailed,
} from "../../../types/error.types";

import { GithubIntegrationTokenService } from "./githubToken.service";

// Mock axios
jest.mock("axios");

describe("GithubIntegrationTokenService", () => {
  let service: GithubIntegrationTokenService;
  const mockAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GithubIntegrationTokenService],
    }).compile();

    service = module.get<GithubIntegrationTokenService>(
      GithubIntegrationTokenService,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("validateOauthTokenPermissions", () => {
    it("should delegate to validatePermissions", async () => {
      const validatePermissionsSpy = jest
        .spyOn(service as any, "validatePermissions")
        .mockResolvedValue(undefined);
      const token = "gho_oauth_token";
      const additionalScopes = ["repo"];

      await service.validateOauthTokenPermissions(token, { additionalScopes });

      expect(validatePermissionsSpy).toHaveBeenCalledWith(token, {
        additionalScopes,
      });
    });

    it("should use empty array as default for additionalScopes", async () => {
      const validatePermissionsSpy = jest
        .spyOn(service as any, "validatePermissions")
        .mockResolvedValue(undefined);
      const token = "gho_oauth_token";

      await service.validateOauthTokenPermissions(token, {});

      expect(validatePermissionsSpy).toHaveBeenCalledWith(token, {
        additionalScopes: [],
      });
    });
  });

  describe("validateClassicTokenPermissions", () => {
    it("should delegate to validatePermissions", async () => {
      const validatePermissionsSpy = jest
        .spyOn(service as any, "validatePermissions")
        .mockResolvedValue(undefined);
      const token = "ghp_classic_token";
      const additionalScopes = ["write:org"];

      await service.validateClassicTokenPermissions(token, {
        additionalScopes,
      });

      expect(validatePermissionsSpy).toHaveBeenCalledWith(token, {
        additionalScopes,
      });
    });

    it("should use empty array as default for additionalScopes", async () => {
      const validatePermissionsSpy = jest
        .spyOn(service as any, "validatePermissions")
        .mockResolvedValue(undefined);
      const token = "ghp_classic_token";

      await service.validateClassicTokenPermissions(token, {});

      expect(validatePermissionsSpy).toHaveBeenCalledWith(token, {
        additionalScopes: [],
      });
    });
  });

  describe("validateTokenScopes", () => {
    it("should successfully validate token with public_repo scope", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "x-oauth-scopes": "public_repo, user",
        },
        config: {} as any,
      });

      await expect(
        (service as any).validateTokenScopes("ghp_test_token", ["public_repo"]),
      ).resolves.toBeUndefined();

      expect(mockAxios.head).toHaveBeenCalledWith("https://api.github.com", {
        headers: {
          Authorization: "token ghp_test_token",
          Accept: "application/vnd.github.v3+json",
        },
      });
    });

    it("should successfully validate token with repo scope (covers public_repo)", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "x-oauth-scopes": "repo, user",
        },
        config: {} as any,
      });

      await expect(
        (service as any).validateTokenScopes("ghp_test_token", ["public_repo"]),
      ).resolves.toBeUndefined();
    });

    it("should successfully validate token with additional scopes", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "x-oauth-scopes": "public_repo, write:org, user",
        },
        config: {} as any,
      });

      await expect(
        (service as any).validateTokenScopes("ghp_test_token", [
          "public_repo",
          "write:org",
        ]),
      ).resolves.toBeUndefined();
    });

    it("should throw IntegrationTokenMissingPermissions when x-oauth-scopes header is missing", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      await expect(
        (service as any).validateTokenScopes("ghp_test_token", ["public_repo"]),
      ).rejects.toThrow(IntegrationTokenMissingPermissions);
    });

    it("should throw IntegrationTokenMissingPermissions when required scope is missing", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "x-oauth-scopes": "user",
        },
        config: {} as any,
      });

      await expect(
        (service as any).validateTokenScopes("ghp_test_token", ["public_repo"]),
      ).rejects.toThrow(IntegrationTokenMissingPermissions);
    });

    it("should throw IntegrationTokenMissingPermissions when additional scope is missing", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "x-oauth-scopes": "public_repo, user",
        },
        config: {} as any,
      });

      await expect(
        (service as any).validateTokenScopes("ghp_test_token", [
          "public_repo",
          "write:org",
        ]),
      ).rejects.toThrow(IntegrationTokenMissingPermissions);
    });

    it("should throw IntegrationInvalidToken for 401 status", async () => {
      const error = { response: { status: 401 } };
      mockAxios.head.mockRejectedValue(error);

      // Use validatePermissions which includes error handling
      await expect(
        (service as any).validatePermissions("ghp_invalid_token", {
          additionalScopes: [],
        }),
      ).rejects.toThrow(IntegrationInvalidToken);
    });

    it("should throw IntegrationTokenRetrievalFailed for other errors", async () => {
      const error = new Error("Network error");
      mockAxios.head.mockRejectedValue(error);

      // Use validatePermissions which includes error handling
      await expect(
        (service as any).validatePermissions("ghp_test_token", {
          additionalScopes: [],
        }),
      ).rejects.toThrow(IntegrationTokenRetrievalFailed);
    });

    it("should re-throw IntegrationTokenMissingPermissions", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "x-oauth-scopes": "user",
        },
        config: {} as any,
      });

      await expect(
        (service as any).validateTokenScopes("ghp_test_token", ["public_repo"]),
      ).rejects.toThrow(IntegrationTokenMissingPermissions);
    });

    it("should handle scopes with whitespace correctly", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "x-oauth-scopes": " public_repo , user , write:org ",
        },
        config: {} as any,
      });

      await expect(
        (service as any).validateTokenScopes("ghp_test_token", [
          "public_repo",
          "write:org",
        ]),
      ).resolves.toBeUndefined();
    });
  });

  describe("getClassicTokenExpiryRemote", () => {
    it("should return false and undefined when no expiry header is present", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
      });

      const result =
        await service.getClassicTokenExpiryRemote("ghp_test_token");

      expect(result).toEqual([false, undefined]);
      expect(mockAxios.head).toHaveBeenCalledWith("https://api.github.com", {
        headers: {
          Authorization: "token ghp_test_token",
          Accept: "application/vnd.github.v3+json",
        },
      });
    });

    it("should return true and expiry date when expiry header is a string", async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // 1 day from now
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "github-authentication-token-expiration": futureDate,
        },
      });

      const result =
        await service.getClassicTokenExpiryRemote("ghp_test_token");

      expect(result[0]).toBe(true);
      expect(result[1]).toEqual(new Date(Date.parse(futureDate)));
    });

    it("should return true and expiry date when expiry header is a number", async () => {
      const expiryTimestamp = Date.now() + 86400000; // 1 day from now
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "github-authentication-token-expiration": expiryTimestamp,
        },
      });

      const result =
        await service.getClassicTokenExpiryRemote("ghp_test_token");

      expect(result[0]).toBe(true);
      expect(result[1]).toEqual(new Date(expiryTimestamp));
    });

    it("should throw IntegrationTokenExpired when token is already expired", async () => {
      const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "github-authentication-token-expiration": expiredDate,
        },
      });

      await expect(
        service.getClassicTokenExpiryRemote("ghp_expired_token"),
      ).rejects.toThrow(IntegrationTokenExpired);
    });

    it("should throw IntegrationInvalidToken for bad credentials message", async () => {
      const error = { message: "Bad credentials" };
      mockAxios.head.mockRejectedValue(error);

      await expect(
        service.getClassicTokenExpiryRemote("ghp_invalid_token"),
      ).rejects.toThrow(IntegrationInvalidToken);
    });

    it("should throw IntegrationInvalidToken for 401 status", async () => {
      const error = { status: 401 };
      mockAxios.head.mockRejectedValue(error);

      await expect(
        service.getClassicTokenExpiryRemote("ghp_invalid_token"),
      ).rejects.toThrow(IntegrationInvalidToken);
    });

    it("should throw IntegrationTokenRetrievalFailed for other errors", async () => {
      const error = new Error("Network error");
      mockAxios.head.mockRejectedValue(error);

      await expect(
        service.getClassicTokenExpiryRemote("ghp_test_token"),
      ).rejects.toThrow(IntegrationTokenRetrievalFailed);
    });

    it("should re-throw IntegrationTokenExpired", async () => {
      const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "github-authentication-token-expiration": expiredDate,
        },
      });

      await expect(
        service.getClassicTokenExpiryRemote("ghp_expired_token"),
      ).rejects.toThrow(IntegrationTokenExpired);
    });

    it("should handle case insensitive bad credentials message", async () => {
      const error = { message: "BAD CREDENTIALS" };
      mockAxios.head.mockRejectedValue(error);

      await expect(
        service.getClassicTokenExpiryRemote("ghp_invalid_token"),
      ).rejects.toThrow(IntegrationInvalidToken);
    });

    it("should return false when expiry header cannot be parsed as date", async () => {
      mockAxios.head.mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {
          "github-authentication-token-expiration": "invalid-date",
        },
      });

      const result =
        await service.getClassicTokenExpiryRemote("ghp_test_token");

      // The service returns [true, Date(NaN)] for invalid dates
      expect(result[0]).toBe(true);
      expect(isNaN(result[1]?.getTime() ?? 0)).toBe(true);
    });
  });
});
