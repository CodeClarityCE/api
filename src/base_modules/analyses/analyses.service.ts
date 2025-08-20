import { Injectable } from '@nestjs/common';
import { AnalysisCreateBody } from 'src/base_modules/analyses/analysis.types';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { RabbitMQError } from 'src/types/error.types';
import { ProjectMemberService } from '../projects/projectMember.service';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/pagination.types';
import { TypedPaginatedData } from 'src/types/pagination.types';
import * as amqp from 'amqplib';
import { ConfigService } from '@nestjs/config';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { AnalysisStartMessageCreate } from 'src/types/rabbitMqMessages.types';
import { Output as VulnsOuptut } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import { Output as SbomOutput } from 'src/codeclarity_modules/results/sbom/sbom.types';
import { Output as LicensesOutput } from 'src/codeclarity_modules/results/licenses/licenses.types';
import { Analysis, AnalysisStage, AnalysisStatus } from 'src/base_modules/analyses/analysis.entity';
import { UsersRepository } from '../users/users.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { AnalyzersRepository } from '../analyzers/analyzers.repository';
import { AnalysisResultsRepository } from 'src/codeclarity_modules/results/results.repository';
import { SBOMRepository } from 'src/codeclarity_modules/results/sbom/sbom.repository';
import { VulnerabilitiesRepository } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.repository';
import { LicensesRepository } from 'src/codeclarity_modules/results/licenses/licenses.repository';
import { AnalysesRepository } from './analyses.repository';
import { AnaylzerMissingConfigAttribute } from '../analyzers/analyzers.errors';
import { LanguageDetectionService } from './language-detection.service';

@Injectable()
export class AnalysesService {
    constructor(
        private readonly projectMemberService: ProjectMemberService,
        private readonly configService: ConfigService,
        private readonly usersRepository: UsersRepository,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly projectsRepository: ProjectsRepository,
        private readonly analyzersRepository: AnalyzersRepository,
        private readonly resultsRepository: AnalysisResultsRepository,
        private readonly sbomRepository: SBOMRepository,
        private readonly vulnerabilitiesRepository: VulnerabilitiesRepository,
        private readonly licensesRepository: LicensesRepository,
        private readonly analysesRepository: AnalysesRepository,
        private readonly languageDetectionService: LanguageDetectionService
    ) {}

    /**
     * Create/start an analysis
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @throws {AnalyzerDoesNotExist} In case the referenced analyzer does not exist on the org
     * @throws {AnaylzerMissingConfigAttribute} In case config options required by the anylzer were not provided
     * @param orgId The id of the organization to which the project belongs
     * @param projectId The id of the project on which the analysis should be performed
     * @param analysisData The analysis create body supplied by the user
     * @param user The authenticated user
     * @returns The ID of the created analysis
     */
    async create(
        orgId: string,
        projectId: string,
        analysisData: AnalysisCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        // Check if the user has the required role to perform actions on the organization
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // Verify that the project belongs to the specified organization
        await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);

        // Retrieve the analyzer details based on the provided analyzer ID
        const analyzer = await this.analyzersRepository.getAnalyzerById(analysisData.analyzer_id);

        // Fetch the project details using the project ID
        const project = await this.projectsRepository.getProjectById(projectId, {
            integration: true
        });

        // Get the user details of the creator of the analysis
        const creator = await this.usersRepository.getUserById(user.userId);

        // Retrieve organization details based on the organization ID
        const organization = await this.organizationsRepository.getOrganizationById(orgId);

        // Language detection is now handled by the downloader service after repository cloning
        // The downloader scans actual files and passes language info to the dispatcher
        // For now, we'll use the analyzer's supported languages and let the dispatcher filter based on detected languages
        const languagesToAnalyze = analyzer.supported_languages;
        
        console.log(`Using analyzer ${analyzer.name} with supported languages: ${languagesToAnalyze.join(', ')}`);
        
        // If specific languages were provided in the analysis request, use those instead
        if (analysisData.languages && analysisData.languages.length > 0) {
            console.log(`Analysis requested specific languages: ${analysisData.languages.join(', ')}`);
            // Filter to only supported languages
            const supportedRequestedLanguages = analysisData.languages.filter(lang => 
                analyzer.supported_languages.includes(lang)
            );
            if (supportedRequestedLanguages.length > 0) {
                languagesToAnalyze.splice(0, languagesToAnalyze.length, ...supportedRequestedLanguages);
            }
        }

