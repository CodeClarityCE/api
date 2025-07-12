import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Relation } from 'typeorm';
import type { Organization } from '../organization.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

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

@Entity()
export class Log {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column()
    @ApiProperty()
    @Expose()
    action_severity: ActionSeverity;

    @Column({
        length: 25
    })
    @ApiProperty()
    @Expose()
    action_class: ActionClassType;

    @Column({
        length: 50
    })
    @ApiProperty()
    @Expose()
    action: ActionType;

    @Column('text')
    @ApiProperty()
    @Expose()
    description: string;

    @Column({
        length: 100
    })
    @ApiProperty()
    @Expose()
    blame_on_email: string;

    @Column('timestamptz')
    @ApiProperty()
    @Expose()
    created_on: Date;

    // Foreign keys
    @ManyToOne('Organization', 'logs')
    organization: Relation<Organization>;

    @Column()
    organization_id: string;

    @Column({ nullable: true })
    blame_on?: string;
}
