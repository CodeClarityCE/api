import { compareVersions } from 'compare-versions';
import { Injectable } from '@nestjs/common';
import { EntityNotFound } from 'src/types/error.types';
import { Package, Version } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class VersionsRepository {
    constructor(
        @InjectRepository(Package, 'knowledge')
        private packageRepository: Repository<Package>,

        @InjectRepository(Version, 'knowledge')
        private versionRepository: Repository<Version>
    ) {}

    async getVersion(dependencyName: string, dependencyVersion: string): Promise<Version> {
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

        const version = await this.versionRepository.findOne({
            where: {
                package: pack,
                version: dependencyVersion
            }
        });
        if (!version) {
            throw new EntityNotFound();
        }
        return version;
    }

    async getDependencyVersions(dependency: string): Promise<Version[]> {
        if (dependency.includes('/')) {
            dependency.replace('/', ':');
        }
        const pack = await this.packageRepository.findOne({
            where: {
                name: dependency
            },
            relations: {
                versions: true
            }
        });
        if (!pack) {
            throw new EntityNotFound();
        }

        const versions: Version[] = [];
        for (const version of pack.versions) {
            versions.push(version);
        }
        versions.sort((a, b) => compareVersions(a.version, b.version));
        return versions;
    }
}
