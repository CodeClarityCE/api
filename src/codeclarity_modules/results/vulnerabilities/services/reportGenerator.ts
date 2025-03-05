import { Injectable } from '@nestjs/common';
import {
    VulnerabilityDetails,
    VulnerabilityInfo,
    VulnerableVersionInfo,
    DependencyInfo,
    CommonConsequencesInfo,
    WeaknessInfo,
    ReferenceInfo,
    SeverityInfo,
    OtherInfo
} from 'src/types/entities/frontend/Vulnerability';
import { Vulnerability, AffectedInfo } from 'src/types/entities/services/Vulnerabilities';
import { getVersionsSatisfyingConstraint } from 'src/codeclarity_modules/results/utils/utils';
import { satisfies } from 'semver';
import { VersionsRepository } from 'src/codeclarity_modules/knowledge/package/packageVersions.repository';
import { OSVRepository } from 'src/codeclarity_modules/knowledge/osv/osv.repository';
import { CWERepository } from 'src/codeclarity_modules/knowledge/cwe/cwe.repository';
import { NVDRepository } from 'src/codeclarity_modules/knowledge/nvd/nvd.repository';
import { PackageRepository } from 'src/codeclarity_modules/knowledge/package/package.repository';
import { OWASPRepository } from 'src/codeclarity_modules/knowledge/owasp/owasp.repository';
import { Dependency } from 'src/types/entities/services/Sbom';
import { CVSS2, CVSS3, CVSS31 } from 'src/types/entities/knowledge/CVSS';
import { PatchInfo } from 'src/types/entities/services/Patching';
import { OwaspTop10Info } from 'src/types/entities/knowledge/OWASP';
import { NVD } from 'src/codeclarity_modules/knowledge/nvd/nvd.entity';
import { OSV } from 'src/codeclarity_modules/knowledge/osv/osv.entity';
import { Version } from 'src/codeclarity_modules/knowledge/package/package.entity';

abstract class BaseReportGenerator {
    patchesData: PatchInfo;
    vulnsData: Vulnerability;
    dependencyData?: Dependency;
    versions: Version[];
    packageManager: string;
    osvItem?: OSV;
    nvdItem?: NVD;

    readonly versionsRepository: VersionsRepository;
    readonly osvRepository: OSVRepository;
    readonly nvdRepository: NVDRepository;
    readonly cweRepository: CWERepository;
    readonly packageRepository: PackageRepository;
    readonly owaspRepository: OWASPRepository;

    constructor(
        versionsRepository: VersionsRepository,
        osvRepository: OSVRepository,
        nvdRepository: NVDRepository,
        cweRepository: CWERepository,
        packageRepository: PackageRepository,
        owaspRepository: OWASPRepository
    ) {
        this.versionsRepository = versionsRepository;
        this.osvRepository = osvRepository;
        this.nvdRepository = nvdRepository;
        this.cweRepository = cweRepository;
        this.packageRepository = packageRepository;
        this.owaspRepository = owaspRepository;
    }

    async #getVersions(): Promise<Version[]> {
        if (!this.dependencyData) return [];

