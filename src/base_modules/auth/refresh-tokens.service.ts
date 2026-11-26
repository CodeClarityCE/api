import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes, randomUUID } from "crypto";
import ms from "ms";
import { IsNull, LessThanOrEqual, Not, Repository } from "typeorm";

import { CodeClarityLogger } from "src/services/logger.service";
import { NotAuthenticated } from "src/types/error.types";

import { CONST_REFRESH_TOKEN_EXPIRES_IN } from "./constants";
import { RefreshToken } from "./refresh-token.entity";

/** A refresh token as handed to the client, with the user it signs in. */
export interface IssuedRefreshToken {
  userId: string;
  familyId: string;
  token: string;
  expiresOn: Date;
}

// The token is 32 random bytes, so a plain SHA-256 is enough to store it.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues, rotates and revokes the opaque refresh tokens of user sign-ins. */
@Injectable()
export class RefreshTokensService {
  private readonly logger = CodeClarityLogger.forService(
    "RefreshTokensService",
  );

  constructor(
    @InjectRepository(RefreshToken, "codeclarity")
    private readonly tokens: Repository<RefreshToken>,
  ) {}

  /** Starts a new family for a sign-in, valid for seven days. */
  async issue(userId: string): Promise<IssuedRefreshToken> {
    const expiresOn = new Date(Date.now() + ms(CONST_REFRESH_TOKEN_EXPIRES_IN));
    return this.save(this.tokens, userId, randomUUID(), expiresOn);
  }

  /**
   * Marks the token used and returns its successor in the same family.
   * A token that was already used revokes its whole family.
   * @throws {NotAuthenticated} for an unknown, used, revoked or expired token
   */
  async rotate(token: unknown): Promise<IssuedRefreshToken> {
    if (typeof token !== "string" || token === "") {
      throw new NotAuthenticated();
    }
    const tokenHash = hashToken(token);

    // The row stays locked until the successor is saved, so a concurrent
    // reuse sees it used and revokes the successor too.
    const next = await this.tokens.manager.transaction(async (manager) => {
      const claimed = await manager
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ used_on: () => "now()" })
        .where("token_hash = :tokenHash", { tokenHash })
        .andWhere("used_on IS NULL")
        .andWhere("revoked_on IS NULL")
        .andWhere("expires_on > now()")
        .returning(["family_id", "userId", "expires_on"])
        .execute();
      const row = (
        claimed.raw as {
          family_id: string;
          userId: string;
          expires_on: Date;
        }[]
      )[0];
      if (!row) return undefined;
      return this.save(
        manager.getRepository(RefreshToken),
        row.userId,
        row.family_id,
        new Date(row.expires_on),
      );
    });
    if (next) return next;

    const known = await this.tokens.findOne({
      where: { token_hash: tokenHash },
    });
    if (known?.used_on && !known.revoked_on) {
      await this.revokeFamily(known.family_id);
      this.logger.warn("A used refresh token came back; revoked its family", {
        userId: known.userId,
        familyId: known.family_id,
      });
    }
    throw new NotAuthenticated();
  }

  /** Revokes the family the token belongs to; an unknown token does nothing. */
  async revokeFamilyOf(token: unknown): Promise<void> {
    if (typeof token !== "string" || token === "") return;
    const known = await this.tokens.findOne({
      where: { token_hash: hashToken(token) },
    });
    if (known) await this.revokeFamily(known.family_id);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.update(
      { family_id: familyId, revoked_on: IsNull() },
      { revoked_on: new Date() },
    );
  }

  /** Revokes every sign-in of the user. */
  async revokeAllOf(userId: string): Promise<void> {
    await this.tokens.update(
      { userId, revoked_on: IsNull() },
      { revoked_on: new Date() },
    );
  }

  /**
   * Deletes expired and revoked rows and returns how many went. Used rows of
   * live families stay, so their reuse is still caught.
   */
  async deleteStale(): Promise<number> {
    const expired = await this.tokens.delete({
      expires_on: LessThanOrEqual(new Date()),
    });
    const revoked = await this.tokens.delete({ revoked_on: Not(IsNull()) });
    return (expired.affected ?? 0) + (revoked.affected ?? 0);
  }

  private async save(
    repository: Repository<RefreshToken>,
    userId: string,
    familyId: string,
    expiresOn: Date,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString("base64url");
    await repository.insert({
      token_hash: hashToken(token),
      family_id: familyId,
      userId,
      created_on: new Date(),
      expires_on: expiresOn,
      used_on: null,
      revoked_on: null,
    });
    return { userId, familyId, token, expiresOn };
  }
}
