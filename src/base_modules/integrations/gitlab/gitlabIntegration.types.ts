import { ApiProperty } from "@nestjs/swagger";
import { Exclude, Expose, Type } from "class-transformer";
import { IsEnum, IsNotEmpty, IsUrl } from "class-validator";

import {
  AccessTokenBasedIntegration,
  AccessTokenBasedIntegrationCreate,
  Integration,
  IntegrationCreate,
  IntegrationProvider,
  IntegrationType,
  VCSIntegration,
  VCSIntegrationMetaData,
} from "../integration.types";

/********************************************/
/*                  Enums                   */
/********************************************/

export enum GitlabTokenType {
  OAUTH_TOKEN = "OAUTH_TOKEN",
  PERSONAL_ACCESS_TOKEN = "PERSONAL_ACCESS_TOKEN",
}

/********************************************/
/*             Database entities            */
/********************************************/

export class GitlabIntegration
  extends AccessTokenBasedIntegration<GitlabIntegration>
  implements Integration, VCSIntegration
{
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  service_base_url!: string;

  @ApiProperty()
  @Expose()
  token_type!: GitlabTokenType;

  @ApiProperty()
  @Expose()
  organization_id!: string;

  @Exclude({ toPlainOnly: true })
  @Type(() => VCSIntegrationMetaData)
  meta_data!: VCSIntegrationMetaData;
}

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class LinkGitlabCreateBody {
  @ApiProperty()
  @IsNotEmpty()
  token!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEnum(GitlabTokenType)
  token_type!: GitlabTokenType;

  @ApiProperty()
  @IsUrl({ require_protocol: true })
  gitlab_instance_url!: string;
}

/********************************************/
/*             HTTP Patch bodies            */
/********************************************/

export class LinkGitlabPatchBody {
  @IsNotEmpty()
  token!: string;

  @IsNotEmpty()
  @IsEnum(GitlabTokenType)
  token_type!: GitlabTokenType;

  @IsUrl()
  gitlab_instance_url!: string;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface LinkGitlabCreate {
  token: string;
  token_type: GitlabTokenType;
  gitlab_instance_url: string;
}

export class GitLabIntegrationCreate
  implements AccessTokenBasedIntegrationCreate, IntegrationCreate
{
  integration_type!: IntegrationType;
  integration_provider!: IntegrationProvider;
  added_on!: Date;
  added_by!: string;
  service_domain!: string;
  access_token!: string;
  refresh_token?: string;
  expiry_date?: Date;
  invalid!: boolean;
  service_base_url!: string;
  token_type!: GitlabTokenType;
  organization_id!: string;
  meta_data!: VCSIntegrationMetaData;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export class GitLabIntegrationUpdate {
  access_token!: string;
  refresh_token?: string | undefined;
  expiry_date?: Date | undefined;
  invalid!: boolean;
  token_type!: GitlabTokenType;
  service_base_url!: string;
  service_domain!: string;
  meta_data!: VCSIntegrationMetaData;
}