        // Initialize an object to hold the configuration structure for the analyzer steps
        const config_structure: { [key: string]: any } = {};

        // Initialize an object to hold the final configuration provided by the user
        const config: { [key: string]: any } = {};

        // Array to store stages of the analysis process
        const stages: AnalysisStage[][] = [];

        // Filter analyzer steps based on detected languages and language configuration
        const applicableSteps = this.filterStepsByLanguage(analyzer.steps, languagesToAnalyze, analyzer.language_config);

        // Iterate through each stage defined in the analyzer
        for (const stage of applicableSteps) {
            // Initialize an array to hold steps within a stage
            const steps: AnalysisStage[] = [];

            // Iterate through each step within the current stage
            for (const step of stage) {
                // Define the initial state of each step with default values
                steps.push({
                    name: step.name,
                    version: step.version,
                    status: AnalysisStatus.REQUESTED,
                    result: undefined,
                    config: {}
                });

                // If the step requires configuration, add it to the config_structure object
                if (step.config) {
                    for (const [key, value] of Object.entries(step.config)) {
                        if (!config_structure[step.name]) config_structure[step.name] = {};
                        config_structure[step.name][key] = value;
                    }
                }
            }

            // Add the steps array to the stages array
            stages.push(steps);
        }

        // Merge user-provided configuration with default or existing configuration
        for (const [pluginName, pluginConfig] of Object.entries(analysisData.config)) {
            for (const [key, value] of Object.entries(pluginConfig)) {
                if (!config[pluginName]) config[pluginName] = {};
                config[pluginName][key] = value;
            }
        }

        // Validate the configuration provided by the user against the required attributes
        for (const [pluginName, plugin_config] of Object.entries(config_structure)) {
            for (const [key] of Object.entries(plugin_config)) {
                const config_element = config_structure[pluginName][key];
                if (config_element.required && (!config[pluginName] || !config[pluginName][key])) {
                    throw new AnaylzerMissingConfigAttribute();
                }
            }
        }

        // Create a new analysis object with the provided and default values
        const analysis = new Analysis();
        analysis.status = AnalysisStatus.REQUESTED;
        analysis.stage = 0;
        analysis.config = analysisData.config;
        analysis.steps = stages;
        analysis.tag = analysisData.tag;
        analysis.branch = analysisData.branch;
        analysis.commit_hash = analysisData.commit_hash;
        analysis.created_on = new Date();
        analysis.created_by = creator;
        analysis.analyzer = analyzer;
        analysis.project = project;
        analysis.organization = organization;
        analysis.integration = project.integration;

        // ===== CONFIGURE SCHEDULING =====
        // Set scheduling fields using simplified approach for better maintainability

        // Default to 'once' (immediate execution) if no schedule type specified
        analysis.schedule_type = analysisData.schedule_type || 'once';

        // Set active status - defaults to true for all analyses
        analysis.is_active = analysisData.is_active !== undefined ? analysisData.is_active : true;

        // Configure when the analysis should next run
        // For 'once': this field is ignored, analysis runs immediately
        // For 'daily'/'weekly': this sets the first/next execution time
        if (analysisData.next_scheduled_run) {
            analysis.next_scheduled_run = new Date(analysisData.next_scheduled_run);
        }

        // Save the newly created analysis to the database
        const created_analysis = await this.analysesRepository.saveAnalysis(analysis);

