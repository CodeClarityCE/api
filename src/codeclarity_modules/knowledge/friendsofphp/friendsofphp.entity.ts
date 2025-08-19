import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

@Entity('friends_of_php')
export class FriendsOfPhp {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column()
    @Index({ unique: true })
    @ApiProperty()
    @Expose()
    advisory_id: string;

    @Column()
    @ApiProperty()
    @Expose()
    title: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    cve: string;

    @Column()
    @ApiProperty()
    @Expose()
    link: string;

    @Column()
    @ApiProperty()
    @Expose()
    reference: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    composer: string;

    @Column('text', { nullable: true })
    @ApiProperty()
    @Expose()
    description: string;

    @Column('jsonb', { default: {} })
    @ApiProperty()
    @Expose()
    branches: any;

    @Column()
    @ApiProperty()
    @Expose()
    published: string;

    @Column()
    @ApiProperty()
    @Expose()
    modified: string;
}