import {
  IntegrationInvalidToken,
  IntegrationTokenExpired,
  IntegrationTokenMissingPermissions,
  IntegrationTokenRetrievalFailed,
} from "src/types/error.types";
import { BaseVCSTokenService } from "./baseVCSTokenService";

// Mock implementation for testing
class MockVCSTokenService extends BaseVCSTokenService {
  public mockValidateTokenScopes = jest.fn();
  public mockFetchTokenExpiry = jest.fn();
  public mockDefaultScopes = ["read", "write"];

  protected async validateTokenScopes(
    token: string,
    requiredScopes: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    return this.mockValidateTokenScopes(token, requiredScopes, options);
  }

  protected async fetchTokenExpiry(
    token: string,
    options?: Record<string, unknown>,
  ): Promise<[boolean, Date | undefined]> {
    return this.mockFetchTokenExpiry(token, options);
  }

  protected getDefaultScopes(): string[] {
    return this.mockDefaultScopes;
  }
}

describe("BaseVCSTokenService", () => {
  let service: MockVCSTokenService;

  beforeEach(() => {
    service = new MockVCSTokenService();
    jest.clearAllMocks();
  });

  describe("validatePermissions", () => {
    it("should call validateTokenScopes with default scopes", async () => {
      service.mockValidateTokenScopes.mockResolvedValue(undefined);

      await service.validatePermissions("test-token");

      expect(service.mockValidateTokenScopes).toHaveBeenCalledWith(
        "test-token",
        ["read", "write"],
        {},
      );
    });

    it("should include additional scopes", async () => {
      service.mockValidateTokenScopes.mockResolvedValue(undefined);

      await service.validatePermissions("test-token", {
        additionalScopes: ["admin"],
      });

      expect(service.mockValidateTokenScopes).toHaveBeenCalledWith(
        "test-token",
        ["read", "write", "admin"],
        {},
      );
    });

    it("should pass through other options", async () => {
      service.mockValidateTokenScopes.mockResolvedValue(undefined);

      await service.validatePermissions("test-token", {
        additionalScopes: ["admin"],
        customOption: "value",
      });

      expect(service.mockValidateTokenScopes).toHaveBeenCalledWith(
        "test-token",
        ["read", "write", "admin"],
        { customOption: "value" },
      );
    });

    it("should handle IntegrationTokenMissingPermissions error", async () => {
      service.mockValidateTokenScopes.mockRejectedValue(
        new IntegrationTokenMissingPermissions(),
      );

      await expect(service.validatePermissions("test-token")).rejects.toThrow(
        IntegrationTokenMissingPermissions,
      );
    });

    it("should handle IntegrationInvalidToken error", async () => {
      service.mockValidateTokenScopes.mockRejectedValue(
        new IntegrationInvalidToken(),
      );

      await expect(service.validatePermissions("test-token")).rejects.toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should convert HTTP 401 status to IntegrationInvalidToken", async () => {
      service.mockValidateTokenScopes.mockRejectedValue({ status: 401 });

      await expect(service.validatePermissions("test-token")).rejects.toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should convert statusCode 401 to IntegrationInvalidToken", async () => {
      service.mockValidateTokenScopes.mockRejectedValue({ statusCode: 401 });

      await expect(service.validatePermissions("test-token")).rejects.toThrow(
        IntegrationInvalidToken,
      );
    });

    it('should convert "bad credentials" message to IntegrationInvalidToken', async () => {
      service.mockValidateTokenScopes.mockRejectedValue({
        message: "Bad credentials",
      });

      await expect(service.validatePermissions("test-token")).rejects.toThrow(
        IntegrationInvalidToken,
      );
    });

    it('should convert "invalid or revoked token" message to IntegrationInvalidToken', async () => {
      service.mockValidateTokenScopes.mockRejectedValue({
        message: "Invalid or revoked token",
      });

      await expect(service.validatePermissions("test-token")).rejects.toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should convert generic errors to IntegrationTokenRetrievalFailed", async () => {
      service.mockValidateTokenScopes.mockRejectedValue(
        new Error("Network error"),
      );

      await expect(service.validatePermissions("test-token")).rejects.toThrow(
        IntegrationTokenRetrievalFailed,
      );
    });
  });

  describe("getTokenExpiry", () => {
    it("should call fetchTokenExpiry with correct parameters", async () => {
      const futureDate = new Date(Date.now() + 100000);
      service.mockFetchTokenExpiry.mockResolvedValue([true, futureDate]);

      const result = await service.getTokenExpiry("test-token");

      expect(service.mockFetchTokenExpiry).toHaveBeenCalledWith(
        "test-token",
        undefined,
      );
      expect(result).toEqual([true, futureDate]);
    });

    it("should pass through options", async () => {
      service.mockFetchTokenExpiry.mockResolvedValue([false, undefined]);

      const options = { customOption: "value" };
      await service.getTokenExpiry("test-token", options);

      expect(service.mockFetchTokenExpiry).toHaveBeenCalledWith(
        "test-token",
        options,
      );
    });

    it("should handle IntegrationInvalidToken error", async () => {
      service.mockFetchTokenExpiry.mockRejectedValue(
        new IntegrationInvalidToken(),
      );

      await expect(service.getTokenExpiry("test-token")).rejects.toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should handle IntegrationTokenExpired error", async () => {
      service.mockFetchTokenExpiry.mockRejectedValue(
        new IntegrationTokenExpired(),
      );

      await expect(service.getTokenExpiry("test-token")).rejects.toThrow(
        IntegrationTokenExpired,
      );
    });

    it("should convert HTTP 401 to IntegrationInvalidToken", async () => {
      service.mockFetchTokenExpiry.mockRejectedValue({ status: 401 });

      await expect(service.getTokenExpiry("test-token")).rejects.toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should convert generic errors to IntegrationTokenRetrievalFailed", async () => {
      service.mockFetchTokenExpiry.mockRejectedValue(new Error("Fetch failed"));

      await expect(service.getTokenExpiry("test-token")).rejects.toThrow(
        IntegrationTokenRetrievalFailed,
      );
    });
  });

  describe("handleTokenError", () => {
    it("should re-throw IntegrationTokenMissingPermissions", () => {
      const error = new IntegrationTokenMissingPermissions();

      expect(() => service["handleTokenError"](error)).toThrow(
        IntegrationTokenMissingPermissions,
      );
    });

    it("should re-throw IntegrationTokenExpired", () => {
      const error = new IntegrationTokenExpired();

      expect(() => service["handleTokenError"](error)).toThrow(
        IntegrationTokenExpired,
      );
    });

    it("should re-throw IntegrationInvalidToken", () => {
      const error = new IntegrationInvalidToken();

      expect(() => service["handleTokenError"](error)).toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should convert status 401 to IntegrationInvalidToken", () => {
      const error = { status: 401 };

      expect(() => service["handleTokenError"](error)).toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should convert statusCode 401 to IntegrationInvalidToken", () => {
      const error = { statusCode: 401 };

      expect(() => service["handleTokenError"](error)).toThrow(
        IntegrationInvalidToken,
      );
    });

    it('should be case-insensitive for "bad credentials"', () => {
      const error = { message: "BAD CREDENTIALS" };

      expect(() => service["handleTokenError"](error)).toThrow(
        IntegrationInvalidToken,
      );
    });

    it('should handle "invalid or revoked token" in various cases', () => {
      const error = { message: "Invalid Or Revoked Token" };

      expect(() => service["handleTokenError"](error)).toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should throw IntegrationTokenRetrievalFailed for unknown errors", () => {
      const error = new Error("Unknown error");

      expect(() => service["handleTokenError"](error)).toThrow(
        IntegrationTokenRetrievalFailed,
      );
    });

    it("should handle null/undefined errors", () => {
      expect(() => service["handleTokenError"](null)).toThrow(
        IntegrationTokenRetrievalFailed,
      );
      expect(() => service["handleTokenError"](undefined)).toThrow(
        IntegrationTokenRetrievalFailed,
      );
    });
  });

  describe("getDefaultScopes", () => {
    it("should return default scopes", () => {
      expect(service["getDefaultScopes"]()).toEqual(["read", "write"]);
    });

    it("should be customizable via mock", () => {
      service.mockDefaultScopes = ["custom_scope"];

      expect(service["getDefaultScopes"]()).toEqual(["custom_scope"]);
    });
  });
});
