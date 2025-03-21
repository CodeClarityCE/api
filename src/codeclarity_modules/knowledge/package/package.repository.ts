import { Injectable } from '@nestjs/common';
import { EntityNotFound } from 'src/types/error.types';
import { Package } from 'src/codeclarity_modules/knowledge/package/package.entity';
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
        const pack = await this.getPackageInfoWithoutFailing(dependencyName);
        if (!pack) {
            throw new EntityNotFound();
        }
        return pack;
    }

    async getPackageInfoWithoutFailing(dependencyName: string): Promise<Package | null> {
        if (dependencyName.includes('/')) {
            dependencyName.replace('/', ':');
        }
        return this.packageRepository.findOne({
            where: {
                name: dependencyName
            }
        });
    }

    async getVersionInfo(dependency_name: string, dependency_version: string): Promise<Package> {
        const package_version = await this.packageRepository.findOne({
            where: {
                name: dependency_name,
                versions: {
                    version: dependency_version
                }
            },
            relations: {
                versions: true
            }
        });
        if (!package_version) {
            throw new EntityNotFound();
        }
        return package_version;
    }
}
