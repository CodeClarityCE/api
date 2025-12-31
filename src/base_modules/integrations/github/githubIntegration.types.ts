import { ApiProperty } from "@nestjs/swagger";
import { Exclude, Expose, Type } from "class-transformer";
import { IsEnum, IsNotEmpty } from "class-validator";

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

export enum GithubTokenType {
  OAUTH_TOKEN = "OAUTH_TOKEN",
  CLASSIC_TOKEN = "CLASSIC_TOKEN",
}

/********************************************/
/*             Database entities            */
/********************************************/

export class GithubIntegration
  extends AccessTokenBasedIntegration<GithubIntegration>
  implements Integration, VCSIntegration
{
  @ApiProperty()
  @Expose()
  token_type!: GithubTokenType;

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

export class LinkGithubCreateBody {
  @ApiProperty()
  @IsNotEmpty()
  token!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEnum(GithubTokenType)
  token_type!: GithubTokenType;
}

/********************************************/
/*             HTTP Patch bodies            */
/********************************************/

export class LinkGithubPatchBody {
  @IsNotEmpty()
  token!: string;

  @IsNotEmpty()
  token_type!: GithubTokenType;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface LinkGithubCreate {
  token: string;
  token_type: GithubTokenType;
}

export class GithubIntegrationCreate
  implements AccessTokenBasedIntegrationCreate, IntegrationCreate
{
  integration_type!: IntegrationType;
  integration_provider!: IntegrationProvider;
  token_type!: GithubTokenType;
  access_token!: string;
  refresh_token?: string;
  expiry_date?: Date;
  service_domain!: string;
  invalid!: boolean;
  added_on!: Date;
  added_by!: string;
  organization_id!: string;
  meta_data!: VCSIntegrationMetaData;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export class GithubIntegrationUpdate {
  access_token!: string;
  refresh_token?: string | undefined;
  expiry_date?: Date | undefined;
  invalid!: boolean;
  token_type!: GithubTokenType;
  meta_data!: VCSIntegrationMetaData;
}
