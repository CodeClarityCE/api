import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Invitation } from "src/base_modules/organizations/invitations/invitation.entity";
import { EntityNotFound } from "src/types/error.types";

/**
 * Pure repository for invitation database operations.
 */
@Injectable()
export class InvitationsRepository {
  constructor(
    @InjectRepository(Invitation, "codeclarity")
    private readonly invitationRepository: Repository<Invitation>,
  ) {}

  /**
   * Save an invitation in the database.
   */
  async saveInvitation(invitation: Invitation): Promise<Invitation> {
    return this.invitationRepository.save(invitation);
  }

  /**
   * Delete an invitation from the database.
   */
  async deleteInvitation(invitation: Invitation): Promise<void> {
    await this.invitationRepository.delete(invitation);
  }

  /**
   * Retrieve all invitations for a specific organization and user.
   */
  async getInvitationsByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<Invitation[]> {
    return this.invitationRepository.find({
      where: {
        organization: { id: organizationId },
        user: { id: userId },
      },
    });
  }

  /**
   * Retrieve a single invitation based on the provided criteria.
   * @throws {EntityNotFound} if no invitation is found matching the criteria.
   */
  async getInvitationBy(
    where: object,
    relations?: object,
  ): Promise<Invitation> {
    const invitation = await this.invitationRepository.findOne({
      where: where,
      ...(relations ? { relations: relations } : {}),
    });

    if (!invitation) {
      throw new EntityNotFound();
    }
    return invitation;
  }
}
