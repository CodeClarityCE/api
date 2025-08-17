import {
    Controller,
    Get,
    Post,
    Put,
    Param,
    Delete,
    Body,
    Query,
    DefaultValuePipe,
    ParseIntPipe
} from '@nestjs/common';
import { AnalyzersService } from './analyzers.service';
import { AnalyzerTemplatesService, AnalyzerTemplate } from './analyzer-templates.service';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses.types';
import { AnalyzerCreateBody } from 'src/base_modules/analyzers/analyzer.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { Analyzer } from 'src/base_modules/analyzers/analyzer.entity';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth()
@Controller('/org/:org_id/analyzers')
export class AnalyzersController {
    constructor(
        private readonly analyzersService: AnalyzersService,
        private readonly analyzerTemplatesService: AnalyzerTemplatesService
    ) {}

    @Post('')
    async create(
        @Body() analyzer: AnalyzerCreateBody,
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string
    ): Promise<CreatedResponse> {
        return { id: await this.analyzersService.create(org_id, analyzer, user) };
    }

    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number
    ): Promise<TypedPaginatedResponse<Analyzer>> {
        return await this.analyzersService.getMany(
            org_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user
        );
    }

    @Get('name')
    async getByName(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('analyzer_name') analyzer_name: string
    ): Promise<TypedResponse<Analyzer>> {
        return { data: await this.analyzersService.getByName(org_id, analyzer_name, user) };
    }

    @Get(':analyzer_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('analyzer_id') analyzer_id: string,
        @Param('org_id') org_id: string
    ): Promise<TypedResponse<Analyzer>> {
        return { data: await this.analyzersService.get(org_id, analyzer_id, user) };
    }

    @Put(':analyzer_id')
    async update(
        @Body() analyzer: AnalyzerCreateBody,
        @AuthUser() user: AuthenticatedUser,
        @Param('analyzer_id') analyzer_id: string,
        @Param('org_id') org_id: string
    ): Promise<NoDataResponse> {
        await this.analyzersService.update(org_id, analyzer_id, analyzer, user);
        return {};
    }

    @Delete(':analyzer_id')
    async delete(
        @AuthUser() user: AuthenticatedUser,
        @Param('analyzer_id') analyzer_id: string,
        @Param('org_id') org_id: string
    ): Promise<NoDataResponse> {
        await this.analyzersService.delete(org_id, analyzer_id, user);
        return {};
    }
}

// Templates controller (not organization-specific)
@ApiBearerAuth()
@Controller('/analyzer-templates')
export class AnalyzerTemplatesController {
    constructor(private readonly analyzerTemplatesService: AnalyzerTemplatesService) {}

    @Get('')
    async getAllTemplates(): Promise<TypedResponse<AnalyzerTemplate[]>> {
        return { data: this.analyzerTemplatesService.getTemplates() };
    }

    @Get(':language')
    async getTemplateByLanguage(
        @Param('language') language: string
    ): Promise<TypedResponse<AnalyzerTemplate>> {
        return { data: this.analyzerTemplatesService.getTemplateByLanguage(language) };
    }
}
