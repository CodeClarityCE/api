import { Injectable } from '@nestjs/common';
import { AnalysisCreateBody } from 'src/base_modules/analyses/analysis.types';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    AnaylzerMissingConfigAttribute,
    RabbitMQError
} from 'src/types/errors/types';
import { ProjectMemberService } from '../projects/projectMember.service';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/paginated/types';
import { TypedPaginatedData } from 'src/types/paginated/types';
import * as amqp from 'amqplib';
import { ConfigService } from '@nestjs/config';
import { MemberRole } from 'src/base_modules/organizations/orgMembership.types';
import { AnalysisStartMessageCreate } from 'src/types/rabbitMqMessages';
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
import { FindingsRepository } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.repository';
import { LicensesRepository } from 'src/codeclarity_modules/results/licenses/licenses.repository';
import { AnalysesRepository } from './analyses.repository';

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
        private readonly findingsRepository: FindingsRepository,
        private readonly licensesRepository: LicensesRepository,
        private readonly analysesRepository: AnalysesRepository,
    ) { }

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
        const project = await this.projectsRepository.getProjectById(projectId);

        // Get the user details of the creator of the analysis
        const creator = await this.usersRepository.getUserById(user.userId);

        // Retrieve organization details based on the organization ID
        const organization = await this.organizationsRepository.getOrganizationById(orgId);

        // Initialize an object to hold the configuration structure for the analyzer steps
        const config_structure: { [key: string]: any } = {};

        // Initialize an object to hold the final configuration provided by the user
        const config: { [key: string]: any } = {};

        // Array to store stages of the analysis process
        const stages: AnalysisStage[][] = [];

        // Iterate through each stage defined in the analyzer
        for (const stage of analyzer.steps) {
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
        for (const [pluginName, _] of Object.entries(analysisData.config)) {
            for (const [key, value] of Object.entries(_)) {
                if (!config[pluginName]) config[pluginName] = {};
                config[pluginName][key] = value;
            }
        }

        // Validate the configuration provided by the user against the required attributes
        for (const [pluginName, plugin_config] of Object.entries(config_structure)) {
            for (const [key] of Object.entries(plugin_config)) {
                const config_element = config_structure[pluginName][key];
                if (config_element.required && !config[pluginName][key]) {
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

        // Save the newly created analysis to the database
        const created_analysis = await this.analysesRepository.saveAnalysis(analysis);

        // Prepare to send a message to RabbitMQ to start the analysis process
        const queue = this.configService.getOrThrow<string>('AMQP_ANALYSES_QUEUE');
        const amqpHost = `${this.configService.getOrThrow<string>(
            'AMQP_PROTOCOL'
        )}://${this.configService.getOrThrow<string>('AMQP_USER')}:${process.env.AMQP_PASSWORD
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
                organization_id: orgId
            };

            // Send the message to RabbitMQ queue
            ch1.sendToQueue(queue, Buffer.from(JSON.stringify(message)));

            // Close the channel after sending the message
            await ch1.close();
        } catch (err) {
            // Throw an error if there is a problem with connecting or messaging via RabbitMQ
            throw new RabbitMQError(err);
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

        const analysis = await this.analysesRepository.getAnalysisById(id)

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
        const vulnOutput: VulnsOuptut = await this.findingsRepository.getVulnsResult(id);

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
        await this.projectMemberService.doesProjectBelongToOrg(
            projectId,
            organizationId
        );

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

        return this.analysesRepository.getAnalysisByProjectId(projectId, currentPage, entriesPerPage);
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
}
