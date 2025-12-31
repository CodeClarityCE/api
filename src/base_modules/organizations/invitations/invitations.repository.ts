import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { EntityNotFound } from "src/types/error.types";

import { Invitation } from "./invitation.entity";

/**
 * Injectable service for handling invitations.
 */
@Injectable()
export class InvitationsRepository {
  /**
   * Constructor to initialize the invitation repository.
   *
   * @param invitationRepository - Repository for managing invitations.
   */
  constructor(
    @InjectRepository(Invitation, "codeclarity")
    private readonly invitationRepository: Repository<Invitation>,
  ) {}

  /**
   * Saves an invitation in the database.
   *
   * @param invitation - The Invitation entity to be saved.
   * @returns A Promise that resolves to the saved Invitation entity.
   */
  async saveInvitation(invitation: Invitation): Promise<Invitation> {
    return this.invitationRepository.save(invitation);
  }

  /**
   * Deletes an invitation from the database.
   *
   * @param invitation - The Invitation entity to be deleted.
   * @returns A Promise that resolves when the deletion is complete.
   */
  async deleteInvitation(invitation: Invitation): Promise<void> {
    await this.invitationRepository.delete(invitation);
  }

  /**
   * Retrieves all invitations for a specific organization and user.
   *
   * @param organizationId - The ID of the organization to filter by.
   * @param userId - The ID of the user to filter by.
   * @returns A Promise that resolves to an array of Invitation entities.
   */
  async getInvitationsByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<Invitation[]> {
    const invitations = await this.invitationRepository.find({
      where: {
        organization: { id: organizationId },
        user: { id: userId },
      },
    });
    return invitations;
  }

  /**
   * Retrieves a single invitation based on the provided criteria.
   *
   * @param where - An object containing the criteria for finding the invitation.
   * @param relations - (Optional) An object specifying related entities to be loaded.
   * @returns A Promise that resolves to the found Invitation entity.
   * @throws EntityNotFound if no invitation is found matching the criteria.
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
