import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('cwe')
export class CWE {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id!: string;

    @Column()
    @Index({ unique: true })
    @ApiProperty()
    @Expose()
    cwe_id!: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    name!: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    abstraction!: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    structure!: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    status!: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    description!: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    extended_description!: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    likelihood_of_exploit!: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    related_weaknesses!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    modes_of_introduction!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    common_consequences!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    detection_methods!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    potential_mitigations!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    taxonomy_mappings!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    observed_examples!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    alternate_terms!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    affected_resources!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    functional_areas: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    categories!: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    applicable_platforms!: any;
}
