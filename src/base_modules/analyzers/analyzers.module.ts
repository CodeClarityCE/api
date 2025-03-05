import { Module } from '@nestjs/common';
import { AnalyzersController } from './analyzers.controller';
import { AnalyzersService } from './analyzers.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analyzer } from 'src/entity/codeclarity/Analyzer';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [Analyzer],
            'codeclarity'
        )
    ],
    exports: [AnalyzersService],
    providers: [AnalyzersService],
    controllers: [AnalyzersController]
})
export class AnalyzersModule {}
