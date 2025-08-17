import { Entity, Column, PrimaryGeneratedColumn, OneToMany, Relation, ManyToOne } from 'typeorm';
import { StageBase } from '../analyses/analysis.entity';
import type { Analysis } from '../analyses/analysis.entity';
import type { Organization } from '../organizations/organization.entity';
import type { User } from '../users/users.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

@Entity()
export class Analyzer {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column({
        length: 25
    })
    @ApiProperty()
    @Expose()
    name: string;

    @Column()
    global: boolean;

    @Column('text')
    @ApiProperty()
    @Expose()
    description: string;

    @Column('timestamptz')
    @ApiProperty()
    @Expose()
    created_on: Date;

    @Column('jsonb')
    @ApiProperty()
    @Expose()
    steps: StageBase[][];

    @Column({ 
        type: 'varchar', 
        array: true, 
        default: ['javascript'],
        nullable: false
    })
    @ApiProperty({ 
        description: 'List of programming languages supported by this analyzer',
        example: ['javascript', 'php'],
        type: [String]
    })
    @Expose()
    supported_languages: string[];

    @Column({ 
        type: 'jsonb', 
        nullable: true 
    })
    @ApiProperty({ 
        description: 'Language-specific configuration for analysis plugins',
        example: {
            javascript: { plugins: ['js-sbom', 'vuln-finder'] },
            php: { plugins: ['php-sbom', 'vuln-finder'] }
        },
        required: false
    })
    @Expose()
    language_config?: {
        javascript?: { plugins: string[] };
        php?: { plugins: string[] };
        [key: string]: { plugins: string[] } | undefined;
    };

    @Column({ 
        length: 50,
        default: 'js',
        nullable: false
    })
    @ApiProperty({ 
        description: 'Logo identifier for the analyzer (js, php, multi, etc.)',
        example: 'multi',
        default: 'js'
    })
    @Expose()
    logo: string;

    // Foreign keys
    @OneToMany('Analysis', 'analyzer')
    analyses: Relation<Analysis[]>;

    @ManyToOne('Organization', 'analyzers')
    organization: Relation<Organization>;

    @ManyToOne('User', 'analyzers_created')
    created_by: Relation<User>;
}
