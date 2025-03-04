import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { User } from 'src/entity/codeclarity/User';

@Injectable()
export class EmailService {
    private webHost;
    private env;
    private testEmail;
    private platformName;

    constructor(
        private readonly mailerService: MailerService,
        private readonly configService: ConfigService
    ) {
        this.webHost = this.configService.getOrThrow<string>('WEB_HOST');
        this.platformName = this.configService.getOrThrow<string>('PLATFORM_NAME');
        this.env = process.env.ENV ?? 'dev';
        this.testEmail = process.env.TEST_EMAIL;
    }

    /**
     * Send a registration confirmation email to a newly signedup user
     * @param params
     * @param params.email The recipient of the email
     * @param params.token The token that is to be used to join the org
     * @param params.userIdDigest The hash of the userId
     */
    async sendRegistrationConfirmation({
        email,
        token,
        userIdDigest
    }: {
        email: string;
        token: string;
        userIdDigest: string;
    }) {
        const url = `${this.webHost}/email_action/confirm_registration?token=${token}&userid=${userIdDigest}`;

        await this.sendEmail({
            to: email,
            subject: `Welcome to ${this.platformName} - Please confirm your registration`,
            template: './user_confirmation',
            templateData: {
                confirmation_url: url,
                platform_name: this.platformName,
                web_host: this.webHost.split('//')[1]
            }
        })
            .then(() => {
                console.log('Mail successfully sent');
            })
            .catch((error) => {
                console.log(error);
            });
    }

    /**
     * Send a password reset email to a newly signedup user
     * @param params
     * @param params.email The recipient of the email
     * @param params.token The token that is to be used to join the org
     * @param params.userIdDigest The hash of the userId
     */
    async sendPasswordReset({
        email,
        token,
        userIdDigest
    }: {
        email: string;
        token: string;
        userIdDigest: string;
    }) {
        const url = `${this.webHost}/email_action/reset_password?token=${token}&userid=${userIdDigest}`;

        await this.sendEmail({
            to: email,
            subject: `${this.platformName} - Password reset`,
            template: './password_reset',
            templateData: {
                reset_password_url: url,
                platform_name: this.platformName,
                web_host: this.webHost.split('//')[1]
            }
        });
    }

    /**
     * Send an invitation to an existing user to join an organization
     * @param params
     * @param params.email The recipient of the email
     * @param params.inviteToken The token that is to be used to join the org
     * @param params.blockOrgInvitesToken The token that is to be used to block future email invites from this org
     * @param params.blockAllOrgInvitesToken The token that is to be used to block all future email invites
     * @param params.userEmailDigest The email hash
     * @param params.organizationName The organization to which the user was invited
     */
    async sendOrganizationInvite({
        email,
        inviteToken,
        blockOrgInvitesToken,
        blockAllOrgInvitesToken,
        userEmailDigest,
        organizationName,
        inviter,
        orgId
    }: {
        email: string;
        inviteToken: string;
        blockOrgInvitesToken: string;
        blockAllOrgInvitesToken: string;
        userEmailDigest: string;
        organizationName: string;
        inviter: User;
        orgId: string;
    }) {
        const url = `${this.webHost}/email_action/join_org?token=${inviteToken}&useremail=${userEmailDigest}&orgId=${orgId}`;
        const orgInvitesBlockurl = `${this.webHost}/email_action/unsubscribe/block_org_invites?token=${blockOrgInvitesToken}&useremail=${userEmailDigest}&orgId=${orgId}`;
        const allOrgInvitesBlockurl = `${this.webHost}/email_action/unsubscribe/block_all_org_invites?token=${blockAllOrgInvitesToken}&useremail=${userEmailDigest}`;

        await this.sendEmail({
            to: email,
            subject: `${this.platformName} - Invited to join Org`,
            template: './organization_invite',
            templateData: {
                inviter_last_name: inviter.last_name,
                inviter_first_name: inviter.first_name,
                organization_name: organizationName,
                organization_invite_url: url,
                organization_block_invites_url: orgInvitesBlockurl,
                block_all_invites_url: allOrgInvitesBlockurl,
                platform_name: this.platformName,
                web_host: this.webHost.split('//')[1]
            }
        });
    }

    /**
     * Send an invitation to an email - that is not yet linked to user on our platform - to join an organization
     * @param params
     * @param params.email The recipient of the email
     * @param params.inviteToken The token that is to be used to join the org
     * @param params.blockEmailsToken The token that is to be used to block email invites
     * @param params.userEmailDigest The email hash
     * @param params.organizationName The organization to which the user was invited
     */
    async sendOrganizationInviteForNonUser({
        email,
        inviteToken,
        blockEmailsToken,
        userEmailDigest,
        organizationName,
        inviter,
        orgId
    }: {
        email: string;
        inviteToken: string;
        blockEmailsToken: string;
        userEmailDigest: string;
        organizationName: string;
        inviter: User;
        orgId: string;
    }) {
        const url = `${this.webHost}/email_action/join_org?token=${inviteToken}&useremail=${userEmailDigest}&orgId=${orgId}`;
        const unsubscribeUrl = `${this.webHost}/email_action/unsubscribe/block_all_emails?token=${blockEmailsToken}&useremail=${userEmailDigest}`;

        await this.sendEmail({
            to: email,
            subject: `${this.platformName} - Invited to join Org`,
            template: './organization_invite_non_user',
            templateData: {
                inviter_last_name: inviter.last_name,
                inviter_first_name: inviter.last_name,
                organization_name: organizationName,
                organization_invite_url: url,
                block_email_url: unsubscribeUrl,
                platform_name: this.platformName,
                web_host: this.webHost.split('//')[1]
            }
        });
    }

    /**
     * Send an email
     * @param params
     * @param params.to The recipient of the email
     * @param params.subject The subject of the email
     * @param params.template The template of the email
     * @param params.templateData The template data of the email
     */
    private async sendEmail({
        to,
        subject,
        template,
        templateData
    }: {
        to: string;
        subject: string;
        template: string;
        templateData: any;
    }) {
        if (this.env == 'dev') {
            to = this.testEmail!;
        }

        await this.mailerService.sendMail({
            to: to,
            subject: subject,
            template: template,
            context: templateData
        });
    }
}
