import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Relation,
    OneToMany,
    Index,
    JoinColumn
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

@Entity('package')
@Index(['name', 'language'], { unique: true })
export class Package {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id!: string;

    @Column({
        length: 255
    })
    @ApiProperty()
    @Expose()
    name!: string;

    @Column({
        length: 50,
        default: 'javascript',
        nullable: true
    })
    @Index()
    @ApiProperty({
        description: 'Programming language ecosystem (javascript, php, python, etc.)',
        example: 'javascript'
    })
    @Expose()
    language?: string;

    @Column({
        length: 255,
        nullable: true
    })
    @ApiProperty()
    @Expose()
    description!: string;

    @Column({
        length: 255,
        nullable: true
    })
    @ApiProperty()
    @Expose()
    homepage!: string;

    @Column({
        length: 255
    })
    @ApiProperty()
    @Expose()
    latest_version!: string;

    @Column('timestamptz', {
        nullable: true
    })
    @ApiProperty()
    @Expose()
    time!: Date;

    @Column('simple-array', {
        nullable: true
    })
    @ApiProperty()
    @Expose()
    keywords!: string[];

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    source!: Source;

    @Column({
        length: 50,
        nullable: true
    })
    @ApiProperty()
    @Expose()
    license!: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    licenses!: LicenseNpm[];

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    extra!: { [key: string]: any };

    @OneToMany(() => Version, (version) => version.package)
    versions!: Relation<Version[]>;
}

@Entity('version')
export class Version {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id!: string;

    @Column({
        length: 255
    })
    @Index()
    @ApiProperty()
    @Expose()
    version!: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    dependencies!: { [key: string]: string };

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    dev_dependencies!: { [key: string]: string };

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    extra!: { [key: string]: any };

    @ManyToOne(() => Package, (pack) => pack.versions)
    @JoinColumn({ name: 'package_id' })
    package!: Relation<Package>;
}

export interface Source {
    type: string;
    url: string;
}

export interface LicenseNpm {
    type: string;
    url: string;
}
