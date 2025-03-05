import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { License } from 'src/entity/knowledge/License';
import { EntityNotFound } from 'src/types/errors/types';
import { Repository } from 'typeorm';

@Injectable()
export class LicenseRepository {
    constructor(
        @InjectRepository(License, 'knowledge')
        private licenseRepository: Repository<License>
    ) {}

    async getLicenseData(licenseId: string): Promise<License> {
        const license = await this.licenseRepository.findOne({
            where: { licenseId: licenseId }
        });

        if (!license) {
            throw new EntityNotFound();
        }

        return license;
    }

    async getAllLicenseData(): Promise<Array<License>> {
        const licenses = await this.licenseRepository.find({});
        return licenses;
    }
}
