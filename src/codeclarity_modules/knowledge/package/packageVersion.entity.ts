import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    Relation
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { PhpPackageMetadata as PhpPackageMetadataEntity } from './phpPackageMetadata.entity';

@Entity('package_version')
@Index(['ecosystem', 'package_name'])
@Index(['ecosystem', 'package_name', 'version'], { unique: true })
export class PackageVersion {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column({
        length: 50
    })
    @Index()
    @ApiProperty({
        description: 'Package ecosystem (npm, packagist, pypi, etc.)',
        example: 'packagist'
    })
    @Expose()
    ecosystem: string;

    @Column({
        length: 255
    })
    @Index()
    @ApiProperty({
        description: 'Package name (e.g., vendor/package for PHP)',
        example: 'symfony/console'
    })
    @Expose()
    package_name: string;

    @Column({
        length: 100
    })
    @ApiProperty({
        description: 'Package version',
        example: '6.4.0'
    })
    @Expose()
    version: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty({
        description: 'Language-agnostic metadata',
        type: 'object',
        additionalProperties: true
    })
    @Expose()
    metadata: PackageMetadata;

    @CreateDateColumn({ type: 'timestamptz' })
    @ApiProperty()
    @Expose()
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    @ApiProperty()
    @Expose()
    updated_at: Date;

    // Relationships
    @OneToOne(() => PhpPackageMetadataEntity, (phpMeta) => phpMeta.package_version, { cascade: true })
    php_metadata?: Relation<PhpPackageMetadataEntity>;
}

// Base package metadata interface
export interface PackageMetadata {
    description?: string;
    homepage?: string;
    repository?: {
        type: string;
        url: string;
    };
    license?: string | string[];
    keywords?: string[];
    dependencies?: { [key: string]: string };
    dev_dependencies?: { [key: string]: string };
    // Ecosystem-specific metadata can be stored here
    ecosystem_data?: {
        [key: string]: any;
    };
}

// NPM-specific metadata structure
export interface NpmPackageMetadata extends PackageMetadata {
    ecosystem_data?: {
        dist?: {
            tarball: string;
            shasum: string;
            integrity?: string;
        };
        engines?: { [key: string]: string };
        scripts?: { [key: string]: string };
        bin?: { [key: string]: string } | string;
        main?: string;
        module?: string;
        types?: string;
        funding?: any;
    };
}

// PHP-specific metadata structure (base, with detailed info in separate table)
export interface PhpPackageMetadata extends PackageMetadata {
    ecosystem_data?: {
        dist?: {
            type: string;
            url: string;
            reference: string;
            shasum?: string;
        };
        source?: {
            type: string;
            url: string;
            reference: string;
        };
        require?: { [key: string]: string };
        require_dev?: { [key: string]: string };
        suggest?: { [key: string]: string };
        provide?: { [key: string]: string };
        replace?: { [key: string]: string };
        conflict?: { [key: string]: string };
        time?: string;
        type?: string;
        installation_source?: string;
        notification_url?: string;
    };
}