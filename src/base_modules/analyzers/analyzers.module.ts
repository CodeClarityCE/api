import { forwardRef, Module } from '@nestjs/common';
import { AnalyzersController, AnalyzerTemplatesController, LanguagesController } from './analyzers.controller';
import { AnalyzersService } from './analyzers.service';
import { AnalyzerTemplatesService } from './analyzer-templates.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analyzer } from 'src/base_modules/analyzers/analyzer.entity';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AnalyzersRepository } from './analyzers.repository';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        OrganizationsModule,
        TypeOrmModule.forFeature([Analyzer], 'codeclarity')
    ],
    exports: [AnalyzersService, AnalyzersRepository, AnalyzerTemplatesService],
    providers: [AnalyzersService, AnalyzersRepository, AnalyzerTemplatesService],
    controllers: [AnalyzersController, AnalyzerTemplatesController, LanguagesController]
})
export class AnalyzersModule {}
