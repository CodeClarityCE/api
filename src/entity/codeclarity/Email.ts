import { Entity, Column, PrimaryGeneratedColumn, Relation, ManyToOne } from 'typeorm';
import { User } from '../../base_modules/users/users.entity';

export enum EmailType {
    EMAILS_BLOCK_ALL_EMAILS = 'EMAILS_BLOCK_ALL_EMAILS',
    EMAILS_BLOCK_ORG_INVITES = 'EMAILS_BLOCK_ORG_INVITES',
    USERS_REGISTRATION_VERIFICATION = 'USERS_REGISTRATION_VERIFICATION',
    ORGANIZATION_INVITE = 'ORGANIZATION_INVITE',
    USERS_PASSWORD_RESET = 'USERS_PASSWORD_RESET'
}

@Entity()
export class Email {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        length: 250
    })
    token_digest: string;

    @Column()
    email_type: EmailType;

    @Column({
        length: 250
    })
    user_id_digest: string;

    @Column('timestamptz', { nullable: true })
    ttl: Date;

    @ManyToOne(() => User, (user) => user.mails)
    user: Relation<User>;
}