        // Only send message immediately for 'once' type analyses
        // Scheduled analyses (daily/weekly) will be triggered by the scheduler at the appropriate time
        if (analysis.schedule_type === 'once') {
            const queue = this.configService.getOrThrow<string>('AMQP_ANALYSES_QUEUE');
            const amqpHost = `${this.configService.getOrThrow<string>(
                'AMQP_PROTOCOL'
            )}://${this.configService.getOrThrow<string>('AMQP_USER')}:${
                process.env.AMQP_PASSWORD
            }@${this.configService.getOrThrow<string>(
                'AMQP_HOST'
            )}:${this.configService.getOrThrow<string>('AMQP_PORT')}`;

            try {
                // Connect to RabbitMQ using the configured settings
                const conn = await amqp.connect(amqpHost);
                const ch1 = await conn.createChannel();
                await ch1.assertQueue(queue);

                // Determine the integration ID if the project has an associated integration
                let integration_id = null;
                if (project.integration) {
                    integration_id = project.integration.id;
                }

                // Create the message payload to start the analysis process
                const message: AnalysisStartMessageCreate = {
                    analysis_id: created_analysis.id,
                    integration_id: integration_id,
                    organization_id: orgId,
                    project_id: projectId
                };

                // Send the message to RabbitMQ queue
                ch1.sendToQueue(queue, Buffer.from(JSON.stringify(message)));

                // Close the channel after sending the message
                await ch1.close();
            } catch (err) {
                // Throw an error if there is a problem with connecting or messaging via RabbitMQ
                throw new RabbitMQError(err);
            }
        }

