import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";

import { Analyzer } from "src/base_modules/analyzers/analyzer.entity";
import { AnalyzerCreateBody } from "src/base_modules/analyzers/analyzer.types";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import {
  CreatedResponse,
  NoDataResponse,
  TypedPaginatedResponse,
  TypedResponse,
} from "src/types/apiResponses.types";

import {
  AnalyzerTemplate,
  AnalyzerTemplatesService,
} from "./analyzer-templates.service";
import { AnalyzersService } from "./analyzers.service";

@ApiBearerAuth()
@Controller("/org/:org_id/analyzers")
export class AnalyzersController {
  constructor(private readonly analyzersService: AnalyzersService) {}

  @Post("")
  async create(
    @Body() analyzer: AnalyzerCreateBody,
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
  ): Promise<CreatedResponse> {
    return { id: await this.analyzersService.create(org_id, analyzer, user) };
  }

  @Get("")
  async getMany(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Query("page", new DefaultValuePipe(0), ParseIntPipe) page?: number,
    @Query("entries_per_page", new DefaultValuePipe(0), ParseIntPipe)
    entries_per_page?: number,
  ): Promise<TypedPaginatedResponse<Analyzer>> {
    return await this.analyzersService.getMany(
      org_id,
      { currentPage: page, entriesPerPage: entries_per_page },
      user,
    );
  }

  @Get("name")
  async getByName(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Query("analyzer_name") analyzer_name: string,
  ): Promise<TypedResponse<Analyzer>> {
    return {
      data: await this.analyzersService.getByName(org_id, analyzer_name, user),
    };
  }

  @Get(":analyzer_id")
  async get(
    @AuthUser() user: AuthenticatedUser,
    @Param("analyzer_id") analyzer_id: string,
    @Param("org_id") org_id: string,
  ): Promise<TypedResponse<Analyzer>> {
    return { data: await this.analyzersService.get(org_id, analyzer_id, user) };
  }

  @Put(":analyzer_id")
  async update(
    @Body() analyzer: AnalyzerCreateBody,
    @AuthUser() user: AuthenticatedUser,
    @Param("analyzer_id") analyzer_id: string,
    @Param("org_id") org_id: string,
  ): Promise<NoDataResponse> {
    await this.analyzersService.update(org_id, analyzer_id, analyzer, user);
    return {};
  }

  @Delete(":analyzer_id")
  async delete(
    @AuthUser() user: AuthenticatedUser,
    @Param("analyzer_id") analyzer_id: string,
    @Param("org_id") org_id: string,
  ): Promise<NoDataResponse> {
    await this.analyzersService.delete(org_id, analyzer_id, user);
    return {};
  }
}

// Templates controller (not organization-specific)
@ApiBearerAuth()
@Controller("/analyzer-templates")
export class AnalyzerTemplatesController {
  constructor(
    private readonly __analyzerTemplatesService: AnalyzerTemplatesService,
  ) {}

  @Get("")
  async getAllTemplates(): Promise<TypedResponse<AnalyzerTemplate[]>> {
    return { data: this.__analyzerTemplatesService.getTemplates() };
  }

  @Get(":language")
  async getTemplateByLanguage(
    @Param("language") language: string,
  ): Promise<TypedResponse<AnalyzerTemplate>> {
    return {
      data: this.__analyzerTemplatesService.getTemplateByLanguage(language),
    };
  }
}

// Languages controller (not organization-specific)
@ApiBearerAuth()
@Controller("/languages")
export class LanguagesController {
  constructor(
    private readonly __analyzerTemplatesService: AnalyzerTemplatesService,
  ) {}

  @Get("")
  async getSupportedLanguages(): Promise<TypedResponse<string[]>> {
    // Extract unique languages from all templates
    const templates = this.__analyzerTemplatesService.getTemplates();
    const languages = new Set<string>();

    for (const template of templates) {
      for (const lang of template.supported_languages) {
        languages.add(lang);
      }
    }

    return { data: Array.from(languages).sort() };
  }
}
