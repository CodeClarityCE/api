import { Package } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { EntityNotFound } from 'src/types/error.types';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class PackageRepository {
    constructor(
        @InjectRepository(Package, 'knowledge')
        private packageRepository: Repository<Package>
    ) {}

    async getPackageInfo(
        dependencyName: string,
        language = 'javascript'
    ): Promise<Package> {
        if (dependencyName.includes('/')) {
            dependencyName.replace('/', ':');
        }
        const pack = await this.getPackageInfoWithoutFailing(dependencyName, language);
        if (!pack) {
            throw new EntityNotFound();
        }
        return pack;
    }

    async getPackageInfoWithoutFailing(
        dependencyName: string,
        language = 'javascript'
    ): Promise<Package | null> {
        if (dependencyName.includes('/')) {
            dependencyName.replace('/', ':');
        }
        return this.packageRepository.findOne({
            where: {
                name: dependencyName,
                language: language
            }
        });
    }

    async getVersionInfo(
        dependency_name: string,
        dependency_version: string,
        language = 'javascript'
    ): Promise<Package> {
        // Use query builder to avoid TypeORM relation issues with column names
        const package_version = await this.packageRepository
            .createQueryBuilder('package')
            .leftJoinAndSelect('package.versions', 'version', 'version.version = :version', {
                version: dependency_version
            })
            .where('package.name = :name', { name: dependency_name })
            .andWhere('package.language = :language', { language })
            .getOne();

        if (!package_version) {
            throw new EntityNotFound();
        }
        return package_version;
    }
}
