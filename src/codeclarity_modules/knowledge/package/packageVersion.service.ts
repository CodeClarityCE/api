import { Injectable } from '@nestjs/common';
import { PackageVersionRepository } from './packageVersion.repository';
import { PhpPackageMetadataRepository } from './phpPackageMetadata.repository';
import { PackageVersion, PackageMetadata } from './packageVersion.entity';
import { PhpPackageMetadata } from './phpPackageMetadata.entity';

export interface CreatePackageVersionDto {
    ecosystem: string;
    package_name: string;
    version: string;
    metadata: PackageMetadata;
    php_metadata?: Partial<PhpPackageMetadata>;
}

export interface PackageSearchResult {
    ecosystem: string;
    package_name: string;
    version: string;
    description?: string;
    homepage?: string;
    license?: string | string[];
}

@Injectable()
export class PackageVersionService {
    constructor(
        private readonly packageVersionRepository: PackageVersionRepository,
        private readonly phpPackageMetadataRepository: PhpPackageMetadataRepository
    ) {}

    async createOrUpdatePackageVersion(dto: CreatePackageVersionDto): Promise<PackageVersion> {
        return this.packageVersionRepository.createOrUpdatePackageVersion(
            dto.ecosystem,
            dto.package_name,
            dto.version,
            dto.metadata,
            dto.php_metadata
        );
    }

    async findPackageVersions(ecosystem: string, packageName: string): Promise<PackageVersion[]> {
        return this.packageVersionRepository.findByEcosystemAndName(ecosystem, packageName);
    }

    async findSpecificVersion(
        ecosystem: string,
        packageName: string,
        version: string
    ): Promise<PackageVersion | null> {
        return this.packageVersionRepository.findByEcosystemNameAndVersion(
            ecosystem,
            packageName,
            version
        );
    }

    async searchPackages(
        ecosystem: string,
        searchTerm: string,
        limit = 50
    ): Promise<PackageSearchResult[]> {
        const packages = await this.packageVersionRepository.searchPackages(
            ecosystem,
            searchTerm,
            limit
        );

        return packages.map(pkg => ({
            ecosystem: pkg.ecosystem,
            package_name: pkg.package_name,
            version: pkg.version,
            description: pkg.metadata?.description,
            homepage: pkg.metadata?.homepage,
            license: pkg.metadata?.license
        }));
    }

    async getEcosystemStats(ecosystem: string): Promise<{
        total_packages: number;
        packages: PackageVersion[];
    }> {
        const total_packages = await this.packageVersionRepository.countByEcosystem(ecosystem);
        const packages = await this.packageVersionRepository.findByEcosystem(ecosystem, 10);

        return {
            total_packages,
            packages
        };
    }

    async getPhpPackageMetadata(packageVersionId: string): Promise<PhpPackageMetadata | null> {
        return this.phpPackageMetadataRepository.findByPackageVersionId(packageVersionId);
    }

    async findPhpPackagesByType(composerType: string): Promise<PhpPackageMetadata[]> {
        return this.phpPackageMetadataRepository.findByComposerType(composerType);
    }

    async findPhpPackagesByPhpVersion(phpVersion: string): Promise<PhpPackageMetadata[]> {
        return this.phpPackageMetadataRepository.findByPhpVersionConstraint(phpVersion);
    }

    async updatePhpMetadata(
        packageVersionId: string,
        updates: Partial<PhpPackageMetadata>
    ): Promise<PhpPackageMetadata | null> {
        return this.phpPackageMetadataRepository.updatePhpMetadata(packageVersionId, updates);
    }

    async bulkCreatePackageVersions(packages: CreatePackageVersionDto[]): Promise<PackageVersion[]> {
        const results = [];
        for (const pkg of packages) {
            const result = await this.createOrUpdatePackageVersion(pkg);
            results.push(result);
        }
        return results;
    }

    async getPackageVersionWithPhpMetadata(
        ecosystem: string,
        packageName: string,
        version: string
    ): Promise<PackageVersion | null> {
        const packageVersion = await this.findSpecificVersion(ecosystem, packageName, version);
        if (!packageVersion) {
            return null;
        }

        if (ecosystem === 'packagist' && !packageVersion.php_metadata) {
            const phpMetadata = await this.getPhpPackageMetadata(packageVersion.id);
            packageVersion.php_metadata = phpMetadata || undefined;
        }

        return packageVersion;
    }
}