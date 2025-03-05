import { Module } from '@nestjs/common';
import { AnalyzersController } from './analyzers.controller';
import { AnalyzersService } from './analyzers.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analyzer } from 'src/base_modules/analyzers/analyzer.entity';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AnalyzersRepository } from './analyzers.repository';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [Analyzer],
            'codeclarity'
        )
    ],
    exports: [AnalyzersService, AnalyzersRepository],
    providers: [AnalyzersService, AnalyzersRepository],
    controllers: [AnalyzersController]
})
export class AnalyzersModule { }
