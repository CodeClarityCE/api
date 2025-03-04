import { Injectable } from '@nestjs/common';
import { AnalysisCreateBody } from 'src/types/entities/frontend/Analysis';
import { AuthenticatedUser } from 'src/types/auth/types';
import {
    AnalyzerDoesNotExist,
    AnaylzerMissingConfigAttribute,
    EntityNotFound,
    NotAuthorized,
    RabbitMQError
} from 'src/types/errors/types';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { ProjectMemberService } from '../projects/projectMember.service';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/paginated/types';
import { TypedPaginatedData } from 'src/types/paginated/types';
import { AnalysesMemberService } from './analysesMembership.service';
import * as amqp from 'amqplib';
import { ConfigService } from '@nestjs/config';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';
import { AnalysisStartMessageCreate } from 'src/types/rabbitMqMessages';
import { getSbomResult } from '../../codeclarity_modules/results/sbom/utils/utils';
import { getVulnsResult } from '../../codeclarity_modules/results/vulnerabilities/utils/utils';
import { getLicensesResult } from '../../codeclarity_modules/results/licenses/utils/utils';
import { Output as VulnsOuptut } from 'src/types/entities/services/Vulnerabilities';
import { Output as SbomOutput } from 'src/types/entities/services/Sbom';
import { Output as LicensesOutput } from 'src/types/entities/services/Licenses';
import { Analyzer } from 'src/entity/codeclarity/Analyzer';
import { Analysis, AnalysisStage, AnalysisStatus } from 'src/entity/codeclarity/Analysis';
import { Project } from 'src/entity/codeclarity/Project';
import { User } from 'src/entity/codeclarity/User';
import { Organization } from 'src/entity/codeclarity/Organization';
import { Result } from 'src/entity/codeclarity/Result';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class AnalysesService {
    constructor(
        private readonly organizationMemberService: OrganizationsMemberService,
        private readonly projectMemberService: ProjectMemberService,
        private readonly analysesMemberService: AnalysesMemberService,
        private readonly configService: ConfigService,
        @InjectRepository(Project, 'codeclarity')
        private projectRepository: Repository<Project>,
        @InjectRepository(Analyzer, 'codeclarity')
        private analyzerRepository: Repository<Analyzer>,
        @InjectRepository(User, 'codeclarity')
        private userRepository: Repository<User>,
        @InjectRepository(Analysis, 'codeclarity')
        private analysisRepository: Repository<Analysis>,
        @InjectRepository(Organization, 'codeclarity')
        private organizationRepository: Repository<Organization>,
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    /**
     * Create/start an analysis
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @throws {AnalyzerDoesNotExist} In case the referenced analyzer does not exist on the org
     * @throws {AnaylzerMissingConfigAttribute} In case config options required by the anylzer were not provided
     * @param orgId The id of the organizaiton to which the project belongs
     * @param projectId The id of the project on which the analysis should be performed
     * @param analysisData The analysis create body supplied by the user
     * @param user The authenticated user
     * @returns
     */
    async create(
        orgId: string,
        projectId: string,
        analysisData: AnalysisCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        // (1) Check if user has access to org
        await this.organizationMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        const belongs = await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        const analyzer = await this.analyzerRepository.findOneBy({
            id: analysisData.analyzer_id
        });

        if (!analyzer) {
            throw new AnalyzerDoesNotExist();
        }

        const project = await this.projectRepository.findOne({
            relations: {
                integration: true
            },
            where: { id: projectId }
        });
        if (!project) {
            throw new EntityNotFound();
        }

        const creator = await this.userRepository.findOne({
            where: { id: user.userId }
        });
        if (!creator) {
            throw new EntityNotFound();
        }

        const organization = await this.organizationRepository.findOne({
            where: { id: orgId }
        });
        if (!organization) {
            throw new EntityNotFound();
        }

        const config_structure: { [key: string]: any } = {};
        const config: { [key: string]: any } = {};
        const stages: AnalysisStage[][] = [];
        for (const stage of analyzer.steps) {
            const steps: AnalysisStage[] = [];
            for (const step of stage) {
                steps.push({
                    name: step.name,
                    version: step.version,
                    status: AnalysisStatus.REQUESTED,
                    result: undefined,
                    config: {}
                });
                // if (step.persistant_config) {
                //     for (const [key, value] of Object.entries(step.persistant_config)) {
                //         if (!config[step.name]) config[step.name] = {};
                //         config[step.name][key] = value;
                //     }
                // }
                if (step.config) {
                    for (const [key, value] of Object.entries(step.config)) {
                        if (!config_structure[step.name]) config_structure[step.name] = {};
                        config_structure[step.name][key] = value;
                    }
                }
            }
            stages.push(steps);
        }

        // Provider attributes overwrite persistant config attributes
        for (const [pluginName, _] of Object.entries(analysisData.config)) {
            for (const [key, value] of Object.entries(_)) {
                if (!config[pluginName]) config[pluginName] = {};
                config[pluginName][key] = value;
            }
        }

        for (const [pluginName, plugin_config] of Object.entries(config_structure)) {
            for (const [key] of Object.entries(plugin_config)) {
                const config_element = config_structure[pluginName][key];
                if (config_element.required && !config[pluginName][key]) {
                    throw new AnaylzerMissingConfigAttribute();
                }
            }
        }

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

        const created_analysis = await this.analysisRepository.save(analysis);

        // Send message to aqmp to start the anaylsis
        const queue = this.configService.getOrThrow<string>('AMQP_ANALYSES_QUEUE');
        const amqpHost = `${this.configService.getOrThrow<string>(
            'AMQP_PROTOCOL'
        )}://${this.configService.getOrThrow<string>('AMQP_USER')}:${
            process.env.AMQP_PASSWORD
        }@${this.configService.getOrThrow<string>(
            'AMQP_HOST'
        )}:${this.configService.getOrThrow<string>('AMQP_PORT')}`;

        try {
            const conn = await amqp.connect(amqpHost);
            const ch1 = await conn.createChannel();
            await ch1.assertQueue(queue);

            // A project can be analyzed with or without an integration
            // This is the user has uploaded files
            let integration_id = null;
            if (project.integration) {
                integration_id = project.integration.id;
            }
            const message: AnalysisStartMessageCreate = {
                analysis_id: created_analysis.id,
                integration_id: integration_id,
                organization_id: orgId
            };
            ch1.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
            await ch1.close();
        } catch (err) {
            throw new RabbitMQError(err);
        }

        return created_analysis.id;
    }

    /**
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @throws {EntityNotFound} In case the project does not exist
     * @param orgId
     * @param projectId
     * @param id
     * @param user
     * @returns
     */
    async get(
        orgId: string,
        projectId: string,
        id: string,
        user: AuthenticatedUser
    ): Promise<Analysis> {
        // (1) Check if user has access to org
        await this.organizationMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        let belongs = await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        // (3) Check if the analyses belongs to the project
        belongs = await this.analysesMemberService.doesAnalysesBelongToProject(id, projectId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        const analysis = await this.analysisRepository.findOne({
            where: { id: id }
        });
        if (!analysis) {
            throw new EntityNotFound();
        }

        return analysis;
    }

    /**
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @throws {EntityNotFound} In case the project does not exist
     * @param orgId
     * @param projectId
     * @param id
     * @param user
     * @returns
     */
    async getChart(
        orgId: string,
        projectId: string,
        id: string,
        user: AuthenticatedUser
    ): Promise<Array<object>> {
        // (1) Check if user has access to org
        await this.organizationMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        let belongs = await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        // (3) Check if the analyses belongs to the project
        belongs = await this.analysesMemberService.doesAnalysesBelongToProject(id, projectId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        // const patchesOutput: PatchesOutput = await getPatchingResult(db, id);
        const sbomOutput: SbomOutput = await getSbomResult(id, this.resultRepository);
        const vulnOutput: VulnsOuptut = await getVulnsResult(id, this.resultRepository);
        const licensesOutput: LicensesOutput = await getLicensesResult(id, this.resultRepository);

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
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @param organizationId
     * @param projectId
     * @param paginationUserSuppliedConf
     * @param user
     * @returns
     */
    async getMany(
        organizationId: string,
        projectId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser
    ): Promise<TypedPaginatedData<Analysis>> {
        // (1) Check if the user is allowed to create a analyzer (is atleast user)
        await this.organizationMemberService.hasRequiredRole(
            organizationId,
            user.userId,
            MemberRole.USER
        );

        // (2) Check if the project belongs to the org
        const belongs = await this.projectMemberService.doesProjectBelongToOrg(
            projectId,
            organizationId
        );
        if (!belongs) {
            throw new NotAuthorized();
        }

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

        const analysisQueryBuilder = this.analysisRepository
            .createQueryBuilder('analysis')
            .orderBy('analysis.created_on', 'DESC')
            .where('analysis.projectId = :projectId', { projectId });

        const fullCount = await analysisQueryBuilder.getCount();

        const analyses = await analysisQueryBuilder
            .skip(currentPage * entriesPerPage)
            .take(entriesPerPage)
            .getMany();

        return {
            data: analyses,
            page: currentPage,
            entry_count: analyses.length,
            entries_per_page: entriesPerPage,
            total_entries: fullCount,
            total_pages: Math.ceil(fullCount / entriesPerPage),
            matching_count: analyses.length,
            filter_count: {}
        };
    }

    /**
     * @throws {NotAuthorized} In case the user is not allowed to perform the action on the org
     * @throws {EntityNotFound} In case the project does not exist
     * @param orgId
     * @param projectId
     * @param id
     * @param user
     */
    async delete(
        orgId: string,
        projectId: string,
        id: string,
        user: AuthenticatedUser
    ): Promise<void> {
        // (1) Check if user has access to org
        await this.organizationMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // TODO: additionally check who created the analysis, and if the role is USER, only allow the user who created the analysis to delete it
        // obviously owners, admins and moderators can also delete it

        // (2) Check if the project belongs to the org
        let belongs = await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        // (3) Check if the analyses belongs to the project
        belongs = await this.analysesMemberService.doesAnalysesBelongToProject(id, projectId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        const analysis = await this.analysisRepository.findOne({
            where: { id },
            relations: {
                results: true
            }
        });
        if (!analysis) {
            throw new EntityNotFound();
        }

        for (const result of analysis.results) {
            await this.resultRepository.delete(result.id);
        }
        await this.analysisRepository.delete(analysis.id);
    }
}