        if (this.versions == undefined) {
            const versions = await this.versionsRepository.getDependencyVersions(
                // this.dependencyData.name
                ''
            );
            this.versions = versions;
            return versions;
        } else {
            return this.versions;
        }
    }

    async getPatchedVersionsString(source: string): Promise<string> {
        // const affectedData: AffectedInfo = this.vulnsData.Affected[source];
        const affectedData: AffectedInfo = { Ranges: [], Exact: [], Universal: false };
        const patchedStringParts: string[] = [];
        const versions = await this.#getVersions();
        const versionsStrings = versions.map((a) => a.version);

        if (affectedData.Ranges.length > 0) {
            for (let i = 0; i < affectedData.Ranges.length; i++) {
                let patchedStringPart = '';
                const currentPart = affectedData.Ranges[i];
                let previousPart = null;
                let nextPart = null;

                if (i - 1 >= 0) {
                    previousPart = affectedData.Ranges[i - 1];
                }

                if (i + 1 < affectedData.Ranges.length - 1) {
                    nextPart = affectedData.Ranges[i + 1];
                }

                if (previousPart) {
                    if (previousPart.FixedString == null) {
                        continue;
                    } else {
                        const versionsBetween = getVersionsSatisfyingConstraint(
                            versionsStrings,
                            `>= ${previousPart.FixedString} < ${currentPart.IntroducedString}`
                        );
                        if (versionsBetween.length > 1) {
                            patchedStringPart += `>= ${previousPart.FixedString} < ${currentPart.IntroducedString}`;
                        } else {
                            patchedStringPart += `${previousPart.FixedString}`;
                        }
                    }
                } else {
                    if (currentPart.FixedString && nextPart == null) {
                        const versionsBetween = getVersionsSatisfyingConstraint(
                            versionsStrings,
                            `>= ${currentPart.FixedString}`
                        );
                        if (versionsBetween.length > 1) {
                            patchedStringPart += `>= ${currentPart.FixedString}`;
                        } else {
                            if (versionsBetween.length > 0) {
                                patchedStringPart += versionsBetween[0];
                            }
                        }
                    } else if (currentPart.FixedString && nextPart != null) {
                        const versionsBetween = getVersionsSatisfyingConstraint(
                            versionsStrings,
                            `>= ${currentPart.FixedString} < ${nextPart.IntroducedString}`
                        );
                        if (versionsBetween.length > 1) {
                            patchedStringPart += `>= ${currentPart.FixedString}`;
                        } else {
                            if (versionsBetween.length > 0) {
                                patchedStringPart += versionsBetween[0];
                            }
                        }
                    }
                }

                if (!patchedStringParts.includes(patchedStringPart))
                    patchedStringParts.push(patchedStringPart);

                if (i == affectedData.Ranges.length - 1) {
                    if (currentPart.FixedString) {
                        if (!patchedStringParts.includes(`>= ${currentPart.FixedString}`))
                            patchedStringParts.push(`>= ${currentPart.FixedString}`);
                    }
                }
            }
        } else if (affectedData.Exact.length > 0) {
            // get all version other than those listed in exact
            for (const version of versions) {
                if (!affectedData.Exact.includes(version.version)) {
                    patchedStringParts.push(version.version);
                }
            }
        } else if (affectedData.Universal) {
            // no pached version exists
        }

        return patchedStringParts.join(' || ');
    }

    async getVulnerableVersionsString(source: string): Promise<string> {
        // const affectedData: AffectedInfo = this.vulnsData.Affected[source];
        const affectedData: AffectedInfo = { Ranges: [], Exact: [], Universal: false };
        const affectedStringParts: string[] = [];

        if (affectedData.Ranges.length > 0) {
            for (const range of affectedData.Ranges) {
                let affectedStringPart = '';
                if (range.IntroducedString) affectedStringPart += `>= ${range.IntroducedString}`;
                if (range.FixedString && range.IntroducedString)
                    affectedStringPart += ` < ${range.FixedString}`;
                else if (range.FixedString) affectedStringPart += `< ${range.FixedString}`;
                affectedStringParts.push(affectedStringPart);
            }
        } else if (affectedData.Exact.length > 0) {
            for (const exact of affectedData.Exact) {
                affectedStringParts.push(exact);
            }
        } else if (affectedData.Universal) {
            affectedStringParts.push('*');
        }

        return affectedStringParts.join(' || ');
    }

    async getVersionsStatusArray(affectedVersionsString: string): Promise<VulnerableVersionInfo[]> {
        const versions = await this.#getVersions();
        const versionsStatusArray: VulnerableVersionInfo[] = [];
        for (const version of versions) {
            if (satisfies(version.version, affectedVersionsString)) {
                versionsStatusArray.push({
                    version: version.version,
                    status: 'affected'
                });
            } else {
                versionsStatusArray.push({
                    version: version.version,
                    status: 'not_affected'
                });
            }
        }
        return versionsStatusArray;
    }

    getPatchesData(): PatchInfo {
        // if (this.patchesData.affected_deps && this.patchesData.affected_deps.length > 0) {
        //     this.patchesData.affected_dep_name = this.patchesData.affected_deps[0].slice(
        //         0,
        //         this.patchesData.affected_deps[0].lastIndexOf('@')
        //     );
        // }
        return this.patchesData;
    }

    async getWeaknessData(): Promise<
        [WeaknessInfo[], { [key: string]: CommonConsequencesInfo[] }]
    > {
        const common_consequences: { [key: string]: CommonConsequencesInfo[] } = {};
        const weakenessses: WeaknessInfo[] = [];

        if (this.vulnsData.Weaknesses == null) return [weakenessses, common_consequences];

        for (const weakeness of this.vulnsData.Weaknesses) {
            try {
                const cweInfo = await this.cweRepository.getCWE(
                    weakeness.WeaknessId.replace('CWE-', '')
                );
                throw new Error('Method not implemented.');
                // weakenessses.push({
                //     id: weakeness.WeaknessId,
                //     name: cweInfo.Name,
                //     description: cweInfo.Description.replace(/[^\x20-\x7E]+/g, '')
                //         .replace(/\s+/g, ' ')
                //         .trim()
                // });
                // if (cweInfo.Common_Consequences) {
                //     const common_cons_array = [];
                //     for (const commonConsequence of cweInfo.Common_Consequences) {
                //         common_cons_array.push({
                //             scope: commonConsequence.Scope,
                //             impact: commonConsequence.Impact,
                //             description: commonConsequence.Note.replace(/[^\x20-\x7E]+/g, '')
                //                 .replace(/\s+/g, ' ')
                //                 .trim()
                //         });
                //     }
                //     common_consequences[weakeness.WeaknessId] = common_cons_array;
                // }
            } catch (error) {
                /* empty */
            }
        }

        return [weakenessses, common_consequences];
    }

    async getDependencyData(): Promise<DependencyInfo> {
        if (!this.dependencyData) throw new Error('Dependency data missing');

        const dependencyInfo: DependencyInfo = {
            name: '',
            published: '',
            description: '',
            keywords: [],
            version: '',
            package_manager_links: []
        };

        try {
            const packageInfo = await this.packageRepository.getPackageInfo('');
            const versionInfo = await this.versionsRepository.getVersion(
                'this.dependencyData.name',
                'this.dependencyData.version'
            );

            // dependencyInfo.description = packageInfo.Description;
            // if (packageInfo.Keywords) dependencyInfo.keywords = packageInfo.Keywords;
            // dependencyInfo.published = versionInfo.Time;

            // if (packageInfo.Homepage && packageInfo.Homepage != '') {
            //     dependencyInfo.homepage = packageInfo.Homepage;
            // }

            // if (this.dependencyData.git_url != null) {
            //     if (this.dependencyData.git_url.host_type == 'GITHUB') {
            //         dependencyInfo.github_link = this.dependencyData.git_url;
            //         dependencyInfo.issues_link =
            //             this.dependencyData.git_url.repo_full_path + '/issues';
            //     }
            // }

            // if (this.packageManager == 'NPM' || this.packageManager == 'YARN') {
            //     dependencyInfo.package_manager_links.push({
            //         package_manager: 'NPM',
            //         url: `https://www.npmjs.com/package/${this.dependencyData.name}`
            //     });
            //     dependencyInfo.package_manager_links.push({
            //         package_manager: 'YARN',
            //         url: `https://yarn.pm/${this.dependencyData.name}`
            //     });
            // }

            return dependencyInfo;
        } catch (error) {
            return dependencyInfo;
        }
    }

    getOwaspTop10Info(): OwaspTop10Info | null {
        if (this.vulnsData.Weaknesses == null) return null;

        for (const weakeness of this.vulnsData.Weaknesses) {
            if (weakeness.OWASPTop10Id != '') {
                try {
                    return this.owaspRepository.getOwaspTop10CategoryInfo(weakeness.OWASPTop10Id);
                } catch (err) {
                    return null;
                }
            }
        }
        return null;
    }

    async parseCVSS31Vector(vector: string): Promise<CVSS3> {
        const { createCVSS31Parser, createCVSS31Calculator } = await import('cvss-parser');
        const cvss31Parser = createCVSS31Parser();
        const parsedVector = cvss31Parser.parse(vector);
        const cvss31Calculator = createCVSS31Calculator();
        cvss31Calculator.computeBaseScore(parsedVector);

        const baseScore = cvss31Calculator.getBaseScore(true);
        const exploitabilitySubscore = cvss31Calculator.getExploitabilitySubScore(true);
        const impactSubscore = cvss31Calculator.getImpactSubScore(true);

        const cvss31Data: CVSS31 = {
            base_score: baseScore,
            exploitability_score: exploitabilitySubscore,
            impact_score: impactSubscore,
            attack_vector: parsedVector.AttackVector,
            attack_complexity: parsedVector.AttackComplexity,
            confidentiality_impact: parsedVector.ConfidentialityImpact,
            availability_impact: parsedVector.AvailabilityImpact,
            integrity_impact: parsedVector.IntegrityImpact,
            user_interaction: parsedVector.UserInteraction,
            scope: parsedVector.Scope,
            privileges_required: parsedVector.PrivilegesRequired
        };
        return cvss31Data;
    }

    async parseCVSS3Vector(vector: string): Promise<CVSS3> {
        const { createCVSS3Parser, createCVSS3Calculator } = await import('cvss-parser');
        const cvss3Parser = createCVSS3Parser();
        const parsedVector = cvss3Parser.parse(vector);
        const cvss3Calculator = createCVSS3Calculator();
        cvss3Calculator.computeBaseScore(parsedVector);

        const baseScore = cvss3Calculator.getBaseScore(true);
        const exploitabilitySubscore = cvss3Calculator.getExploitabilitySubScore(true);
        const impactSubscore = cvss3Calculator.getImpactSubScore(true);

        const cvss3Data: CVSS3 = {
            base_score: baseScore,
            exploitability_score: exploitabilitySubscore,
            impact_score: impactSubscore,
            attack_vector: parsedVector.AttackVector,
            attack_complexity: parsedVector.AttackComplexity,
            confidentiality_impact: parsedVector.ConfidentialityImpact,
            availability_impact: parsedVector.AvailabilityImpact,
            integrity_impact: parsedVector.IntegrityImpact,
            user_interaction: parsedVector.UserInteraction,
            scope: parsedVector.Scope,
            privileges_required: parsedVector.PrivilegesRequired
        };
        return cvss3Data;
    }

    async parseCVSS2Vector(vector: string): Promise<CVSS2> {
        const { createCVSS2Parser, createCVSS2Calculator } = await import('cvss-parser');
        const cvss2Parser = createCVSS2Parser();
        const parsedVector = cvss2Parser.parse(vector);
        const cvss2Calculator = createCVSS2Calculator();
        cvss2Calculator.computeBaseScore(parsedVector);

        const baseScore = cvss2Calculator.getBaseScore(true);
        const exploitabilitySubscore = cvss2Calculator.getExploitabilitySubScore(true);
        const impactSubscore = cvss2Calculator.getImpactSubScore(true);

        const cvss2Data: CVSS2 = {
            base_score: baseScore,
            exploitability_score: exploitabilitySubscore,
            impact_score: impactSubscore,
            access_vector: parsedVector.AccessVector,
            access_complexity: parsedVector.AccessComplexity,
            confidentiality_impact: parsedVector.ConfidentialityImpact,
            availability_impact: parsedVector.AvailabilityImpact,
            integrity_impact: parsedVector.IntegrityImpact,
            authentication: parsedVector.Authentication
        };
        return cvss2Data;
    }

    async getCVSSNVDInfo(nvdItem: NVD): Promise<SeverityInfo> {
        const severityInfo: SeverityInfo = {};

        if (nvdItem.metrics) {
            if (nvdItem.metrics.cvssMetricV2) {
                if (nvdItem.metrics.cvssMetricV2.length > 1) {
                    for (const cvss2 of nvdItem.metrics.cvssMetricV2) {
                        if (cvss2.source == 'nvd@nist.gov') {
                            severityInfo.cvss_2 = await this.parseCVSS2Vector(
                                cvss2.cvssData.vectorString
                            );
                            break;
                        }
                    }
                } else if (nvdItem.metrics.cvssMetricV2.length == 1) {
                    const cvss2 = nvdItem.metrics.cvssMetricV2[0];
                    severityInfo.cvss_2 = await this.parseCVSS2Vector(cvss2.cvssData.vectorString);
                }
            }

            if (nvdItem.metrics.cvssMetricV30) {
                if (nvdItem.metrics.cvssMetricV30.length > 1) {
                    for (const cvss3 of nvdItem.metrics.cvssMetricV30) {
                        if (cvss3.source == 'nvd@nist.gov') {
                            severityInfo.cvss_3 = await this.parseCVSS3Vector(
                                cvss3.cvssData.vectorString
                            );
                            break;
                        }
                    }
                } else if (nvdItem.metrics.cvssMetricV30.length == 1) {
                    const cvss3 = nvdItem.metrics.cvssMetricV30[0];
                    severityInfo.cvss_3 = await this.parseCVSS3Vector(cvss3.cvssData.vectorString);
                }
            }

            if (nvdItem.metrics.cvssMetricV31) {
                if (nvdItem.metrics.cvssMetricV31.length > 1) {
                    for (const cvss31 of nvdItem.metrics.cvssMetricV31) {
                        if (cvss31.source == 'nvd@nist.gov') {
                            severityInfo.cvss_3 = await this.parseCVSS3Vector(
                                cvss31.cvssData.vectorString
                            );
                            break;
                        }
                    }
                } else if (nvdItem.metrics.cvssMetricV31.length == 1) {
                    const cvss31 = nvdItem.metrics.cvssMetricV31[0];
                    severityInfo.cvss_31 = await this.parseCVSS31Vector(
                        cvss31.cvssData.vectorString
                    );
                }
            }
        }

        if (severityInfo.cvss_2 != undefined) {
            severityInfo.cvss_2.user_interaction_required =
                nvdItem.metrics.cvssMetricV2[0].userInteractionRequired;
        }

        return severityInfo;
    }

    async getCVSSOSVInfo(osvItem: OSV): Promise<SeverityInfo> {
        const severityInfo: SeverityInfo = {};

        if (osvItem.severity && osvItem.severity.length > 0) {
            for (const severity of osvItem.severity) {
                if (severity.type == 'CVSS_V3') {
                    severityInfo.cvss_3 = await this.parseCVSS3Vector(severity.score);
                } else if (severity.type == 'CVSS_V2') {
                    severityInfo.cvss_2 = await this.parseCVSS2Vector(severity.score);
                }
            }
        }

        return severityInfo;
    }

    getOtherInfo(): OtherInfo {
        return { package_manager: this.packageManager };
    }
}

