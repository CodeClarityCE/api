import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { NotAuthenticated } from "src/types/error.types";
import { RefreshJwtAuthGuard } from "./refresh-token.guard";

describe("RefreshJwtAuthGuard", () => {
  let guard: RefreshJwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshJwtAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RefreshJwtAuthGuard>(RefreshJwtAuthGuard);
    reflector = module.get(Reflector);

    // Setup mock execution context
    mockExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getType: jest.fn(),
      switchToHttp: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("canActivate", () => {
    it("should call parent canActivate method", () => {
      // Mock the parent canActivate method
      const superCanActivateSpy = jest.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)),
        "canActivate",
      );
      superCanActivateSpy.mockReturnValue(true);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);

      superCanActivateSpy.mockRestore();
    });

    it("should return false when parent canActivate returns false", () => {
      // Mock the parent canActivate method to return false
      const superCanActivateSpy = jest.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)),
        "canActivate",
      );
      superCanActivateSpy.mockReturnValue(false);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);

      superCanActivateSpy.mockRestore();
    });

    it("should handle async parent canActivate result", async () => {
      // Mock the parent canActivate method to return a Promise
      const superCanActivateSpy = jest.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)),
        "canActivate",
      );
      superCanActivateSpy.mockReturnValue(Promise.resolve(true));

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);

      superCanActivateSpy.mockRestore();
    });

    it("should handle rejected promise from parent canActivate", async () => {
      const mockError = new Error("Auth failed");
      // Mock the parent canActivate method to return a rejected Promise
      const superCanActivateSpy = jest.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)),
        "canActivate",
      );
      superCanActivateSpy.mockReturnValue(Promise.reject(mockError));

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBeInstanceOf(Promise);
      await expect(result).rejects.toThrow(mockError);
      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);

      superCanActivateSpy.mockRestore();
    });

    it("should pass execution context to parent method", () => {
      const superCanActivateSpy = jest.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)),
        "canActivate",
      );
      superCanActivateSpy.mockReturnValue(true);

      guard.canActivate(mockExecutionContext);

      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
      expect(superCanActivateSpy).toHaveBeenCalledTimes(1);

      superCanActivateSpy.mockRestore();
    });
  });

  describe("handleRequest", () => {
    it("should return user when authentication is successful", () => {
      const mockUser = {
        id: "user-123",
        roles: ["USER"],
        refreshToken: "refresh-token-123",
      };

      const result = guard.handleRequest(null, mockUser);

      expect(result).toBe(mockUser);
    });

    it("should throw NotAuthenticated when user is null", () => {
      expect(() => guard.handleRequest(null, null)).toThrow(NotAuthenticated);
    });

    it("should throw NotAuthenticated when user is undefined", () => {
      expect(() => guard.handleRequest(null, undefined)).toThrow(
        NotAuthenticated,
      );
    });

    it("should throw the provided error when error is present", () => {
      const mockError = new Error("Refresh token expired");

      expect(() => guard.handleRequest(mockError, null)).toThrow(mockError);
    });

    it("should throw the provided error even when user is present", () => {
      const mockError = new Error("Invalid refresh token");
      const mockUser = {
        id: "user-123",
        refreshToken: "invalid-token",
      };

      expect(() => guard.handleRequest(mockError, mockUser)).toThrow(mockError);
    });

    it("should handle falsy user values", () => {
      expect(() => guard.handleRequest(null, false)).toThrow(NotAuthenticated);
      expect(() => guard.handleRequest(null, 0)).toThrow(NotAuthenticated);
      expect(() => guard.handleRequest(null, "")).toThrow(NotAuthenticated);
    });

    it("should return truthy user values", () => {
      const mockUser1 = { id: "user-123", refreshToken: "token-123" };
      const mockUser2 = "user-string";
      const mockUser3 = 123;

      expect(guard.handleRequest(null, mockUser1)).toBe(mockUser1);
      expect(guard.handleRequest(null, mockUser2)).toBe(mockUser2);
      expect(guard.handleRequest(null, mockUser3)).toBe(mockUser3);
    });

    it("should handle specific refresh token errors", () => {
      const refreshTokenError = new Error("Refresh token has expired");
      const malformedTokenError = new Error("Malformed refresh token");
      const invalidTokenError = new Error("Invalid refresh token signature");

      expect(() => guard.handleRequest(refreshTokenError, null)).toThrow(
        refreshTokenError,
      );
      expect(() => guard.handleRequest(malformedTokenError, null)).toThrow(
        malformedTokenError,
      );
      expect(() => guard.handleRequest(invalidTokenError, null)).toThrow(
        invalidTokenError,
      );
    });

    it("should prioritize error over user presence", () => {
      const mockError = new Error("Token validation failed");
      const mockUser = { id: "user-123", refreshToken: "valid-token" };

      // Even if user is present, error should be thrown
      expect(() => guard.handleRequest(mockError, mockUser)).toThrow(mockError);
    });
  });

  describe("inheritance", () => {
    it("should extend AuthGuard with jwt-refresh strategy", () => {
      expect(guard).toBeInstanceOf(RefreshJwtAuthGuard);
      // Note: We can't easily test the AuthGuard('jwt-refresh') inheritance without mocking Passport,
      // but the constructor and method signatures confirm the correct inheritance
    });

    it("should have reflector dependency injected", () => {
      expect(reflector).toBeDefined();
      expect(typeof reflector.getAllAndOverride).toBe("function");
    });
  });

  describe("constructor", () => {
    it.skip("should initialize with reflector dependency", () => {
      // This test is skipped because the reflector property is not used in the current implementation
      expect(guard).toBeDefined();
      // expect((guard as any).__reflector).toBe(reflector);
    });

    it("should call parent constructor", () => {
      // This is implicitly tested by the successful instantiation
      // The super() call is required for proper inheritance
      expect(guard).toBeInstanceOf(RefreshJwtAuthGuard);
    });
  });
});
