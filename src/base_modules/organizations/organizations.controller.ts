import {
    Body,
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { OrganizationLoggerService } from 'src/base_modules/organizations/log/organizationLogger.service';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import {
    AlreadyExists,
    CannotLeaveAsOwner,
    CannotRevokeOwnMembership,
    EntityNotFound,
    InternalError,
    InvitationInvalidOrExpired,
    NotAMember,
    NotAuthenticated,
    NotAuthorized,
    PersonalOrgCannotBeModified,
    UserDoesNotExist
} from 'src/types/error.types';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { APIDocNoDataResponseDecorator } from 'src/decorators/NoDataResponse';
import { SortDirection } from 'src/types/sort.types';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import {
    JoinOrgCreateBody,
    OrganizationCreateBody,
    OrganizationInfoForInvitee,
    OrganizationMetaData
} from 'src/base_modules/organizations/org.types';
import { TeamMember } from 'src/base_modules/users/teamMember.types';
import { InviteCreateBody } from 'src/base_modules/organizations/invitations/orgInvitation.types';
import { OrganizationAuditLog } from 'src/base_modules/organizations/log/orgAuditLog.types';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { Log } from 'src/base_modules/organizations/log/log.entity';
import { Invitation } from 'src/base_modules/organizations/invitations/invitation.entity';
import { InvitationOrgAlreadyExists } from './organizations.errors';
import { OrganizationMemberships } from './memberships/organization.memberships.entity';

@ApiBearerAuth()
@Controller('org')
export class OrganizationsController {
    constructor(
        private readonly organizationsService: OrganizationsService,
        private readonly organizationLoggerService: OrganizationLoggerService
    ) {}

    @ApiTags('Organizations')
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Post('')
    async create(
        @AuthUser() user: AuthenticatedUser,
        @Body() organization: OrganizationCreateBody
    ): Promise<CreatedResponse> {
        return { id: await this.organizationsService.create(organization, user) };
    }

    @ApiTags('Organizations')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':organization_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string
    ): Promise<TypedResponse<object>> {
        return { data: await this.organizationsService.get(organization_id, user) };
    }

    @ApiTags('Organizations')
    @APIDocTypedResponseDecorator(OrganizationMetaData)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':organization_id/meta_data')
    async getMetaData(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string
    ): Promise<TypedResponse<Organization>> {
        return { data: await this.organizationsService.getOrgMetaData(organization_id, user) };
    }

    @ApiTags('Organizations')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'entries_per_page', required: false })
    @ApiQuery({ name: 'search_key', required: false })
    @ApiQuery({ name: 'sort_key', required: false })
    @ApiQuery({ name: 'sort_direction', required: false })
    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('sort_key') sort_key?: string,
        @Query('sort_direction') sort_direction?: SortDirection
    ): Promise<TypedPaginatedResponse<object>> {
        return await this.organizationsService.getMany(
            { currentPage: page, entriesPerPage: entries_per_page },
            user,
            search_key,
            sort_key,
            sort_direction
        );
    }

    @ApiTags('Organizations')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [CannotLeaveAsOwner, PersonalOrgCannotBeModified, EntityNotFound]
    })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Post(':organization_id/leave_org')
    async leaveOrg(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string
    ): Promise<NoDataResponse> {
        await this.organizationsService.leaveOrg(organization_id, user);
        return {};
    }

    @ApiTags('Organizations')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 400, errors: [PersonalOrgCannotBeModified, EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Delete(':organization_id')
    async deleteOrg(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string
    ): Promise<NoDataResponse> {
        await this.organizationsService.deleteOrg(organization_id, user);
        return {};
    }

    @ApiTags('Organizations')
    @APIDocTypedPaginatedResponseDecorator(Object)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':organization_id/members')
    async getOrgMembers(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('sort_key') sort_key?: string,
        @Query('sort_direction') sort_direction?: SortDirection
    ): Promise<TypedPaginatedResponse<OrganizationMemberships>> {
        return await this.organizationsService.getOrgMembers(
            organization_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user,
            search_key,
            sort_key,
            sort_direction
        );
    }

    @ApiTags('Organizations')
    @APIDocTypedResponseDecorator(TeamMember)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 400, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':organization_id/members/:user_id')
    async getOrgMember(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string,
        @Param('user_id') user_id: string
    ): Promise<TypedResponse<TeamMember>> {
        return {
            data: await this.organizationsService.getOrgMember(user_id, organization_id, user)
        };
    }

    @ApiTags('Organizations')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [EntityNotFound, PersonalOrgCannotBeModified, CannotRevokeOwnMembership, NotAMember]
    })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Delete(':organization_id/members/:user_id')
    async revokeMembership(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string,
        @Param('user_id') user_id: string
    ): Promise<NoDataResponse> {
        await this.organizationsService.revokeOrgMemberShip(organization_id, user_id, user);
        return {};
    }

    @ApiTags('Organizations')
    @APIDocNoDataResponseDecorator(201)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [
            PersonalOrgCannotBeModified,
            EntityNotFound,
            AlreadyExists,
            UserDoesNotExist,
            InvitationOrgAlreadyExists
        ]
    })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Post(':organization_id/create_invite')
    async createInvite(
        @AuthUser() user: AuthenticatedUser,
        @Body() inviteBody: InviteCreateBody,
        @Param('organization_id') organization_id: string
    ): Promise<NoDataResponse> {
        await this.organizationsService.inviteMember(organization_id, inviteBody, user);
        return {};
    }

    @ApiTags('Organizations')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 400, errors: [InvitationInvalidOrExpired] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Post(':organization_id/join')
    async joinOrg(
        @AuthUser() user: AuthenticatedUser,
        @Body() joinOrgBody: JoinOrgCreateBody
    ): Promise<NoDataResponse> {
        await this.organizationsService.joinOrg(joinOrgBody.token, joinOrgBody.email_digest, user);
        return {};
    }

    @ApiTags('Organizations')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 400, errors: [InvitationInvalidOrExpired] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':organization_id/org_info_invitee')
    async inviteeInfo(
        @AuthUser() user: AuthenticatedUser,
        @Query('token') token: string,
        @Query('user_email_hash') user_email_hash: string
    ): Promise<TypedResponse<OrganizationInfoForInvitee>> {
        const info = await this.organizationsService.getInviteeInfo(token, user_email_hash, user);

        return {
            data: info
        };
    }

    @ApiTags('Organizations')
    @APIDocTypedPaginatedResponseDecorator(OrganizationAuditLog)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':organization_id/audit_logs')
    async getOrgLogs(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('sort_key') sort_key?: string,
        @Query('sort_direction') sort_direction?: SortDirection
    ): Promise<TypedPaginatedResponse<Log>> {
        return await this.organizationLoggerService.getAuditLogs(
            organization_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user,
            search_key,
            sort_key,
            sort_direction
        );
    }

    @ApiTags('Organizations')
    @APIDocTypedPaginatedResponseDecorator(Invitation)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':organization_id/invitations')
    async getOrgInvites(
        @AuthUser() user: AuthenticatedUser,
        @Param('organization_id') organization_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('sort_key') sort_key?: string,
        @Query('sort_direction') sort_direction?: SortDirection
    ): Promise<TypedPaginatedResponse<Invitation>> {
        return await this.organizationsService.getInvitations(
            organization_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user,
            search_key,
            sort_key,
            sort_direction
        );
    }

    @ApiTags('Organizations')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 400, errors: [PersonalOrgCannotBeModified] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Delete(':organization_id/invitations/:invitation_id')
    async revokeInvite(
        @AuthUser() user: AuthenticatedUser,
        @Param('invitation_id') invitation_id: string,
        @Param('organization_id') organization_id: string
    ): Promise<NoDataResponse> {
        await this.organizationsService.revokeInvitation(organization_id, invitation_id, user);
        return {};
    }

    @ApiTags('Organizations')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 400, errors: [PersonalOrgCannotBeModified] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Post(':organization_id/invitations/:invitation_id/resend')
    async resendInvitationEmail(
        @AuthUser() user: AuthenticatedUser,
        @Param('invitation_id') invitation_id: string,
        @Param('organization_id') organization_id: string
    ): Promise<NoDataResponse> {
        await this.organizationsService.reSendOrganizationInviteEmail(
            organization_id,
            invitation_id,
            user
        );
        return {};
    }
}
