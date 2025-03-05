import { Controller, Get, Param } from '@nestjs/common';
import { AuthUser } from 'src/decorators/UserDecorator';
import { LicenseService } from './license.service';
import { AuthenticatedUser } from 'src/types/auth/types';
import { TypedResponse } from 'src/types/apiResponses';
import { License } from 'src/codeclarity_modules/knowledge/license/license.entity';

@Controller('knowledge/license')
export class LicenseController {
    constructor(private readonly licenseService: LicenseService) {}

    @Get(':license_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('license_id') license_id: string
    ): Promise<TypedResponse<License>> {
        return { data: await this.licenseService.get(license_id) };
    }

    @Get()
    async getAll(@AuthUser() user: AuthenticatedUser): Promise<TypedResponse<Array<License>>> {
        console.log(user);
        return { data: await this.licenseService.getAll() };
    }
}
