import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty } from "class-validator";

/********************************************/
/*                  Enums                   */
/********************************************/

export enum GithubTokenType {
  OAUTH_TOKEN = "OAUTH_TOKEN",
  CLASSIC_TOKEN = "CLASSIC_TOKEN",
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
