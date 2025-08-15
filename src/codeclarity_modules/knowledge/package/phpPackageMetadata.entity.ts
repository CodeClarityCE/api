import {
    Entity,
    Column,
    PrimaryColumn,
    OneToOne,
    JoinColumn,
    Relation
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { PackageVersion } from './packageVersion.entity';

@Entity('php_package_metadata')
export class PhpPackageMetadata {
    @PrimaryColumn('uuid')
    @ApiProperty()
    @Expose()
    package_version_id: string;

    @Column({
        length: 100,
        nullable: true
    })
    @ApiProperty({
        description: 'PHP version constraint (e.g., >=8.0)',
        example: '>=8.0',
        required: false
    })
    @Expose()
    php_version_constraint?: string;

    @Column({
        length: 50,
        nullable: true
    })
    @ApiProperty({
        description: 'Composer package type',
        example: 'library',
        enum: ['library', 'project', 'metapackage', 'composer-plugin', 'wordpress-plugin', 'drupal-module'],
        required: false
    })
    @Expose()
    composer_type?: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty({
        description: 'Composer autoload configuration',
        type: 'object',
        additionalProperties: true
    })
    @Expose()
    autoload?: AutoloadConfig;

    @Column('jsonb', { nullable: true })
    @ApiProperty({
        description: 'Package authors',
        type: 'array',
        items: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                email: { type: 'string' },
                homepage: { type: 'string' },
                role: { type: 'string' }
            }
        },
        required: false
    })
    @Expose()
    authors?: Author[];

    @Column('jsonb', { nullable: true })
    @ApiProperty({
        description: 'License information',
        required: false
    })
    @Expose()
    license?: string | string[];

    @Column('jsonb', { nullable: true })
    @ApiProperty({
        description: 'Package keywords',
        type: 'array',
        items: { type: 'string' },
        required: false
    })
    @Expose()
    keywords?: string[];

    @Column({
        length: 255,
        nullable: true
    })
    @ApiProperty({
        description: 'Package homepage URL',
        example: 'https://symfony.com/doc/current/components/console.html',
        required: false
    })
    @Expose()
    homepage?: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty({
        description: 'Support information',
        type: 'object',
        additionalProperties: true
    })
    @Expose()
    support?: SupportInfo;

    @Column('jsonb', { nullable: true })
    @ApiProperty({
        description: 'Funding information',
        type: 'array',
        required: false
    })
    @Expose()
    funding?: FundingInfo[];

    // Relationships
    @OneToOne(() => PackageVersion, (packageVersion) => packageVersion.php_metadata)
    @JoinColumn({ name: 'package_version_id' })
    package_version: Relation<PackageVersion>;
}

// Supporting interfaces for PHP-specific metadata
export interface AutoloadConfig {
    'psr-4'?: { [namespace: string]: string | string[] };
    'psr-0'?: { [namespace: string]: string | string[] };
    classmap?: string[];
    files?: string[];
    'exclude-from-classmap'?: string[];
}

export interface Author {
    name: string;
    email?: string;
    homepage?: string;
    role?: string;
}

export interface SupportInfo {
    email?: string;
    issues?: string;
    forum?: string;
    wiki?: string;
    irc?: string;
    source?: string;
    docs?: string;
    rss?: string;
    chat?: string;
}

export interface FundingInfo {
    type: string;
    url: string;
}