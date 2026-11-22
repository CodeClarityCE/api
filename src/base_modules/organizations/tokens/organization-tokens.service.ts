import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "crypto";
import { MoreThan, Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { OrganizationLoggerService } from "src/base_modules/organizations/log/organizationLogger.service";
import { ActionType } from "src/base_modules/organizations/log/orgAuditLog.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import { NotAuthenticated } from "src/types/error.types";

import { OrganizationToken } from "./organization-token.entity";
import {
  CreatedOrganizationToken,
  ORGANIZATION_TOKEN_PREFIX,
  OrganizationTokenCreateBody,
  OrganizationTokenPrincipal,
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
   * The token a secret belongs to, if it has not expired.
   * @throws {NotAuthenticated}
   */
  async authenticate(secret: string): Promise<OrganizationTokenPrincipal> {
    const token = await this.tokens.findOne({
      where: {
        secret_hash: hashSecret(secret),
        expires_on: MoreThan(new Date()),
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
