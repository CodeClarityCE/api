import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';

@Module({
    imports: [
        OrganizationsModule,
        TypeOrmModule.forFeature([Organization], 'codeclarity'),
        KnowledgeModule
    ],
    providers: [DashboardService],
    controllers: [DashboardController]
})
export class DashboardModule {}