@Injectable()
export class OSVReportGenerator extends BaseReportGenerator {
    constructor(
        readonly versionsRepository: VersionsRepository,
        readonly osvRepository: OSVRepository,
        readonly nvdRepository: NVDRepository,
        readonly cweRepository: CWERepository,
        readonly packageRepository: PackageRepository,
        readonly owaspRepository: OWASPRepository
    ) {
        super(
            versionsRepository,
            osvRepository,
            nvdRepository,
            cweRepository,
            packageRepository,
            owaspRepository
        );
    }

    async genReport(
        // patchesData: PatchInfo,
        vulnsData: Vulnerability,
        packageManager: string,
        dependencyData?: Dependency,
        osvItem?: OSV,
        nvdItem?: NVD
    ): Promise<VulnerabilityDetails> {
        // this.patchesData = patchesData;
        this.vulnsData = vulnsData;
        this.packageManager = packageManager;
        this.dependencyData = dependencyData;
        this.osvItem = osvItem;
        this.nvdItem = nvdItem;

        if (!this.osvItem) {
            throw new Error('Failed to generate report from undefined nvd entry');
        }

        /** Vulnerability Info */
        const vulnInfo: VulnerabilityInfo = {
            vulnerability_id: this.osvItem.cve == null ? this.osvItem.osv_id : this.osvItem.cve,
            description: this.#cleanOsvDescription(this.osvItem.details),
            version_info: {
                affected_versions_string: '',
                patched_versions_string: '',
                versions: []
            },
            published: this.osvItem.published,
            last_modified: this.osvItem.modified,
            sources: [
                {
                    name: 'OSV',
                    vuln_url: `https://osv.dev/vulnerability/${this.osvItem.osv_id}`
                }
            ],
            aliases: [this.osvItem.osv_id]
        };

        if (this.osvItem.cve) {
            vulnInfo.aliases.push(this.osvItem.cve);
        }

        if (this.nvdItem) {
            vulnInfo.sources.push({
                name: 'NVD',
                vuln_url: `https://nvd.nist.gov/vuln/detail/${this.nvdItem.nvd_id}`
            });
        }

        const patchedVersionsString = await this.getPatchedVersionsString('OSV');
        const affectedVersionsString = await this.getVulnerableVersionsString('OSV');
        const versionsStatusArray = await this.getVersionsStatusArray(affectedVersionsString);

        vulnInfo.version_info.affected_versions_string = affectedVersionsString;
        vulnInfo.version_info.patched_versions_string = patchedVersionsString;
        vulnInfo.version_info.versions = versionsStatusArray;

        /** Dependency Info */
        let dependencyInfo: DependencyInfo | undefined;
        try {
            dependencyInfo = await this.getDependencyData();
        } catch (error) {
            // intentionally empty
        }

        /** Common consequences and waeknesses */
        const [weakenessses, common_consequences] = await this.getWeaknessData();

        /** Patch Info */
        const patchInfo: PatchInfo = this.getPatchesData();

        /** Severities */
        let severityInfo: SeverityInfo = await this.getCVSSOSVInfo(this.osvItem);

        if (
            severityInfo.cvss_2 == null &&
            severityInfo.cvss_31 == null &&
            severityInfo.cvss_3 == null
        ) {
            if (this.nvdItem) {
                severityInfo = await this.getCVSSNVDInfo(this.nvdItem);
            }
        }

        /** References */
        const references: ReferenceInfo[] = [];

        if (this.osvItem.references) {
            for (const ref of this.osvItem.references) {
                references.push({ url: ref.url, tags: [ref.type] });
            }
        }

        /** Owasp top 10 */
        const owaspTop10Info = this.getOwaspTop10Info();

        /** Vulnerability Details */
        const vulnDetails: VulnerabilityDetails = {
            vulnerability_info: vulnInfo,
            dependency_info: dependencyInfo,
            weaknesses: weakenessses,
            severities: severityInfo,
            common_consequences: common_consequences,
            patch: patchInfo,
            references: references,
            owasp_top_10: owaspTop10Info,
            location: [],
            other: this.getOtherInfo()
        };

        return vulnDetails;
    }

