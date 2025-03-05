import { Module } from '@nestjs/common';
import { SBOMController } from './sbom.controller';
import { SBOMService } from './sbom.service';
import { AnalysisResultsService } from '../results.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/entity/codeclarity/Result';
import { Package } from 'src/entity/knowledge/Package';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';

@Module({
    imports: [
        OrganizationsModule,
        AnalysesModule,
        ProjectsModule,
        TypeOrmModule.forFeature(
            [Result],
            'codeclarity'
        ),
        TypeOrmModule.forFeature([Package], 'knowledge')
    ],
    providers: [
        SBOMService,
        AnalysisResultsService,
    ],
    controllers: [SBOMController]
})
export class SbomModule {}
