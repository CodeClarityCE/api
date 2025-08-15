import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PhpPackageMetadata } from './phpPackageMetadata.entity';

@Injectable()
export class PhpPackageMetadataRepository {
    constructor(
        @InjectRepository(PhpPackageMetadata, 'knowledge')
        private phpMetadataRepository: Repository<PhpPackageMetadata>
    ) {}

    async findByPackageVersionId(packageVersionId: string): Promise<PhpPackageMetadata | null> {
        return this.phpMetadataRepository.findOne({
            where: {
                package_version_id: packageVersionId
            },
            relations: {
                package_version: true
            }
        });
    }

    async createPhpMetadata(phpMetadata: Partial<PhpPackageMetadata>): Promise<PhpPackageMetadata> {
        const metadata = this.phpMetadataRepository.create(phpMetadata);
        return this.phpMetadataRepository.save(metadata);
    }

    async updatePhpMetadata(
        packageVersionId: string,
        updates: Partial<PhpPackageMetadata>
    ): Promise<PhpPackageMetadata | null> {
        const metadata = await this.findByPackageVersionId(packageVersionId);
        if (!metadata) {
            return null;
        }

        Object.assign(metadata, updates);
        return this.phpMetadataRepository.save(metadata);
    }

    async findByComposerType(composerType: string): Promise<PhpPackageMetadata[]> {
        return this.phpMetadataRepository.find({
            where: {
                composer_type: composerType
            },
            relations: {
                package_version: true
            }
        });
    }

    async findByPhpVersionConstraint(phpVersionConstraint: string): Promise<PhpPackageMetadata[]> {
        return this.phpMetadataRepository.find({
            where: {
                php_version_constraint: phpVersionConstraint
            },
            relations: {
                package_version: true
            }
        });
    }

    async findByKeywords(keywords: string[]): Promise<PhpPackageMetadata[]> {
        return this.phpMetadataRepository
            .createQueryBuilder('php_meta')
            .leftJoinAndSelect('php_meta.package_version', 'package_version')
            .where('php_meta.keywords @> :keywords', { keywords: JSON.stringify(keywords) })
            .getMany();
    }

    async findByAuthorEmail(authorEmail: string): Promise<PhpPackageMetadata[]> {
        return this.phpMetadataRepository
            .createQueryBuilder('php_meta')
            .leftJoinAndSelect('php_meta.package_version', 'package_version')
            .where('php_meta.authors @> :authorFilter', {
                authorFilter: JSON.stringify([{ email: authorEmail }])
            })
            .getMany();
    }

    async deleteByPackageVersionId(packageVersionId: string): Promise<void> {
        await this.phpMetadataRepository.delete({ package_version_id: packageVersionId });
    }
}