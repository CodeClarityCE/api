import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Email, EmailType } from 'src/entity/codeclarity/Email';
import { Repository } from 'typeorm';

@Injectable()
export class EmailRepository {

    constructor(
        @InjectRepository(Email, 'codeclarity')
        private emailRepository: Repository<Email>,
    ) { }


    async getMailByType(emailType: EmailType, userID: string): Promise<Email | null> {
        return await this.emailRepository.findOne({
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
    }

    async getActivationMail(activationTokenhash: string, userIdHash: string): Promise<Email | null> {
        return await this.emailRepository.findOne({
            where: {
                token_digest: activationTokenhash,
                user_id_digest: userIdHash
            },
            relations: {
                user: true
            }
        });
    }

    async removeMail(mail: Email) {
        await this.emailRepository.remove(mail);
    }

    async saveMail(mail: Email) {
        await this.emailRepository.save(mail);
    }
}
