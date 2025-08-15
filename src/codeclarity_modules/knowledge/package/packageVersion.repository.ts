import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PackageVersion } from './packageVersion.entity';
import { PhpPackageMetadata } from './phpPackageMetadata.entity';

@Injectable()
export class PackageVersionRepository {
    constructor(
        @InjectRepository(PackageVersion, 'knowledge')
        private packageVersionRepository: Repository<PackageVersion>,
        @InjectRepository(PhpPackageMetadata, 'knowledge')
        private phpPackageMetadataRepository: Repository<PhpPackageMetadata>
    ) {}

    async findByEcosystemAndName(ecosystem: string, packageName: string): Promise<PackageVersion[]> {
        return this.packageVersionRepository.find({
            where: {
                ecosystem,
                package_name: packageName
            },
            order: {
                created_at: 'DESC'
            }
        });
    }

    async findByEcosystemNameAndVersion(
        ecosystem: string,
        packageName: string,
        version: string
    ): Promise<PackageVersion | null> {
        return this.packageVersionRepository.findOne({
            where: {
                ecosystem,
                package_name: packageName,
                version
            },
            relations: {
                php_metadata: true
            }
        });
    }

    async createPackageVersion(packageVersionData: Partial<PackageVersion>): Promise<PackageVersion> {
        const packageVersion = this.packageVersionRepository.create(packageVersionData);
        return this.packageVersionRepository.save(packageVersion);
    }

    async createOrUpdatePackageVersion(
        ecosystem: string,
        packageName: string,
        version: string,
        metadata: any,
        phpMetadata?: Partial<PhpPackageMetadata>
    ): Promise<PackageVersion> {
        let packageVersion = await this.findByEcosystemNameAndVersion(ecosystem, packageName, version);

        if (packageVersion) {
            packageVersion.metadata = metadata;
            packageVersion = await this.packageVersionRepository.save(packageVersion);
        } else {
            packageVersion = await this.createPackageVersion({
                ecosystem,
                package_name: packageName,
                version,
                metadata
            });
        }

        if (phpMetadata && ecosystem === 'packagist') {
            await this.createOrUpdatePhpMetadata(packageVersion.id, phpMetadata);
        }

        return packageVersion;
    }

    async createOrUpdatePhpMetadata(
        packageVersionId: string,
        phpMetadata: Partial<PhpPackageMetadata>
    ): Promise<PhpPackageMetadata> {
        let existingMetadata = await this.phpPackageMetadataRepository.findOne({
            where: { package_version_id: packageVersionId }
        });

        if (existingMetadata) {
            Object.assign(existingMetadata, phpMetadata);
            return this.phpPackageMetadataRepository.save(existingMetadata);
        } else {
            const newMetadata = this.phpPackageMetadataRepository.create({
                package_version_id: packageVersionId,
                ...phpMetadata
            });
            return this.phpPackageMetadataRepository.save(newMetadata);
        }
    }

    async findByEcosystem(ecosystem: string, limit = 100, offset = 0): Promise<PackageVersion[]> {
        return this.packageVersionRepository.find({
            where: { ecosystem },
            take: limit,
            skip: offset,
            order: {
                created_at: 'DESC'
            }
        });
    }

    async countByEcosystem(ecosystem: string): Promise<number> {
        return this.packageVersionRepository.count({
            where: { ecosystem }
        });
    }

    async searchPackages(
        ecosystem: string,
        searchTerm: string,
        limit = 50
    ): Promise<PackageVersion[]> {
        return this.packageVersionRepository
            .createQueryBuilder('pv')
            .where('pv.ecosystem = :ecosystem', { ecosystem })
            .andWhere('pv.package_name ILIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
            .orderBy('pv.package_name', 'ASC')
            .limit(limit)
            .getMany();
    }
}