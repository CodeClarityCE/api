import { IntegrationTokenExpired } from "src/types/error.types";

import {
  hasRequiredScopes,
  isTokenExpired,
  parseTokenExpiry,
  validateNotExpired,
} from "./tokenValidation.utils";

describe("tokenValidation.utils", () => {
  describe("parseTokenExpiry", () => {
    it("should parse string date format", () => {
      const dateString = "2025-12-31T23:59:59Z";
      const result = parseTokenExpiry(dateString);

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe("2025-12-31T23:59:59.000Z");
    });

    it("should parse number timestamp format", () => {
      const timestamp = Date.now() + 10000; // 10 seconds in future
      const result = parseTokenExpiry(timestamp);

      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(timestamp);
    });

    it("should return undefined for undefined input", () => {
      const result = parseTokenExpiry(undefined);
      expect(result).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      const result = parseTokenExpiry("");
      expect(result).toBeUndefined();
    });

    it("should handle invalid date string gracefully", () => {
      const result = parseTokenExpiry("invalid-date");
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result?.getTime() ?? 0)).toBe(true);
    });
  });

  describe("isTokenExpired", () => {
    it("should return true for past date", () => {
      const pastDate = new Date("2020-01-01T00:00:00Z");
      const result = isTokenExpired(pastDate);

      expect(result).toBe(true);
    });

    it("should return false for future date", () => {
      const futureDate = new Date(Date.now() + 100000); // 100 seconds in future
      const result = isTokenExpired(futureDate);

      expect(result).toBe(false);
    });

    it("should return true for current time", () => {
      const now = new Date();
      const result = isTokenExpired(now);

      // Should be expired since now >= now
      expect(result).toBe(true);
    });

    it("should handle edge case: exactly 1ms in the past", () => {
      const almostNow = new Date(Date.now() - 1);
      const result = isTokenExpired(almostNow);

      expect(result).toBe(true);
    });

    it("should handle edge case: exactly 1ms in the future", () => {
      const almostNow = new Date(Date.now() + 1);
      const result = isTokenExpired(almostNow);

      expect(result).toBe(false);
    });
  });

  describe("validateNotExpired", () => {
    it("should not throw for undefined expiry date", () => {
      expect(() => validateNotExpired(undefined)).not.toThrow();
    });

    it("should not throw for future date", () => {
      const futureDate = new Date(Date.now() + 100000);
      expect(() => validateNotExpired(futureDate)).not.toThrow();
    });

    it("should throw IntegrationTokenExpired for past date", () => {
      const pastDate = new Date("2020-01-01T00:00:00Z");

      expect(() => validateNotExpired(pastDate)).toThrow(
        IntegrationTokenExpired,
      );
    });

    it("should throw IntegrationTokenExpired for current time", () => {
      const now = new Date();

      expect(() => validateNotExpired(now)).toThrow(IntegrationTokenExpired);
    });
  });

  describe("hasRequiredScopes", () => {
    it("should return true when all required scopes are present", () => {
      const tokenScopes = ["read", "write", "admin"];
      const requiredScopes = ["read", "write"];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(true);
    });

    it("should return false when some required scopes are missing", () => {
      const tokenScopes = ["read"];
      const requiredScopes = ["read", "write"];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(false);
    });

    it("should return false when all required scopes are missing", () => {
      const tokenScopes = ["read"];
      const requiredScopes = ["write", "admin"];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(false);
    });

    it("should return true when required scopes is empty", () => {
      const tokenScopes = ["read", "write"];
      const requiredScopes: string[] = [];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(true);
    });

    it("should return true when both arrays are empty", () => {
      const tokenScopes: string[] = [];
      const requiredScopes: string[] = [];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(true);
    });

    it("should return false when token has no scopes but required scopes exist", () => {
      const tokenScopes: string[] = [];
      const requiredScopes = ["read"];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(false);
    });

    it("should handle duplicate scopes in token scopes", () => {
      const tokenScopes = ["read", "read", "write"];
      const requiredScopes = ["read", "write"];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(true);
    });

    it("should handle duplicate scopes in required scopes", () => {
      const tokenScopes = ["read", "write"];
      const requiredScopes = ["read", "read", "write"];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(true);
    });

    it("should be case-sensitive", () => {
      const tokenScopes = ["Read", "Write"];
      const requiredScopes = ["read", "write"];

      const result = hasRequiredScopes(tokenScopes, requiredScopes);
      expect(result).toBe(false);
    });
  });
});
