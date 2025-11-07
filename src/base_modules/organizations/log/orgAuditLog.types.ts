import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { TeamMember } from '../../users/teamMember.types';

/********************************************/
/*                  Enums                   */
/********************************************/

export enum ActionSeverity {
    Critical = 3,
    High = 2,
    Medium = 1,
    Low = 0
}

export enum ActionClassType {
    Project = 'Project',
    Analyzer = 'Analyzer',
    Analysis = 'Analysis',
    Organization = 'Organization',
    Unkown = 'Unkown'
}

export enum ActionType {
    SampleCreate = 'SampleCreate',
    ProjectCreate = 'ProjectCreate',
    ProjectUpdate = 'ProjectUpdate',
    ProjectDelete = 'ProjectDelete',
    AnalyzerCreate = 'AnalyzerCreate',
    AnalyzerUpdate = 'AnalyzerUpdate',
    AnalyzerDelete = 'AnalyzerDelete',
    AnalysisFailed = 'AnalysisFailed',
    OrganizationUserLeft = 'OrganizationUserLeft',
    OrganizationCreated = 'OrganizationCreated',
    OrganizationMembershipRevoked = 'OrganizationMembershipRevoked',
    OrganizationInvitationRevoked = 'OrganizationInvitationRevoked',
    OrganizationMemberJoined = 'OrganizationMemberJoined',
    OrganizationMemberInvited = 'OrganizationMemberInvited',
    OrganizationIntegrationAdded = 'OrganizationIntegrationAdded',
    OrganizationIntegrationUpdated = 'OrganizationIntegrationUpdated',
    OrganizationIntegrationDeleted = 'OrganizationIntegrationDeleted'
}

/********************************************/
/*             Database entities            */
/********************************************/

export class OrganizationAuditLog {
    @Expose()
    @ApiProperty()
    id!: string;

    @Expose()
    @ApiProperty()
    action_severity!: ActionSeverity;

    @Expose()
    @ApiProperty()
    action_class!: ActionClassType;

    @Expose()
    @ApiProperty()
    action!: ActionType;

    @Expose()
    @ApiProperty()
    description!: string;

    @Expose()
    @ApiProperty()
    blame_on?: TeamMember;

    @Expose()
    @ApiProperty()
    blame_on_email!: string;

    @Expose()
    @ApiProperty()
    @Type(() => Date)
    created_on!: Date;

    @Expose()
    @ApiProperty()
    organization_id!: string;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface OrganizationAuditLogCreate {
    action: ActionType;
    action_class: ActionClassType;
    action_severity: ActionSeverity;
    description: string;
    blame_on: string;
    blame_on_email: string;
    organization_id: string;
    created_on: Date;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface OrganizationAuditLogUpdate extends OrganizationAuditLogCreate {}

/********************************************/
/*              Miscellaneous               */
/********************************************/

export const actionTypeSeverityMapping = new Map<ActionType, ActionSeverity>([
    [ActionType.AnalyzerCreate, ActionSeverity.High],
    [ActionType.AnalyzerDelete, ActionSeverity.High],
    [ActionType.AnalyzerUpdate, ActionSeverity.High],
    [ActionType.ProjectCreate, ActionSeverity.Low],
    [ActionType.ProjectUpdate, ActionSeverity.Low],
    [ActionType.ProjectDelete, ActionSeverity.Low],
    [ActionType.AnalysisFailed, ActionSeverity.Medium],
    [ActionType.OrganizationUserLeft, ActionSeverity.Low],
    [ActionType.OrganizationMemberJoined, ActionSeverity.Medium],
    [ActionType.OrganizationInvitationRevoked, ActionSeverity.Medium],
    [ActionType.OrganizationMemberInvited, ActionSeverity.High],
    [ActionType.OrganizationMembershipRevoked, ActionSeverity.High],
    [ActionType.OrganizationIntegrationAdded, ActionSeverity.Critical],
    [ActionType.OrganizationIntegrationUpdated, ActionSeverity.Critical],
    [ActionType.OrganizationIntegrationDeleted, ActionSeverity.Critical],
    [ActionType.OrganizationCreated, ActionSeverity.Critical]
]);

export function getSeverityOfAction(action: ActionType): ActionSeverity {
    if (actionTypeSeverityMapping.has(action)) {
        return actionTypeSeverityMapping.get(action)!;
    } else {
        return ActionSeverity.Low;
    }
}

export const actionTypeClassMapping = new Map<ActionType, ActionClassType>([
    [ActionType.AnalyzerCreate, ActionClassType.Analyzer],
    [ActionType.AnalyzerDelete, ActionClassType.Analyzer],
    [ActionType.AnalyzerUpdate, ActionClassType.Analyzer],
    [ActionType.ProjectCreate, ActionClassType.Project],
    [ActionType.ProjectUpdate, ActionClassType.Project],
    [ActionType.ProjectDelete, ActionClassType.Project],
    [ActionType.AnalysisFailed, ActionClassType.Analysis],
    [ActionType.OrganizationUserLeft, ActionClassType.Organization],
    [ActionType.OrganizationMemberJoined, ActionClassType.Organization],
    [ActionType.OrganizationMemberInvited, ActionClassType.Organization],
    [ActionType.OrganizationInvitationRevoked, ActionClassType.Organization],
    [ActionType.OrganizationMembershipRevoked, ActionClassType.Organization],
    [ActionType.OrganizationIntegrationAdded, ActionClassType.Organization],
    [ActionType.OrganizationIntegrationUpdated, ActionClassType.Organization],
    [ActionType.OrganizationIntegrationDeleted, ActionClassType.Organization],
    [ActionType.OrganizationCreated, ActionClassType.Organization]
]);

export function getTypeClassOfAction(action: ActionType): ActionClassType {
    if (actionTypeClassMapping.has(action)) {
        return actionTypeClassMapping.get(action)!;
    } else {
        return ActionClassType.Unkown;
    }
}
