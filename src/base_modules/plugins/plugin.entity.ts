import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

@Entity('plugin')
export class Plugin {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    name: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    version: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    description: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    depends_on: string[];

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    config: { [key: string]: any };
}