    #cleanOsvDescription(description: string): string {
        const sections = [];
        let parsingHeader = false;
        let text = '';

        for (const char of description) {
            if (char == '#' && parsingHeader == false) {
                if (text != '') sections.push(text);
                parsingHeader = true;
                text = '';
                continue;
            }

            if (char != '#') parsingHeader = false;

            if (char != '#') text += char;
        }

        if (text != '') {
            sections.push(text);
        }

        const selectedSections = [];

        let index = -1;
        for (const section of sections) {
            index += 1;
            if (index == 0) {
                selectedSections.push(section);
                continue;
            }
            if (section.includes('```')) {
                selectedSections.push(section);
                continue;
            }
        }

        if (selectedSections.length > 0) {
            let newSection = '';
            const section = selectedSections[selectedSections.length - 1];
            let trimEndNewLines = true;
            for (let i = section.length - 1; i >= 0; i--) {
                if (section[i] != '\n') {
                    trimEndNewLines = false;
                }
                if (!trimEndNewLines) {
                    newSection += section[i];
                }
            }
            selectedSections[selectedSections.length - 1] = newSection.split('').reverse().join('');
        }

        return selectedSections.join('\n');
    }
}

@Injectable()
export class NVDReportGenerator extends BaseReportGenerator {
    constructor(
        readonly versionsRepository: VersionsRepository,
        readonly osvRepository: OSVRepository,
        readonly nvdRepository: NVDRepository,
        readonly cweRepository: CWERepository,
        readonly packageRepository: PackageRepository,
        readonly owaspRepository: OWASPRepository
    ) {
        super(
            versionsRepository,
            osvRepository,
            nvdRepository,
            cweRepository,
            packageRepository,
            owaspRepository
        );
    }

