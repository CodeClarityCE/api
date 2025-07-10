import { Exclude, Expose } from 'class-transformer';
import { OptionalTransform } from 'src/transformers/transformer';
import { ApiProperty } from '@nestjs/swagger';

/********************************************/
/*                  Enums                   */
/********************************************/

export enum IntegrationType {
    VCS = 'VCS'
}

export enum IntegrationProvider {
    GITHUB = 'GITHUB',
    GITLAB = 'GITLAB',
    FILE = 'FILE'
}

/********************************************/
/*             Database entities            */
/********************************************/

export abstract class AccessTokenBasedIntegration<_Type> {
    @ApiProperty()
    @Expose()
    integration_type: IntegrationType;

    @ApiProperty()
    @Expose()
    integration_provider: IntegrationProvider;

    @Exclude({ toPlainOnly: true })
    access_token: string;

    @Exclude({ toPlainOnly: true })
    refresh_token?: string;

    @ApiProperty()
    @Expose()
    @OptionalTransform((v) => new Date(v))
    expiry_date?: Date;

    @ApiProperty()
    @Expose()
    invalid: boolean;

    @ApiProperty()
    @Expose()
    service_domain: string;

    @ApiProperty()
    @Type(() => Date)
    @Expose()
    added_on: Date;

    @ApiProperty()
    @Expose()
    added_by: string;
}

export class Integration {
    @ApiProperty()
    @Type(() => Date)
    @Expose()
    added_on: Date;

    @ApiProperty()
    @Expose()
    added_by: string;

    @ApiProperty()
    @Expose()
    service_domain: string;

    @ApiProperty()
    @Expose()
    integration_type: IntegrationType;

    @ApiProperty()
    @Expose()
    integration_provider: IntegrationProvider;

    @ApiProperty()
    @Expose()
    invalid: boolean;

    @ApiProperty()
    @Expose()
    expiry_date?: Date;

    @ApiProperty()
    @Expose()
    organization_id: string;
}

export class VCSIntegrationMetaData {
    @Expose()
    @OptionalTransform((v) => new Date(v))
    last_repository_sync?: Date;
}

export class VCSIntegration {
    @Exclude({ toPlainOnly: true })
    meta_data: VCSIntegrationMetaData;
}

export class Repository {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty()
    @Expose()
    url: string;

    @ApiProperty()
    @Expose()
    default_branch: string;

    @ApiProperty()
    @Expose()
    visibility: string;

    @ApiProperty()
    @Expose()
    fully_qualified_name: string;

    @ApiProperty()
    @Expose()
    description: string;

    @ApiProperty()
    @Type(() => Date)
    @Expose()
    created_at: Date;

    @ApiProperty()
    @Expose()
    imported_already: boolean;

    @ApiProperty()
    @Expose()
    integration_id: string;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface IntegrationUpdate {
    integration_type: IntegrationType;
    integration_provider: IntegrationProvider;
    service_domain: string;
    invalid: boolean;
}

export interface IntegrationCreate {
    integration_type: IntegrationType;
    integration_provider: IntegrationProvider;
    added_on: Date;
    added_by: string;
    service_domain: string;
    organization_id: string;
    invalid: boolean;
}

export interface AccessTokenBasedIntegrationCreate extends IntegrationCreate {
    access_token: string;
    refresh_token?: string;
    expiry_date?: Date;
}

export interface RepositoryCreate {
    url: string;
    default_branch: string;
    visibility: string;
    fully_qualified_name: string;
    description: string;
    created_at: Date;
    integration_id: string;
}
