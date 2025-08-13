import {
    Dependency,
    DependencyDetails,
    Output as SBOMOutput,
    Status
} from 'src/codeclarity_modules/results/sbom/sbom.types';
import { Output as VulnsOutput } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import { PluginFailed, PluginResultNotAvailable, UnknownWorkspace } from 'src/types/error.types';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { Repository, In } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { VulnerabilitiesUtilsService } from '../../vulnerabilities/utils/utils.service';
import { LicensesUtilsService } from '../../licenses/utils/utils';
import { PackageRepository } from 'src/codeclarity_modules/knowledge/package/package.repository';

@Injectable()
export class SbomUtilsService {
    constructor(
        private readonly vulnerabilitiesUtilsService: VulnerabilitiesUtilsService,
        private readonly licensesUtilsService: LicensesUtilsService,
        private readonly packageRepository: PackageRepository,
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getSbomData(analysis_id: string, workspace: string): Promise<Dependency[]> {
        const sbom: SBOMOutput = await this.getSbomResult(analysis_id);

        // Validate that the workspace exists
        if (!(workspace in sbom.workspaces)) {
            throw new UnknownWorkspace();
        }
        // Generate the list of deps (SBOM)
        const dependenciesArray: Dependency[] = [];

        // for (const [, dep] of Object.entries(dependenciesMap)) {
        //     dependenciesArray.push(dep);
        // }

        return dependenciesArray;
    }

    async getSbomResult(analysis_id: string): Promise<SBOMOutput> {
        const result = await this.resultRepository.findOne({
            relations: { analysis: true },
            where: {
                analysis: {
                    id: analysis_id
                },
                plugin: In(['js-sbom', 'php-sbom'])
            },
            order: {
                analysis: {
                    created_on: 'DESC'
                }
            },
            cache: true
        });
        if (!result) {
            throw new PluginResultNotAvailable();
        }

        const sbom: SBOMOutput = result.result as unknown as SBOMOutput;
        if (sbom.analysis_info.status == Status.Failure) {
            throw new PluginFailed();
        }
        return sbom;
    }

    async getDependencyData(
        analysis_id: string,
        workspace: string,
        dependency_name: string,
        dependency_version: string,
        sbom: SBOMOutput
    ): Promise<DependencyDetails> {
        const package_version = await this.packageRepository.getVersionInfo(
            dependency_name,
            dependency_version
        );

        const dependency =
            sbom.workspaces[workspace].dependencies[dependency_name][dependency_version];

        const version = package_version.versions[0];
        const dependency_details: DependencyDetails = {
            name: dependency_name,
            version: version.version,
            latest_version: package_version.latest_version,
            dependencies: version.dependencies,
            dev_dependencies: version.dev_dependencies,
            transitive: dependency.Transitive,
            source: package_version.source,
            package_manager: sbom.analysis_info.package_manager,
            license: package_version.license,
            engines: version.extra.Engines,
            release_date: version.extra.Time,
            lastest_release_date: package_version.time,
            vulnerabilities: [],
            severity_dist: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                none: 0
            }
        };

        // Attach vulnerability info if the service has finished
        const vulns: VulnsOutput =
            await this.vulnerabilitiesUtilsService.getVulnsResult(analysis_id);

        dependency_details.vulnerabilities = [];

        for (const vuln of vulns.workspaces['.'].Vulnerabilities) {
            if (
                vuln.AffectedDependency == dependency_name &&
                vuln.AffectedVersion == dependency_version
            ) {
                dependency_details.vulnerabilities.push(vuln.VulnerabilityId);
                dependency_details.severity_dist.critical +=
                    vuln.Severity.SeverityClass == 'CRITICAL' ? 1 : 0;
                dependency_details.severity_dist.high +=
                    vuln.Severity.SeverityClass == 'HIGH' ? 1 : 0;
                dependency_details.severity_dist.medium +=
                    vuln.Severity.SeverityClass == 'MEDIUM' ? 1 : 0;
                dependency_details.severity_dist.low +=
                    vuln.Severity.SeverityClass == 'LOW' ? 1 : 0;
                dependency_details.severity_dist.none +=
                    vuln.Severity.SeverityClass == 'NONE' ? 1 : 0;
            }
        }

        return dependency_details;
    }

    // export async function getParents(
    //     dependenciesMap: {
    //         [key: string]: Dependency;
    //     },
    //     dependency: string,
    //     parentsSet: Set<string> = new Set()
    // ): Promise<WorkSpaceData> {
    //     const graph: WorkSpaceData = {
    //         start_dev_deps: [],
    //         start_deps: [],
    //         dependencies: {},
    //         start_deps_constraints: {},
    //         start_dev_deps_constraints: {}
    //     };

    //     if (parentsSet.has(dependency)) {
    //         return graph;
    //     }

    //     graph.dependencies[dependency] = dependenciesMap[dependency];

    //     // If top level dependency
    //     if (dependenciesMap[dependency].is_direct_count > 0) {
    //         if (dependenciesMap[dependency].is_dev_count > 0) {
    //             graph.start.dev_dependencies.push(dependency);
    //             graph.start_dev_deps_constraints[dependency] = dependenciesMap[dependency].version;
    //         }
    //         if (dependenciesMap[dependency].is_prod_count > 0) {
    //             graph.start.dependencies.push(dependency);
    //             graph.start_deps_constraints[dependency] = dependenciesMap[dependency].version;
    //         }
    //     }

    //     if (dependenciesMap[dependency].parents.length !== 0) {
    //         const parents: string[] = dependenciesMap[dependency].parents;
    //         parentsSet.add(dependency);
    //         for (const parent of parents) {
    //             const parentGraph: WorkSpaceData = await getParents(
    //                 dependenciesMap,
    //                 parent,
    //                 parentsSet
    //             );
    //             for (const [, value] of Object.entries(parentGraph.start_deps)) {
    //                 graph.start.dependencies.push(value);
    //             }
    //             for (const [, value] of Object.entries(parentGraph.start_dev_deps)) {
    //                 graph.start.dev_dependencies.push(value);
    //             }

    //             for (const [key, value] of Object.entries(parentGraph.dependencies)) {
    //                 graph.dependencies[key] = value;
    //             }
    //         }
    //     }

    //     graph.start.dependencies = Array.from(new Set(graph.start_deps));
    //     graph.start.dev_dependencies = Array.from(new Set(graph.start_dev_deps));
    //     return graph;
    // }
}