        // Return the ID of the created analysis as a confirmation
        return created_analysis.id;
    }

    /**
     * Retrieve a specific analysis by its ID.
     *
     * This function performs several checks to ensure that the user is authorized to access the requested analysis:
     * 1. Checks if the user has the required role within the specified organization.
     * 2. Verifies that the project belongs to the specified organization.
     * 3. Confirms that the analysis belongs to the specified project.
     *
     * If any of these checks fail, appropriate exceptions are thrown.
     *
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @throws {EntityNotFound} In case the project does not exist or the analysis does not belong to the project
     * @param orgId The ID of the organization to which the project and analysis belong.
     * @param projectId The ID of the project associated with the analysis.
     * @param id The ID of the analysis to retrieve.
     * @param user The authenticated user making the request.
     * @returns The requested Analysis object.
     */
    async get(
        orgId: string,
        projectId: string,
        id: string,
        user: AuthenticatedUser
    ): Promise<Analysis> {
        // (1) Check if user has access to org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);

        // (3) Check if the analysis belongs to the project
        await this.analysesRepository.doesAnalysesBelongToProject(id, projectId);

        const analysis = await this.analysesRepository.getAnalysisById(id);

        return analysis;
    }

    /**
     * Retrieve chart data for a specific analysis.
     *
     * This function performs several checks to ensure that the user is authorized to access the requested analysis:
     * 1. Checks if the user has the required role within the specified organization.
     * 2. Verifies that the project belongs to the specified organization.
     * 3. Confirms that the analysis belongs to the specified project.
     *
     * If any of these checks fail, appropriate exceptions are thrown.
     *
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @throws {EntityNotFound} In case the project does not exist or the analysis does not belong to the project
     * @param orgId The ID of the organization to which the project and analysis belong.
     * @param projectId The ID of the project associated with the analysis.
     * @param id The ID of the analysis for which to retrieve chart data.
     * @param user The authenticated user making the request.
     * @returns An array of objects representing the chart data.
     */
    async getChart(
        orgId: string,
        projectId: string,
        id: string,
        user: AuthenticatedUser
    ): Promise<Array<object>> {
        // (1) Check if user has access to org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);

        // (3) Check if the analysis belongs to the project
        await this.analysesRepository.doesAnalysesBelongToProject(id, projectId);

        // Fetch SBOM output for the specified analysis ID
        const sbomOutput: SbomOutput = await this.sbomRepository.getSbomResult(id);

        // Fetch vulnerabilities output for the specified analysis ID
        const vulnOutput: VulnsOuptut = await this.vulnerabilitiesRepository.getVulnsResult(id);

        // Fetch licenses output for the specified analysis ID
        const licensesOutput: LicensesOutput = await this.licensesRepository.getLicensesResult(id);

        // Construct and return the chart data array
        return [
            {
                x: 'Latest',
                y: 'Vulnerabilities',
                v: vulnOutput.workspaces[vulnOutput.analysis_info.default_workspace_name]
                    .Vulnerabilities.length
            },
            {
                x: 'Latest',
                y: 'Dependencies',
                v: Object.keys(
                    sbomOutput.workspaces[vulnOutput.analysis_info.default_workspace_name]
                        .dependencies
                ).length
            },
            {
                x: 'Latest',
                y: 'SPDX Licenses',
                v: licensesOutput.analysis_info.stats.number_of_spdx_licenses
            },
            {
                x: 'Latest',
                y: 'Non-SPDX Licenses',
                v: licensesOutput.analysis_info.stats.number_of_non_spdx_licenses
            },
            {
                x: 'Latest',
                y: 'Permissive Licenses',
                v: licensesOutput.analysis_info.stats.number_of_permissive_licenses
            },
            {
                x: 'Latest',
                y: 'Copy Left Licenses',
                v: licensesOutput.analysis_info.stats.number_of_copy_left_licenses
            }
        ];
    }

    /**
     * Retrieve multiple analyses for a project with pagination.
     *
     * This function performs several checks to ensure that the user is authorized to access the requested analyses:
     * 1. Checks if the user has the required role within the specified organization.
     * 2. Verifies that the project belongs to the specified organization.
     *
     * If any of these checks fail, appropriate exceptions are thrown.
     *
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @param organizationId The ID of the organization to which the project and analyses belong.
     * @param projectId The ID of the project associated with the analyses.
     * @param paginationUserSuppliedConf Pagination configuration provided by the user, including entries per page and current page.
     * @param user The authenticated user making the request.
     * @returns A paginated list of Analysis objects.
     */
    async getMany(
        organizationId: string,
        projectId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser
    ): Promise<TypedPaginatedData<Analysis>> {
        // (1) Check if the user is allowed to create an analyzer (is at least a user)
        await this.organizationsRepository.hasRequiredRole(
            organizationId,
            user.userId,
            MemberRole.USER
        );

        // (2) Check if the project belongs to the org
        await this.projectMemberService.doesProjectBelongToOrg(projectId, organizationId);

        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 10
        };

        let entriesPerPage = paginationConfig.defaultEntriesPerPage;
        let currentPage = 0;

        if (paginationUserSuppliedConf.entriesPerPage)
            entriesPerPage = Math.min(
                paginationConfig.maxEntriesPerPage,
                paginationUserSuppliedConf.entriesPerPage
            );

        if (paginationUserSuppliedConf.currentPage)
            currentPage = Math.max(0, paginationUserSuppliedConf.currentPage);

        return this.analysesRepository.getAnalysisByProjectId(
            projectId,
            currentPage,
            entriesPerPage
        );
    }

    /**
     * Delete a specific analysis by its ID.
     *
     * This function performs several checks to ensure that the user is authorized to delete the requested analysis:
     * 1. Checks if the user has the required role within the specified organization.
     * 2. Verifies that the project belongs to the specified organization.
     * 3. Confirms that the analysis belongs to the specified project.
     *
     * If any of these checks fail, appropriate exceptions are thrown.
     *
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @throws {EntityNotFound} In case the project does not exist or the analysis does not belong to the project
     * @param orgId The ID of the organization to which the project and analysis belong.
     * @param projectId The ID of the project associated with the analysis.
     * @param id The ID of the analysis to delete.
     * @param user The authenticated user making the request.
     */
    async delete(
        orgId: string,
        projectId: string,
        id: string,
        user: AuthenticatedUser
    ): Promise<void> {
        // (1) Check if user has access to org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);

        // (3) Check if the analysis belongs to the project
        await this.analysesRepository.doesAnalysesBelongToProject(id, projectId);

        const analysis = await this.analysesRepository.getAnalysisById(id, { results: true });

        for (const result of analysis.results) {
            await this.resultsRepository.delete(result.id);
        }
        await this.analysesRepository.deleteAnalysis(analysis.id);
    }

    /**
     * Retrieve all active scheduled analyses for a project
     *
     * This method returns analyses that have recurring schedules (daily/weekly) and are currently active.
     * Used by the frontend to display scheduled analyses to users.
     *
     * @param orgId - Organization ID that owns the project
     * @param projectId - Project ID to get scheduled analyses for
     * @param user - Authenticated user making the request
     * @returns Promise resolving to array of scheduled Analysis objects
     * @throws NotAuthorized if user lacks access to organization
     * @throws NotAuthorized if project doesn't belong to organization
     */
    async getScheduledAnalyses(
        orgId: string,
        projectId: string,
        user: AuthenticatedUser
    ): Promise<Analysis[]> {
        // Verify user has access to the organization
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // Verify project belongs to the organization
        await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);

        // Return only active scheduled analyses (daily/weekly)
        return this.analysesRepository.getScheduledAnalysesByProjectId(projectId);
    }

    /**
     * Update scheduling configuration for an existing analysis
     *
     * Allows modifying the schedule type, next execution time, and active status.
     * Changes take effect immediately for future scheduled runs.
     *
     * @param orgId - Organization ID that owns the project
     * @param projectId - Project ID containing the analysis
     * @param analysisId - Analysis ID to update
     * @param scheduleData - New scheduling configuration
     * @param scheduleData.schedule_type - New frequency: 'once', 'daily', or 'weekly'
     * @param scheduleData.next_scheduled_run - When to next execute (ISO 8601 string)
     * @param scheduleData.is_active - Whether scheduling is enabled
     * @param user - Authenticated user making the request
     * @throws NotAuthorized if user lacks access
     * @throws EntityNotFound if analysis doesn't exist
     */
    async updateSchedule(
        orgId: string,
        projectId: string,
        analysisId: string,
        scheduleData: { schedule_type: string; next_scheduled_run: string; is_active: boolean },
        user: AuthenticatedUser
    ): Promise<void> {
        // Verify permissions
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);
        await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);
        await this.analysesRepository.doesAnalysesBelongToProject(analysisId, projectId);

        // Get the analysis and update scheduling fields
        const analysis = await this.analysesRepository.getAnalysisById(analysisId);

        analysis.schedule_type = scheduleData.schedule_type as any;
        analysis.next_scheduled_run = new Date(scheduleData.next_scheduled_run);
        analysis.is_active = scheduleData.is_active;

        // Save the updated configuration
        await this.analysesRepository.saveAnalysis(analysis);
    }

    /**
     * Cancel/disable a scheduled analysis
     *
     * Sets the analysis to inactive, preventing future scheduled executions.
     * The analysis record remains but won't be executed by the scheduler.
     *
     * @param orgId - Organization ID that owns the project
     * @param projectId - Project ID containing the analysis
     * @param analysisId - Analysis ID to cancel
     * @param user - Authenticated user making the request
     * @throws NotAuthorized if user lacks access
     * @throws EntityNotFound if analysis doesn't exist
     */
    async cancelSchedule(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ): Promise<void> {
        // Verify permissions
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);
        await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);
        await this.analysesRepository.doesAnalysesBelongToProject(analysisId, projectId);

        // Disable the scheduled analysis
        const analysis = await this.analysesRepository.getAnalysisById(analysisId);
        analysis.is_active = false;

        await this.analysesRepository.saveAnalysis(analysis);
    }

    /**
     * Create a new analysis record for scheduled execution
     *
     * This duplicates the configuration of an existing scheduled analysis to create a new execution.
     * Each scheduled run gets its own Analysis record, preserving historical results.
     *
     * @param originalAnalysisId - ID of the original scheduled analysis to duplicate
     * @returns Promise resolving to the ID of the new analysis record
     * @internal This method is intended for use by the scheduler service only
     */
    async createScheduledExecution(originalAnalysisId: string): Promise<string> {
        // Get the original analysis with all relationships
        const originalAnalysis = await this.analysesRepository.getAnalysisById(originalAnalysisId, {
            analyzer: true,
            project: { integration: true },
            organization: true,
            created_by: true
        });

        // Create a new analysis with the same configuration
        const newAnalysis = new Analysis();
        newAnalysis.status = AnalysisStatus.REQUESTED;
        newAnalysis.stage = 0;
        newAnalysis.config = originalAnalysis.config;
        newAnalysis.steps = originalAnalysis.steps;
        newAnalysis.tag = originalAnalysis.tag;
        newAnalysis.branch = originalAnalysis.branch;
        newAnalysis.commit_hash = originalAnalysis.commit_hash;
        newAnalysis.created_on = new Date();

        // Copy relationships
        newAnalysis.created_by = originalAnalysis.created_by;
        newAnalysis.analyzer = originalAnalysis.analyzer;
        newAnalysis.project = originalAnalysis.project;
        newAnalysis.organization = originalAnalysis.organization;
        newAnalysis.integration = originalAnalysis.integration;

        // Set scheduling fields to indicate this is a scheduled execution
        newAnalysis.schedule_type = 'once'; // This execution is a one-time run
        newAnalysis.is_active = true;
        newAnalysis.next_scheduled_run = undefined; // Not applicable for execution records
        newAnalysis.last_scheduled_run = undefined; // Will be set by scheduler

        // Save the new analysis
        const savedAnalysis = await this.analysesRepository.saveAnalysis(newAnalysis);

        return savedAnalysis.id;
    }

    /**
     * Get execution history for a specific analysis
     *
     * Returns a summary of when the analysis was executed and what results were generated.
     * Results are grouped by day to provide a clear timeline of analysis executions.
     *
     * @param orgId - Organization ID that owns the project
     * @param projectId - Project ID containing the analysis
     * @param analysisId - Analysis ID to get execution history for
     * @param user - Authenticated user making the request
     * @returns Promise resolving to array of run summary objects
     * @returns run.run_date - Date when the analysis was executed
     * @returns run.result_count - Number of results generated in this run
     * @returns run.plugins - Array of plugin names that executed
     * @returns run.plugin_count - Number of unique plugins that executed
     * @throws NotAuthorized if user lacks access
     * @throws EntityNotFound if analysis doesn't exist
     */
    async getAnalysisRuns(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ): Promise<any[]> {
        // Verify permissions
        await this.projectsRepository.doesProjectBelongToOrg(projectId, orgId);
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);
        await this.analysesRepository.doesAnalysesBelongToProject(analysisId, projectId);

        // Get all results generated by this analysis
        const results = await this.resultsRepository.getAllByAnalysisId(analysisId);

        // Group results by day to show execution timeline
        const runs = this.groupResultsByDay(results);

        return runs;
    }

    /**
     * Filter analyzer steps based on detected languages and language configuration
     * This ensures only relevant plugins are executed for each language
     */
    private filterStepsByLanguage(
        analyzerSteps: any[][],
        detectedLanguages: string[],
        languageConfig?: { [key: string]: { plugins: string[] } | undefined }
    ): any[][] {
        if (!languageConfig) {
            // If no language configuration, return all steps for backward compatibility
            return analyzerSteps;
        }

        // Get all plugins that should run for the detected languages
        const applicablePlugins = new Set<string>();
        
        for (const language of detectedLanguages) {
            const langConfig = languageConfig[language];
            if (langConfig) {
                langConfig.plugins.forEach(plugin => 
                    applicablePlugins.add(plugin)
                );
            }
        }

        // If no applicable plugins found, fallback to JavaScript plugins
        if (applicablePlugins.size === 0) {
            const jsConfig = languageConfig.javascript;
            if (jsConfig) {
                jsConfig.plugins.forEach(plugin => 
                    applicablePlugins.add(plugin)
                );
            }
        }

        // Filter steps to only include applicable plugins
        const filteredSteps: any[][] = [];
        
        for (const stage of analyzerSteps) {
            const filteredStage = stage.filter(step => 
                applicablePlugins.has(step.name)
            );
            
            if (filteredStage.length > 0) {
                filteredSteps.push(filteredStage);
            }
        }

        return filteredSteps.length > 0 ? filteredSteps : analyzerSteps;
    }

    /**
     * Group analysis results by the day they were created
     *
     * This provides a simplified view of when analyses were executed.
     * Results created on the same day are grouped together to represent a single "run".
     *
     * @param results - Array of result objects from the database
     * @returns Array of run summary objects, sorted by date (newest first)
     * @private
     */
    private groupResultsByDay(results: any[]): any[] {
        if (!results || results.length === 0) return [];

        // Group results by the day they were created
        const grouped = results.reduce(
            (acc, result) => {
                // Use creation date or fallback to plugin name as key
                const day = new Date(result.created_on || result.plugin).toDateString();
                if (!acc[day]) {
                    acc[day] = [];
                }
                acc[day].push(result);
                return acc;
            },
            {} as Record<string, any[]>
        );

        // Convert grouped data to frontend-expected format
        return Object.entries(grouped)
            .map(([_day, dayResults]) => ({
                run_date: (dayResults as any[])[0].created_on || new Date(),
                result_count: (dayResults as any[]).length,
                plugins: [...new Set((dayResults as any[]).map((r) => r.plugin))], // Unique plugin names
                plugin_count: [...new Set((dayResults as any[]).map((r) => r.plugin))].length
            }))
            .sort((a, b) => new Date(b.run_date).getTime() - new Date(a.run_date).getTime()); // Newest first
    }
}
