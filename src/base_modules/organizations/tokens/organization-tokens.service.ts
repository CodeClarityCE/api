import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "crypto";
import { IsNull, MoreThan, Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { OrganizationLoggerService } from "src/base_modules/organizations/log/organizationLogger.service";
import { ActionType } from "src/base_modules/organizations/log/orgAuditLog.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import { EntityNotFound, NotAuthenticated } from "src/types/error.types";

import { OrganizationToken } from "./organization-token.entity";
import {
  CreatedOrganizationToken,
  ORGANIZATION_TOKEN_PREFIX,
  OrganizationTokenCreateBody,
  OrganizationTokenPrincipal,
  OrganizationTokenSummary,
} from "./organization-token.types";

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Issues Organization tokens and resolves a secret to the token it belongs to. */
@Injectable()
export class OrganizationTokensService {
  constructor(
    @InjectRepository(OrganizationToken, "codeclarity")
    private readonly tokens: Repository<OrganizationToken>,
    private readonly memberships: MembershipsRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly users: UsersRepository,
    private readonly auditLog: OrganizationLoggerService,
  ) {}

  /**
   * Creates a token for the organization; only admins may.
   * @throws {NotAuthorized}
   */
  async create(
    organizationId: string,
    body: OrganizationTokenCreateBody,
    user: AuthenticatedUser,
  ): Promise<CreatedOrganizationToken> {
    await this.memberships.hasRequiredRoleFor(
      organizationId,
      user,
      MemberRole.ADMIN,
    );

    const secret = `${ORGANIZATION_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const token = new OrganizationToken();
    token.name = body.name;
    token.scope = body.scope;
    token.secret_hash = hashSecret(secret);
    token.created_on = new Date();
    token.expires_on = new Date(body.expires_on);
    token.organization =
      await this.organizations.getOrganizationById(organizationId);
    token.created_by = await this.users.getUserById(user.userId);
    const saved = await this.tokens.save(token);

    await this.auditLog.addAuditLog(
      ActionType.OrganizationTokenCreated,
      `The User created the Organization token ${saved.name} with the ${saved.scope} scope.`,
      organizationId,
      user.userId,
    );

    return Object.assign(new CreatedOrganizationToken(), {
      id: saved.id,
      name: saved.name,
      scope: saved.scope,
      created_on: saved.created_on,
      expires_on: saved.expires_on,
      secret,
    });
  }

  /**
   * The organization's tokens, newest first, without their secrets; only admins may.
   * @throws {NotAuthorized}
   */
  async list(
    organizationId: string,
    user: AuthenticatedUser,
  ): Promise<OrganizationTokenSummary[]> {
    await this.memberships.hasRequiredRoleFor(
      organizationId,
      user,
      MemberRole.ADMIN,
    );
    const tokens = await this.tokens.find({
      where: { organizationId, revoked_on: IsNull() },
      relations: { created_by: true },
      order: { created_on: "DESC" },
    });
    return tokens.map((token) =>
      Object.assign(new OrganizationTokenSummary(), {
        id: token.id,
        name: token.name,
        scope: token.scope,
        created_on: token.created_on,
        expires_on: token.expires_on,
        created_by_email: token.created_by?.email ?? null,
      }),
    );
  }

  /**
   * Revokes a token of the organization so it is refused from now on; only admins may.
   * @throws {NotAuthorized}
   * @throws {EntityNotFound} for a token of another organization or one already revoked
   */
  async revoke(
    organizationId: string,
    tokenId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.memberships.hasRequiredRoleFor(
      organizationId,
      user,
      MemberRole.ADMIN,
    );
    const token = await this.tokens.findOne({
      where: { id: tokenId, organizationId, revoked_on: IsNull() },
    });
    if (!token) throw new EntityNotFound();
    token.revoked_on = new Date();
    await this.tokens.save(token);

    await this.auditLog.addAuditLog(
      ActionType.OrganizationTokenRevoked,
      `The User revoked the Organization token ${token.name}.`,
      organizationId,
      user.userId,
    );
  }

  /**
   * The token a secret belongs to, if it has not expired or been revoked.
   * @throws {NotAuthenticated}
   */
  async authenticate(secret: string): Promise<OrganizationTokenPrincipal> {
    const token = await this.tokens.findOne({
      where: {
        secret_hash: hashSecret(secret),
        expires_on: MoreThan(new Date()),
        revoked_on: IsNull(),
      },
    });
    if (!token) throw new NotAuthenticated();
    return {
      id: token.id,
      name: token.name,
      organizationId: token.organizationId,
      scope: token.scope,
    };
  }

  /** Writes one audit log entry for a request made with the token. */
  async recordUse(
    token: OrganizationTokenPrincipal,
    request: string,
  ): Promise<void> {
    await this.auditLog.addTokenAuditLog(
      ActionType.OrganizationTokenUsed,
      `The Organization token ${token.name} called ${request}.`,
      token,
    );
  }
}
