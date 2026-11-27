// Mock fs module before importing the guard
jest.mock("fs", () => ({
  default: {
    readFileSync: jest.fn(),
  },
  readFileSync: jest.fn(),
}));

import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import * as fs from "fs";
import type { Jwt } from "jsonwebtoken";
import type { Socket } from "socket.io";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { OrganizationTokensService } from "src/base_modules/organizations/tokens/organization-tokens.service";
import { SKIP_AUTH_KEY } from "src/decorators/SkipAuthDecorator";
import {
  AccountNotActivated,
  CrossSiteRequestRefused,
  NotAuthenticated,
} from "src/types/error.types";

import { CombinedAuthGuard } from "./combined.guard";

// Wraps claims as a verified token with the given typ header.
function verified(payload: unknown, typ = "at+jwt"): Jwt {
  return {
    header: { alg: "ES512", typ },
    payload: payload as Jwt["payload"],
    signature: "",
  };
}

// The headers the app sends on a web sign-in.
function webSignIn(accessToken: string): Record<string, string> {
  return {
    cookie: `__Host-Http-cc_access=${accessToken}`,
    "x-codeclarity-csrf": "1",
  };
}

describe("CombinedAuthGuard", () => {
  let guard: CombinedAuthGuard;
  let jwtService: jest.Mocked<JwtService>;
  let reflector: jest.Mocked<Reflector>;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockRequest: { headers: Record<string, string>; user?: unknown };
  let mockSocket: Partial<Socket>;

  const mockPrivateKey = "mock-private-key";
  const mockJwtPayload = {
    userId: "user-123",
    roles: ["USER"],
    activated: true,
  };

  beforeEach(async () => {
    // Setup fs mock before module compilation
    (fs.readFileSync as jest.Mock).mockReturnValue(mockPrivateKey);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CombinedAuthGuard,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        { provide: OrganizationTokensService, useValue: {} },
      ],
    }).compile();

    guard = module.get<CombinedAuthGuard>(CombinedAuthGuard);
    jwtService = module.get(JwtService);
    reflector = module.get(Reflector);

    // Setup mock execution context
    mockRequest = {
      headers: {},
      user: undefined,
    };

    mockSocket = {
      handshake: {
        headers: {},
        time: new Date().toISOString(),
        address: "127.0.0.1",
        xdomain: false,
        secure: false,
        issued: Date.now(),
        url: "/",
        query: {},
        auth: {},
      },
      data: {},
    };

    mockExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getType: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
      }),
      switchToWs: jest.fn().mockReturnValue({
        getClient: () => mockSocket,
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should read public key from file system", () => {
      expect(fs.readFileSync).toHaveBeenCalled();
      expect(guard.publicKey).toBe(mockPrivateKey);
    });
  });

  describe("canActivate", () => {
    describe("public endpoints", () => {
      it("should allow access to non-auth endpoints", async () => {
        reflector.getAllAndOverride.mockReturnValue(true);

        const result = await guard.canActivate(mockExecutionContext);

        expect(result).toBe(true);
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
          SKIP_AUTH_KEY,
          [mockExecutionContext.getHandler(), mockExecutionContext.getClass()],
        );
      });
    });

    describe("HTTP context", () => {
      beforeEach(() => {
        mockExecutionContext.getType.mockReturnValue("http");
        reflector.getAllAndOverride.mockReturnValue(false);
      });

      it("should throw NotAuthenticated when no auth headers provided", async () => {
        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          NotAuthenticated,
        );
      });

      it("should authenticate with a valid access cookie", async () => {
        const token = "valid-jwt-token";
        mockRequest.headers = webSignIn(token);
        jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload));

        const result = await guard.canActivate(mockExecutionContext);

        expect(result).toBe(true);
        expect(jwtService.verifyAsync).toHaveBeenCalledWith(token, {
          secret: mockPrivateKey,
          algorithms: ["ES512"],
          audience: "codeclarity:access",
          complete: true,
        });
        expect(mockRequest.user).toBeInstanceOf(AuthenticatedUser);
        expect((mockRequest.user as AuthenticatedUser).userId).toBe("user-123");
      });

      it("should refuse an access cookie without the CSRF header", async () => {
        mockRequest.headers = { cookie: "__Host-Http-cc_access=valid" };
        jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload));

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          CrossSiteRequestRefused,
        );
      });

      it("should refuse an access cookie sent cross-site", async () => {
        mockRequest.headers = {
          ...webSignIn("valid"),
          "sec-fetch-site": "cross-site",
        };
        jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload));

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          CrossSiteRequestRefused,
        );
      });

      it("should refuse a user access token sent as a bearer", async () => {
        mockRequest.headers = { authorization: "Bearer valid-jwt-token" };
        jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload));

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          NotAuthenticated,
        );
        expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      });

      it("should judge a bearer alone, even next to a valid cookie", async () => {
        mockRequest.headers = {
          ...webSignIn("valid"),
          authorization: "Bearer not-an-organization-token",
        };
        jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload));

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          NotAuthenticated,
        );
      });

      it("should throw AccountNotActivated for unactivated users", async () => {
        const inactivePayload = { ...mockJwtPayload, activated: false };
        mockRequest.headers = webSignIn("valid-jwt-token");
        jwtService.verifyAsync.mockResolvedValue(verified(inactivePayload));

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          AccountNotActivated,
        );
      });

      it("should throw error for invalid JWT token", async () => {
        mockRequest.headers = webSignIn("invalid-jwt-token");
        jwtService.verifyAsync.mockRejectedValue(new Error("Invalid token"));

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          NotAuthenticated,
        );
      });

      it("should handle malformed authorization header", async () => {
        mockRequest.headers["authorization"] = "InvalidFormat";

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          NotAuthenticated,
        );
      });

      it("should reject an API key header without a bearer token", async () => {
        mockRequest.headers["x-api-key"] = "api-key-123";

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          NotAuthenticated,
        );
      });
    });

    describe("WebSocket context", () => {
      beforeEach(() => {
        mockExecutionContext.getType.mockReturnValue("ws");
        reflector.getAllAndOverride.mockReturnValue(false);
      });

      it("should authenticate WebSocket with a valid access cookie", async () => {
        mockSocket.handshake!.headers = webSignIn("valid-jwt-token");
        jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload));

        const result = await guard.canActivate(mockExecutionContext);

        expect(result).toBe(true);
        expect(mockSocket.data!.user).toBeInstanceOf(AuthenticatedUser);
        expect((mockSocket.data!.user as AuthenticatedUser).userId).toBe(
          "user-123",
        );
      });

      it("should throw NotAuthenticated for WebSocket without auth", async () => {
        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          NotAuthenticated,
        );
      });

      it("should refuse a WebSocket opened from another origin", async () => {
        mockSocket.handshake!.headers = {
          ...webSignIn("valid-jwt-token"),
          host: "localhost",
          origin: "https://evil.example",
        };
        jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload));

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          CrossSiteRequestRefused,
        );
      });

      it("should throw AccountNotActivated for WebSocket with unactivated user", async () => {
        const inactivePayload = { ...mockJwtPayload, activated: false };
        mockSocket.handshake!.headers = webSignIn("valid-jwt-token");
        jwtService.verifyAsync.mockResolvedValue(verified(inactivePayload));

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
          AccountNotActivated,
        );
      });
    });
  });

  describe("verifyJWTToken", () => {
    it("should return valid result for correct token", async () => {
      const token = "valid-token";
      jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload));

      const [isValid, user] = await (guard as any).verifyJWTToken(token);

      expect(isValid).toBe(true);
      expect(user).toBeInstanceOf(AuthenticatedUser);
      expect(user.userId).toBe("user-123");
      expect(user.roles).toEqual(["USER"]);
      expect(user.activated).toBe(true);
    });

    it.each([
      ["refresh+jwt", "a refresh token"],
      ["JWT", "an untyped token"],
    ])("should refuse typ %s (%s)", async (typ) => {
      jwtService.verifyAsync.mockResolvedValue(verified(mockJwtPayload, typ));

      const [isValid, user] = await (guard as any).verifyJWTToken("token");

      expect(isValid).toBe(false);
      expect(user).toBeUndefined();
    });

    it("should return invalid result for malformed token", async () => {
      const token = "invalid-token";
      jwtService.verifyAsync.mockRejectedValue(new Error("Invalid token"));

      const [isValid, user] = await (guard as any).verifyJWTToken(token);

      expect(isValid).toBe(false);
      expect(user).toBeUndefined();
    });

    it("should handle JWT verification with multiple roles", async () => {
      const token = "valid-token";
      const payloadWithMultipleRoles = {
        ...mockJwtPayload,
        roles: ["USER", "ADMIN"],
      };
      jwtService.verifyAsync.mockResolvedValue(
        verified(payloadWithMultipleRoles),
      );

      const [isValid, user] = await (guard as any).verifyJWTToken(token);

      expect(isValid).toBe(true);
      expect(user.roles).toEqual(["USER", "ADMIN"]);
    });
  });
});
