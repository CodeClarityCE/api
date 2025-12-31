// Mock fs module before importing the strategy
jest.mock("fs", () => ({
  default: {
    readFileSync: jest.fn(),
  },
  readFileSync: jest.fn(),
}));

import { Test, type TestingModule } from "@nestjs/testing";
import * as fs from "fs";

import { type JwtPayload, ROLE } from "../auth.types";

import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;
  const mockPrivateKey = `-----BEGIN EC PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgMockBaYK8lQRFl6j
-----END EC PRIVATE KEY-----`;

  beforeEach(async () => {
    // Mock fs.readFileSync to return a mock private key
    (fs.readFileSync as jest.Mock).mockReturnValue(mockPrivateKey);

    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtStrategy],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should read private key from ./jwt/private.pem", () => {
      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith("./jwt/private.pem", "utf8");
    });

    it("should throw error if private key file is not found", () => {
      // Arrange
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });

      // Act & Assert
      expect(() => new JwtStrategy()).toThrow(
        "ENOENT: no such file or directory",
      );
    });
  });

  describe("validate", () => {
    it("should return user object with userId and roles from payload", async () => {
      // Arrange
      const payload: JwtPayload = {
        userId: "test-user-id",
        roles: [ROLE.USER, ROLE.ADMIN],
      };

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: "test-user-id",
        roles: [ROLE.USER, ROLE.ADMIN],
      });
    });

    it("should handle payload with missing roles", async () => {
      // Arrange - testing edge case with missing required property
      const payload = {
        userId: "test-user-id",
      } as unknown as JwtPayload;

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: "test-user-id",
        roles: undefined,
      });
    });

    it("should handle payload with empty roles array", async () => {
      // Arrange
      const payload: JwtPayload = {
        userId: "test-user-id",
        roles: [],
      };

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: "test-user-id",
        roles: [],
      });
    });

    it("should handle payload with additional properties", async () => {
      // Arrange - testing that extra properties are ignored
      const payload = {
        userId: "test-user-id",
        roles: [ROLE.USER],
        email: "test@example.com",
        name: "Test User",
      } as unknown as JwtPayload;

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: "test-user-id",
        roles: [ROLE.USER],
      });
    });

    it("should handle numeric userId", async () => {
      // Arrange - testing edge case with wrong type
      const payload = {
        userId: 12345,
        roles: [ROLE.USER],
      } as unknown as JwtPayload;

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: 12345,
        roles: [ROLE.USER],
      });
    });

    it("should handle null payload gracefully", async () => {
      // Arrange
      const payload = null as any;

      // Act & Assert
      await expect(() => strategy.validate(payload)).rejects.toThrow();
    });

    it("should handle undefined payload gracefully", async () => {
      // Arrange
      const payload = undefined as any;

      // Act & Assert
      await expect(() => strategy.validate(payload)).rejects.toThrow();
    });

    it("should handle empty object payload", async () => {
      // Arrange - testing edge case with empty object
      const payload = {} as unknown as JwtPayload;

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: undefined,
        roles: undefined,
      });
    });
  });

  describe("security and edge cases", () => {
    it("should not expose sensitive data from payload", async () => {
      // Arrange - testing that extra properties are stripped
      const payload = {
        userId: "test-user-id",
        roles: [ROLE.USER],
        password: "secret-password",
        apiKey: "secret-api-key",
      } as unknown as JwtPayload;

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: "test-user-id",
        roles: [ROLE.USER],
      });
      expect(result).not.toHaveProperty("password");
      expect(result).not.toHaveProperty("apiKey");
    });

    it("should handle malformed roles data", async () => {
      // Arrange - testing edge case with wrong type for roles
      const payload = {
        userId: "test-user-id",
        roles: "USER" as unknown as ROLE[], // Should be array but is string
      } as unknown as JwtPayload;

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: "test-user-id",
        roles: "USER",
      });
    });

    it("should handle very large payload", async () => {
      // Arrange - testing with large array (using strings for test, cast appropriately)
      const largeArray = new Array(1000).fill(ROLE.USER);
      const payload = {
        userId: "test-user-id",
        roles: largeArray,
      } as unknown as JwtPayload;

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: "test-user-id",
        roles: largeArray,
      });
    });

    it("should be idempotent", async () => {
      // Arrange
      const payload: JwtPayload = {
        userId: "test-user-id",
        roles: [ROLE.USER],
      };

      // Act
      const result1 = await strategy.validate(payload);
      const result2 = await strategy.validate(payload);

      // Assert
      expect(result1).toEqual(result2);
    });
  });
});
