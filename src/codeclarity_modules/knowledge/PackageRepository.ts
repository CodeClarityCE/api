import { Injectable } from '@nestjs/common';
import { EntityNotFound } from 'src/types/errors/types';
import { Package } from 'src/entity/knowledge/Package';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class PackageRepository {
    constructor(
        @InjectRepository(Package, 'knowledge')
        private packageRepository: Repository<Package>
    ) {}

    async getPackageInfo(dependencyName: string): Promise<Package> {
        if (dependencyName.includes('/')) {
            dependencyName.replace('/', ':');
        }
        const pack = await this.packageRepository.findOne({
            where: {
                name: dependencyName
            }
        });
        if (!pack) {
            throw new EntityNotFound();
        }
        return pack;
    }
}
