import { IsNotEmpty, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IntegrationProvider } from './Integration';

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class ProjectImportBody {
    @ApiProperty()
    @IsOptional()
    integration_id: string;

    @ApiProperty()
    @IsUrl()
    @IsOptional()
    url: string;

    @ApiProperty()
    @IsOptional()
    name: string;

    @ApiProperty()
    @IsOptional()
    description: string;
}

/********************************************/
/*             HTTP Patch bodies            */
/********************************************/

export interface ProjectUpdateBody {
    description: string;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface ProjectCreate {
    name: string;
    description: string;
    integration_id: string;
    url: string;
    type: IntegrationProvider;
    downloaded: boolean;
    imported_on: Date;
    imported_by: string;
    organization_id: string;
    default_branch: string;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface ProjectUpdate extends ProjectCreate {}