    async genReport(
        // patchesData: PatchInfo,
        vulnsData: Vulnerability,
        packageManager: string,
        dependencyData?: Dependency,
        osvItem?: OSV,
        nvdItem?: NVD
    ): Promise<VulnerabilityDetails> {
        // this.patchesData = patchesData;
        this.vulnsData = vulnsData;
        this.packageManager = packageManager;
        this.dependencyData = dependencyData;
        this.osvItem = osvItem;
        this.nvdItem = nvdItem;

        if (!this.nvdItem) {
            throw new Error('Failed to generate report from undefined nvd entry');
        }

        /** Vulnerability Info */
        const vulnInfo: VulnerabilityInfo = {
            vulnerability_id: this.nvdItem.nvd_id,
            description: '',
            version_info: {
                affected_versions_string: '',
                patched_versions_string: '',
                versions: []
            },
            published: this.nvdItem.published,
            last_modified: this.nvdItem.lastModified,
            sources: [
                {
                    name: 'NVD',
                    vuln_url: `https://nvd.nist.gov/vuln/detail/${this.nvdItem.nvd_id}`
                }
            ],
            aliases: []
        };

        if (this.osvItem) {
            vulnInfo.aliases.push(this.osvItem.osv_id);
            vulnInfo.sources.push({
                name: 'OSV',
                vuln_url: `https://osv.dev/vulnerability/${this.osvItem.osv_id}`
            });
        }

        for (const description of this.nvdItem.descriptions) {
            if (description.lang == 'en') {
                vulnInfo.description = description.value;
                break;
            }
        }

        // const patchedVersionsString = await this.getPatchedVersionsString('NVD');
        // const affectedVersionsString = await this.getVulnerableVersionsString('NVD');
        // const versionsStatusArray = await this.getVersionsStatusArray(affectedVersionsString);

        // vulnInfo.version_info.affected_versions_string = affectedVersionsString;
        // vulnInfo.version_info.patched_versions_string = patchedVersionsString;
        // vulnInfo.version_info.versions = versionsStatusArray;

        /** Dependency Info */
        let dependencyInfo: DependencyInfo | undefined;
        try {
            dependencyInfo = await this.getDependencyData();
        } catch (error) {
            // intentionally empty
        }

        /** Common consequences and waeknesses */
        const [weakenessses, common_consequences] = await this.getWeaknessData();

        /** Patch Info */
        const patchInfo: PatchInfo = this.getPatchesData();

        /** Severities */
        let severityInfo: SeverityInfo = await this.getCVSSNVDInfo(this.nvdItem);

        if (
            severityInfo.cvss_2 == null &&
            severityInfo.cvss_31 == null &&
            severityInfo.cvss_3 == null
        ) {
            if (this.osvItem) {
                severityInfo = await this.getCVSSOSVInfo(this.osvItem);
            }
        }

        /** References */
        const references: ReferenceInfo[] = [];

        for (const ref of this.nvdItem.references) {
            references.push({ url: ref.url, tags: [] });
        }

        /** Owasp top 10 */
        const owaspTop10Info = this.getOwaspTop10Info();

        /** Vulnerability Details */
        const vulnDetails: VulnerabilityDetails = {
            vulnerability_info: vulnInfo,
            dependency_info: dependencyInfo,
            weaknesses: weakenessses,
            severities: severityInfo,
            common_consequences: common_consequences,
            patch: patchInfo,
            references: references,
            owasp_top_10: owaspTop10Info,
            location: [],
            other: this.getOtherInfo()
        };

        return vulnDetails;
    }
}
