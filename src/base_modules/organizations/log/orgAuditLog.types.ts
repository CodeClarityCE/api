import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

import { TeamMember } from "../../users/teamMember.types";

/********************************************/
/*                  Enums                   */
/********************************************/

// The frontend copies ActionSeverity in frontend/src/codeclarity_components/organizations/audit_logs/AuditLog.ts.
// The umbrella type-sync check (scripts/type-sync) fails CI when it lacks a value.
export enum ActionSeverity {
  Critical = 3,
  High = 2,
  Medium = 1,
  Low = 0,
}

// The frontend copies ActionClassType in frontend/src/codeclarity_components/organizations/audit_logs/AuditLog.ts.
// The umbrella type-sync check (scripts/type-sync) fails CI when it lacks a value.
export enum ActionClassType {
  Project = "Project",
  Analyzer = "Analyzer",
  Analysis = "Analysis",
  Organization = "Organization",
  Unkown = "Unkown",
}

// The frontend copies ActionType in frontend/src/codeclarity_components/organizations/audit_logs/AuditLog.ts.
// The umbrella type-sync check (scripts/type-sync) fails CI when it lacks a value.
export enum ActionType {
  ProjectCreate = "ProjectCreate",
  ProjectUpdate = "ProjectUpdate",
  ProjectDelete = "ProjectDelete",
  AnalyzerCreate = "AnalyzerCreate",
  AnalyzerUpdate = "AnalyzerUpdate",
  AnalyzerDelete = "AnalyzerDelete",
  AnalysisStarted = "AnalysisStarted",
  AnalysisDeleted = "AnalysisDeleted",
  AnalysisFailed = "AnalysisFailed",
  OrganizationUserLeft = "OrganizationUserLeft",
  OrganizationCreated = "OrganizationCreated",
  OrganizationMembershipRevoked = "OrganizationMembershipRevoked",
  OrganizationInvitationRevoked = "OrganizationInvitationRevoked",
  OrganizationMemberJoined = "OrganizationMemberJoined",
  OrganizationMemberInvited = "OrganizationMemberInvited",
  OrganizationIntegrationAdded = "OrganizationIntegrationAdded",
  OrganizationIntegrationUpdated = "OrganizationIntegrationUpdated",
  OrganizationIntegrationDeleted = "OrganizationIntegrationDeleted",
  OrganizationTokenCreated = "OrganizationTokenCreated",
  OrganizationTokenUsed = "OrganizationTokenUsed",
  OrganizationTokenRevoked = "OrganizationTokenRevoked",
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
/*              Miscellaneous               */
/********************************************/

// Creates, starts and updates rank Low; deletions, membership and
// integration changes rank higher.
const actionTypeSeverityMapping = new Map<ActionType, ActionSeverity>([
  [ActionType.AnalyzerCreate, ActionSeverity.Low],
  [ActionType.AnalyzerDelete, ActionSeverity.High],
  [ActionType.AnalyzerUpdate, ActionSeverity.Low],
  [ActionType.ProjectCreate, ActionSeverity.Low],
  [ActionType.ProjectUpdate, ActionSeverity.Low],
  [ActionType.ProjectDelete, ActionSeverity.High],
  [ActionType.AnalysisStarted, ActionSeverity.Low],
  [ActionType.AnalysisDeleted, ActionSeverity.High],
  [ActionType.AnalysisFailed, ActionSeverity.Medium],
  [ActionType.OrganizationUserLeft, ActionSeverity.High],
  [ActionType.OrganizationMemberJoined, ActionSeverity.High],
  [ActionType.OrganizationInvitationRevoked, ActionSeverity.High],
  [ActionType.OrganizationMemberInvited, ActionSeverity.High],
  [ActionType.OrganizationMembershipRevoked, ActionSeverity.High],
  [ActionType.OrganizationIntegrationAdded, ActionSeverity.Critical],
  [ActionType.OrganizationIntegrationUpdated, ActionSeverity.Critical],
  [ActionType.OrganizationIntegrationDeleted, ActionSeverity.Critical],
  [ActionType.OrganizationCreated, ActionSeverity.Critical],
  [ActionType.OrganizationTokenCreated, ActionSeverity.Critical],
  [ActionType.OrganizationTokenUsed, ActionSeverity.Low],
  [ActionType.OrganizationTokenRevoked, ActionSeverity.Critical],
]);

export function getSeverityOfAction(action: ActionType): ActionSeverity {
  if (actionTypeSeverityMapping.has(action)) {
    return actionTypeSeverityMapping.get(action)!;
  } else {
    return ActionSeverity.Low;
  }
}

const actionTypeClassMapping = new Map<ActionType, ActionClassType>([
  [ActionType.AnalyzerCreate, ActionClassType.Analyzer],
  [ActionType.AnalyzerDelete, ActionClassType.Analyzer],
  [ActionType.AnalyzerUpdate, ActionClassType.Analyzer],
  [ActionType.ProjectCreate, ActionClassType.Project],
  [ActionType.ProjectUpdate, ActionClassType.Project],
  [ActionType.ProjectDelete, ActionClassType.Project],
  [ActionType.AnalysisStarted, ActionClassType.Analysis],
  [ActionType.AnalysisDeleted, ActionClassType.Analysis],
  [ActionType.AnalysisFailed, ActionClassType.Analysis],
  [ActionType.OrganizationUserLeft, ActionClassType.Organization],
  [ActionType.OrganizationMemberJoined, ActionClassType.Organization],
  [ActionType.OrganizationMemberInvited, ActionClassType.Organization],
  [ActionType.OrganizationInvitationRevoked, ActionClassType.Organization],
  [ActionType.OrganizationMembershipRevoked, ActionClassType.Organization],
  [ActionType.OrganizationIntegrationAdded, ActionClassType.Organization],
  [ActionType.OrganizationIntegrationUpdated, ActionClassType.Organization],
  [ActionType.OrganizationIntegrationDeleted, ActionClassType.Organization],
  [ActionType.OrganizationCreated, ActionClassType.Organization],
  [ActionType.OrganizationTokenCreated, ActionClassType.Organization],
  [ActionType.OrganizationTokenUsed, ActionClassType.Organization],
  [ActionType.OrganizationTokenRevoked, ActionClassType.Organization],
]);

export function getTypeClassOfAction(action: ActionType): ActionClassType {
  if (actionTypeClassMapping.has(action)) {
    return actionTypeClassMapping.get(action)!;
  } else {
    return ActionClassType.Unkown;
  }
}
