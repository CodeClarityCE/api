
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { User } from 'src/base_modules/users/users.entity';

/**
 * Email service for sending emails to users.
 */
@Injectable()
export class EmailService {
    private webHost: string;
    private env: string;
    private testEmail?: string;
    private platformName: string;
    /**
     * Constructs the email service with necessary dependencies and configuration values.
     *
     * @param mailerService - Service for sending emails.
     * @param configService - Service for reading configuration values.
     */
    constructor(
        private readonly mailerService: MailerService,
        private readonly configService: ConfigService
    ) {
        this.webHost = this.configService.getOrThrow<string>('WEB_HOST');
        this.platformName = this.configService.getOrThrow<string>('PLATFORM_NAME');
        this.env = process.env['ENV'] ?? 'dev';
        if (process.env['TEST_EMAIL'] !== undefined) {
            this.testEmail = process.env['TEST_EMAIL'];
        }
    }
    /**
     * Sends a registration confirmation email to a newly signed-up user.
     *
     * @param params - Parameters for sending the email.
     * @param params.email - The recipient's email address.
     * @param params.token - The token used for confirming the registration.
     * @param params.userIdDigest - The hashed userId.
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
            .then(() => console.log('Mail successfully sent'))
            .catch((error) => console.error(error));
    }

    /**
     * Sends a password reset email to the user.
     *
     * @param params - Parameters for sending the email.
     * @param params.email - The recipient's email address.
     * @param params.token - The token used for resetting the password.
     * @param params.userIdDigest - The hashed userId.
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
     * Sends an invitation to an existing user to join an organization.
     *
     * @param params - Parameters for sending the email.
     * @param params.email - The recipient's email address.
     * @param params.inviteToken - The token used for joining the organization.
     * @param params.blockOrgInvitesToken - The token used for blocking future invites from this organization.
     * @param params.blockAllOrgInvitesToken - The token used for blocking all future invites.
     * @param params.userEmailDigest - The hashed user email.
     * @param params.organizationName - The name of the organization to which the user was invited.
     * @param params.inviter - The inviter's details.
     * @param params.orgId - The ID of the organization.
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
        const orgInvitesBlockUrl = `${this.webHost}/email_action/unsubscribe/block_org_invites?token=${blockOrgInvitesToken}&useremail=${userEmailDigest}&orgId=${orgId}`;
        const allOrgInvitesBlockUrl = `${this.webHost}/email_action/unsubscribe/block_all_org_invites?token=${blockAllOrgInvitesToken}&useremail=${userEmailDigest}`;

        await this.sendEmail({
            to: email,
            subject: `${this.platformName} - Invited to join ${organizationName}`,
            template: './organization_invite',
            templateData: {
                inviter_first_name: inviter.first_name,
                inviter_last_name: inviter.last_name,
                organization_name: organizationName,
                organization_invite_url: url,
                organization_block_invites_url: orgInvitesBlockUrl,
                block_all_invites_url: allOrgInvitesBlockUrl,
                platform_name: this.platformName,
                web_host: this.webHost.split('//')[1]
            }
        });
    }

    /**
     * Sends an invitation to a non-user (an email that is not yet linked to a user on our platform) to join an organization.
     *
     * @param params - Parameters for sending the email.
     * @param params.email - The recipient's email address.
     * @param params.inviteToken - The token used for joining the organization.
     * @param params.blockEmailsToken - The token used for blocking all future invites to this email.
     * @param params.userEmailDigest - The hashed user email.
     * @param params.organizationName - The name of the organization to which the user was invited.
     * @param params.inviter - The inviter's details.
     * @param params.orgId - The ID of the organization.
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
            subject: `${this.platformName} - Invited to join ${organizationName}`,
            template: './organization_invite_non_user',
            templateData: {
                inviter_first_name: inviter.first_name,
                inviter_last_name: inviter.last_name,
                organization_name: organizationName,
                organization_invite_url: url,
                block_email_url: unsubscribeUrl,
                platform_name: this.platformName,
                web_host: this.webHost.split('//')[1]
            }
        });
    }

    /**
     * Sends an email using the mailer service.
     *
     * @param params - Parameters for sending the email.
     * @param params.to - The recipient's email address.
     * @param params.subject - The subject of the email.
     * @param params.template - The template used for rendering the email content.
     * @param params.templateData - The data passed to the template engine.
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
        if (this.env === 'dev') {
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
