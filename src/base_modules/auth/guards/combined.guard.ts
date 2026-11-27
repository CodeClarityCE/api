import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import { readFileSync } from "fs";
import type { Jwt } from "jsonwebtoken";
import { join } from "path";
import { Socket } from "socket.io";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import {
  ACCESS_COOKIE,
  assertSameOrigin,
  readCookie,
  type RequestHeaders,
} from "src/base_modules/auth/session-cookies";
import {
  claimsOfKind,
  TokenKind,
  verifyOptionsFor,
} from "src/base_modules/auth/token-kinds";
import {
  ORGANIZATION_TOKEN_PREFIX,
  OrganizationTokenScope,
  scopeIncludes,
} from "src/base_modules/organizations/tokens/organization-token.types";
import { OrganizationTokensService } from "src/base_modules/organizations/tokens/organization-tokens.service";
import { ORGANIZATION_TOKEN_SCOPE_KEY } from "src/decorators/OrganizationTokenDecorator";
import { SKIP_AUTH_KEY } from "src/decorators/SkipAuthDecorator";
import {
  AccountNotActivated,
  NotAuthenticated,
  NotAuthorized,
  OrganizationTokenScopeTooNarrow,
} from "src/types/error.types";

/** The parts of a Fastify request the token check reads. */
/** A request the guard records its user on. */
interface GuardedRequest extends FastifyRequest {
  user?: AuthenticatedUser;
}

interface RoutedRequest {
  method: string;
  params?: Record<string, string>;
  routeOptions?: { url?: string };
}

/**
 * Guards every route that does not skip auth: a web sign-in's access cookie,
 * or an Organization token as a bearer on routes that allow one.
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  publicKey: string;

  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private organizationTokens: OrganizationTokensService,
  ) {
    this.publicKey = readFileSync(
      join(process.cwd(), "jwt", "public.pem"),
      "utf8",
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this endpoint is a public / non-auth endpoint
    const isNonAuthEndpoint = this.reflector.getAllAndOverride<boolean>(
      SKIP_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isNonAuthEndpoint) {
      return true;
    }

    let headers: RequestHeaders;
    let request: GuardedRequest | undefined = undefined;
    let socket: Socket | undefined = undefined;
    if (context.getType() === "ws") {
      socket = context.switchToWs().getClient();
      headers = socket?.handshake.headers ?? {};
    } else {
      request = context.switchToHttp().getRequest<GuardedRequest>();
      headers = request?.headers ?? {};
    }

    // A bearer is judged alone, and only Organization tokens are bearers (ADR 0025).
    const authHeader = headers["authorization"];
    if (authHeader !== undefined) {
      const bearer = this.extractBearer(authHeader);
      if (!bearer?.startsWith(ORGANIZATION_TOKEN_PREFIX) || !request) {
        throw new NotAuthenticated();
      }
      request.user = await this.authorizeOrganizationToken(
        bearer,
        context,
        request as unknown as RoutedRequest,
      );
      return true;
    }

    // Otherwise a web sign-in: the access cookie, sent by the app itself.
    const accessToken = readCookie(headers, ACCESS_COOKIE);
    if (!accessToken) throw new NotAuthenticated();
    assertSameOrigin(headers);

    const [jwtTokenValid, userJWT] = await this.verifyJWTToken(accessToken);
    if (!jwtTokenValid) throw new NotAuthenticated();
    if (!userJWT?.activated) throw new AccountNotActivated();
    if (request) {
      request.user = userJWT;
    } else if (socket) {
      (socket.data as { user?: AuthenticatedUser }).user = userJWT;
    }
    return true;
  }

  /**
   * Checks that the token may call this route in this organization, and
   * records the call in the organization's audit log.
   * @throws {NotAuthenticated} for an unknown or expired token
   * @throws {NotAuthorized} for a route or organization the token may not use
   * @throws {OrganizationTokenScopeTooNarrow} for a route that needs a wider scope
   */
  private async authorizeOrganizationToken(
    secret: string,
    context: ExecutionContext,
    request: RoutedRequest,
  ): Promise<AuthenticatedUser> {
    const token = await this.organizationTokens.authenticate(secret);
    const required = this.reflector.getAllAndOverride<
      OrganizationTokenScope | undefined
    >(ORGANIZATION_TOKEN_SCOPE_KEY, [context.getHandler(), context.getClass()]);
    if (!required) throw new NotAuthorized();
    if (!scopeIncludes(token.scope, required)) {
      throw new OrganizationTokenScopeTooNarrow();
    }
    const orgId =
      request.params?.["org_id"] ?? request.params?.["organization_id"];
    if (orgId !== token.organizationId) throw new NotAuthorized();

    await this.organizationTokens.recordUse(
      token,
      `${request.method} ${request.routeOptions?.url ?? "an unknown route"}`,
    );
    const user = new AuthenticatedUser(token.id, [ROLE.USER], true);
    user.organizationToken = token;
    return user;
  }

  /** The token of a `Bearer <token>` header, or undefined for any other value. */
  private extractBearer(authHeader: string | string[]): string | undefined {
    if (typeof authHeader !== "string") return undefined;
    const [type, token] = authHeader.split(" ");
    return type === "Bearer" ? token : undefined;
  }

  /**
   * Verifies that a given JWT token is valid.
   * @param token the JWT token
   * @returns {Promise<[boolean, AuthenticatedUser|undefined]>} (1) a boolean indicating if it is valid, and (2) the user to which the JWT token belongs if valid otherwise undefined
   */
  private async verifyJWTToken(
    token: string,
  ): Promise<[boolean, AuthenticatedUser | undefined]> {
    try {
      // Only access tokens pass; refresh and untyped tokens fail here.
      const verified = await this.jwtService.verifyAsync<Jwt>(token, {
        secret: this.publicKey,
        ...verifyOptionsFor(TokenKind.ACCESS),
      });
      const payload = claimsOfKind(verified, TokenKind.ACCESS);
      return [
        true,
        new AuthenticatedUser(
          payload.userId,
          payload.roles,
          payload.activated ?? false,
        ),
      ];
    } catch {
      return [false, undefined];
    }
  }
}
