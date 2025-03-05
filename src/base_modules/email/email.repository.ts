import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Email, EmailType } from 'src/base_modules/email/email.entity';
import { EntityNotFound } from 'src/types/errors/types';
import { Repository } from 'typeorm';

@Injectable() // Marking the class as a NestJS injectable service
export class EmailRepository {
    constructor(
        @InjectRepository(Email, 'codeclarity') // Injecting the repository for the Email entity using the 'codeclarity' connection name
        private emailRepository: Repository<Email>, // Declaring a private property to hold the injected repository
    ) { }

    /**
     * Retrieves an email by type and user ID.
     *
     * @param emailType - The type of email to retrieve.
     * @param userID - The ID of the user associated with the email.
     * @returns A Promise that resolves to the retrieved Email entity.
     * @throws EntityNotFound if no email is found matching the criteria.
     */
    async getMailByType(emailType: EmailType, userID: string): Promise<Email> {
        const mail = await this.emailRepository.findOne({
            where: {
                email_type: emailType,
                user: {
                    id: userID
                }
            },
            relations: {
                user: true // Including the related user entity in the result
            }
        });

        if (!mail) {
            throw new EntityNotFound() // Throwing an error if no matching email is found
        }
        return mail
    }

    /**
     * Retrieves an activation email by its token hash and user ID hash.
     *
     * @param activationTokenhash - The hash of the activation token associated with the email.
     * @param userIdHash - The hash of the user ID associated with the email.
     * @returns A Promise that resolves to the retrieved Email entity.
     * @throws EntityNotFound if no activation email is found matching the criteria.
     */
    async getActivationMail(activationTokenhash: string, userIdHash: string): Promise<Email> {
        const mail =  await this.emailRepository.findOne({
            where: {
                token_digest: activationTokenhash,
                user_id_digest: userIdHash
            },
            relations: {
                user: true // Including the related user entity in the result
            }
        });

        if (!mail) {
            throw new EntityNotFound() // Throwing an error if no matching activation email is found
        }
        return mail
    }

    /**
     * Removes a given Email entity from the database.
     *
     * @param mail - The Email entity to remove.
     * @returns A Promise that resolves once the removal is complete.
     */
    async removeMail(mail: Email) {
        await this.emailRepository.remove(mail);
    }

    /**
     * Deletes a given Email entity from the database by its primary key.
     *
     * @param mail - The Email entity to delete.
     * @returns A Promise that resolves once the deletion is complete.
     */
    async deleteMail(mail: Email) {
        await this.emailRepository.delete(mail);
    }

    /**
     * Saves a given Email entity to the database. If the entity already has a primary key, it will be updated; otherwise, it will be inserted.
     *
     * @param mail - The Email entity to save.
     * @returns A Promise that resolves once the saving is complete.
     */
    async saveMail(mail: Email) {
        await this.emailRepository.save(mail);
    }
}