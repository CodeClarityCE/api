import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";

import { Email, EmailType } from "src/base_modules/email/email.entity";

@Injectable() // Marking the class as a NestJS injectable service
export class EmailRepository {
  constructor(
    @InjectRepository(Email, "codeclarity") // Injecting the repository for the Email entity using the 'codeclarity' connection name
    private emailRepository: Repository<Email>, // Declaring a private property to hold the injected repository
  ) {}

  /**
   * Retrieves an email by type and user ID.
   *
   * @param emailType - The type of email to retrieve.
   * @param userID - The ID of the user associated with the email.
   * @returns A Promise that resolves to the retrieved Email entity.
   * @throws EntityNotFound if no email is found matching the criteria.
   */
  async getMailByType(
    emailType: EmailType,
    userID: string,
  ): Promise<Email | null> {
    const mail = await this.emailRepository.findOne({
      where: {
        email_type: emailType,
        user: {
          id: userID,
        },
      },
      relations: {
        user: true, // Including the related user entity in the result
      },
    });

    return mail;
  }

  /**
   * Retrieves the unexpired registration confirmation email for this token and user digest, if any.
   *
   * @param tokenDigest - The digest of the token sent in the confirmation link.
   * @param userIdDigest - The digest of the user id sent in the confirmation link.
   */
  async findRegistrationMail(
    tokenDigest: string,
    userIdDigest: string,
  ): Promise<Email | null> {
    return this.emailRepository.findOne({
      where: {
        email_type: EmailType.USERS_REGISTRATION_VERIFICATION,
        token_digest: tokenDigest,
        user_id_digest: userIdDigest,
        ttl: MoreThan(new Date()),
      },
      relations: {
        user: true,
      },
    });
  }

  /**
   * Retrieves the invite email sent with this invitation token, if any.
   *
   * @param tokenDigest - The invitation's token digest.
   * @param userEmailDigest - The hash of the invitee's email.
   */
  async findInviteMail(
    tokenDigest: string,
    userEmailDigest: string,
  ): Promise<Email | null> {
    return this.emailRepository.findOne({
      where: {
        email_type: EmailType.ORGANIZATION_INVITE,
        token_digest: tokenDigest,
        user_id_digest: userEmailDigest,
      },
    });
  }

  /**
   * Retrieves the unexpired password reset email for this token and user digest, if any.
   *
   * @param tokenDigest - The digest of the token sent in the reset link.
   * @param userIdDigest - The digest of the user id sent in the reset link.
   */
  async findPasswordResetMail(
    tokenDigest: string,
    userIdDigest: string,
  ): Promise<Email | null> {
    return this.emailRepository.findOne({
      where: {
        email_type: EmailType.USERS_PASSWORD_RESET,
        token_digest: tokenDigest,
        user_id_digest: userIdDigest,
        ttl: MoreThan(new Date()),
      },
      relations: {
        user: true,
      },
    });
  }

  /**
   * Deletes an Email by its id and says whether this call deleted it.
   * Two concurrent calls for the same id cannot both get true.
   *
   * @param mailId - The id of the email to delete.
   */
  async consumeMail(mailId: string): Promise<boolean> {
    const result = await this.emailRepository.delete({ id: mailId });
    return (result.affected ?? 0) > 0;
  }

  /**
   * Removes a given Email entity from the database.
   *
   * @param mail - The Email entity to remove.
   * @returns A Promise that resolves once the removal is complete.
   */
  async removeMail(mail: Email): Promise<void> {
    await this.emailRepository.remove(mail);
  }

  /**
   * Deletes an Email from the database by its id.
   *
   * @param mailId - The id of the email to delete.
   * @returns A Promise that resolves once the deletion is complete.
   */
  async deleteMail(mailId: string): Promise<void> {
    await this.emailRepository.delete({ id: mailId });
  }

  /**
   * Saves a given Email entity to the database. If the entity already has a primary key, it will be updated; otherwise, it will be inserted.
   *
   * @param mail - The Email entity to save.
   * @returns A Promise that resolves once the saving is complete.
   */
  async saveMail(mail: Email): Promise<void> {
    await this.emailRepository.save(mail);
  }
}
