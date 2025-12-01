import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { compare as semverCompare } from 'semver';
import { Package, Version } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { EntityNotFound } from 'src/types/error.types';
import { Repository } from 'typeorm';

@Injectable()
export class VersionsRepository {
    constructor(
        @InjectRepository(Package, 'knowledge')
        private packageRepository: Repository<Package>,

        @InjectRepository(Version, 'knowledge')
        private versionRepository: Repository<Version>
    ) {}

    async getVersion(
        dependencyName: string,
        dependencyVersion: string,
        language = 'javascript'
    ): Promise<Version> {
        if (dependencyName.includes('/')) {
            dependencyName.replace('/', ':');
        }
        const pack = await this.packageRepository.findOne({
            where: {
                name: dependencyName,
                language: language
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

    async getDependencyVersions(dependency: string, language = 'javascript'): Promise<Version[]> {
        if (dependency.includes('/')) {
            dependency.replace('/', ':');
        }
        const pack = await this.packageRepository.findOne({
            where: {
                name: dependency,
                language: language
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
        versions.sort((a, b) => semverCompare(a.version, b.version));
        return versions;
    }
}
