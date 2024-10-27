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
} from 'src/types/apiResponses';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/types/auth/types';
import { OrganizationLoggerService } from 'src/codeclarity_modules/organizations/organizationLogger.service';
import { ApiTags } from '@nestjs/swagger';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import {
    AlreadyExists,
    CannotLeaveAsOwner,
    CannotRevokeOwnMembership,
    EntityNotFound,
    InternalError,
    InvitationInvalidOrExpired,
    InvitationOrgAlreadyExists,
    NotAMember,
    NotAuthenticated,
    NotAuthorized,
    PersonalOrgCannotBeModified
} from 'src/types/errors/types';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { APIDocNoDataResponseDecorator } from 'src/decorators/NoDataResponse';
import { SortDirection } from 'src/types/sort/types';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import {
    JoinOrgCreateBody,
    OrganizationCreateBody,
    OrganizationMetaData
} from 'src/types/entities/frontend/Org';
import { TeamMember } from 'src/types/entities/frontend/TeamMember';
import { Invitation, InviteCreateBody } from 'src/types/entities/frontend/OrgInvitation';
import { OrganizationAuditLog } from 'src/types/entities/frontend/OrgAuditLog';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Log } from 'src/entity/codeclarity/Log';

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
    ): Promise<TypedResponse<Object>> {
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
    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('sort_key') sort_key?: string,
        @Query('sort_direction') sort_direction?: SortDirection
    ): Promise<TypedPaginatedResponse<Object>> {
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
    @APIDocTypedPaginatedResponseDecorator(TeamMember)
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
    ): Promise<TypedPaginatedResponse<TeamMember>> {
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
