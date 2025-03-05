import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Email, EmailType } from 'src/base_modules/email/email.entity';
import { EntityNotFound } from 'src/types/errors/types';
import { Repository } from 'typeorm';

@Injectable()
export class EmailRepository {

    constructor(
        @InjectRepository(Email, 'codeclarity')
        private emailRepository: Repository<Email>,
    ) { }


    async getMailByType(emailType: EmailType, userID: string): Promise<Email> {
        const mail = await this.emailRepository.findOne({
            where: {
                email_type: emailType,
                user: {
                    id: userID
                }
            },
            relations: {
                user: true
            }
        });

        if (!mail) {
            throw new EntityNotFound()
        }
        return mail
    }

    async getActivationMail(activationTokenhash: string, userIdHash: string): Promise<Email> {
        const mail =  await this.emailRepository.findOne({
            where: {
                token_digest: activationTokenhash,
                user_id_digest: userIdHash
            },
            relations: {
                user: true
            }
        });

        if (!mail) {
            throw new EntityNotFound()
        }
        return mail
    }

    async removeMail(mail: Email) {
        await this.emailRepository.remove(mail);
    }

    async deleteMail(mail: Email) {
        await this.emailRepository.delete(mail);
    }

    async saveMail(mail: Email) {
        await this.emailRepository.save(mail);
    }
}
