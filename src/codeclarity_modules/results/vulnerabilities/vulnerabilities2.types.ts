import type { CVSS2, CVSS3, CVSS31 } from '../../knowledge/cvss.types';
import type { OwaspTop10Info } from '../../knowledge/owasp/owasp.types';
import type { PatchInfo } from '../patching/patching.types';
import type { ParsedGitUrl } from '../sbom/sbom.types';

export interface VulnSourceInfo {
    name: string;
    vuln_url: string;
}

export interface VulnerabilityInfo {
    vulnerability_id: string;
    description: string;
    version_info: VersionInfo;
    published: string;
    last_modified: string;
    sources: VulnSourceInfo[];
    aliases: string[];
}

export interface VersionInfo {
    affected_versions_string: string;
    patched_versions_string: string;
    versions: VulnerableVersionInfo[];
    source_comparison?: {
        nvd: string;
        osv: string;
        agree: boolean;
        nvdReason: string;
        osvReason: string;
        nvdAllVersions: string;
        osvAllVersions: string;
    };
}

export interface VulnerableVersionInfo {
    version: string;
    status: string;
}

export interface DependencyInfo {
    name: string;
    published: string;
    description: string;
    keywords: string[];
    version: string;
    package_manager_links: PackageManagerLink[];
    github_link?: ParsedGitUrl;
    issues_link?: string;
    homepage?: string;
}

export interface PackageManagerLink {
    package_manager: string;
    url: string;
}

export interface SeverityInfo {
    cvss_31?: CVSS31;
    cvss_3?: CVSS3;
    cvss_2?: CVSS2;
}

export interface OwaspInfo {
    name: string;
    description: string;
}

export interface WeaknessInfo {
    id: string;
    name: string;
    description: string;
}

export interface CommonConsequencesInfo {
    scope: string[];
    impact: string[];
    description: string;
}

export interface ReferenceInfo {
    url: string;
    tags: string[];
}

export interface OtherInfo {
    package_manager: string;
}

export interface VulnerabilityDetails {
    vulnerability_info: VulnerabilityInfo;
    dependency_info?: DependencyInfo;
    severities: SeverityInfo;
    owasp_top_10: OwaspTop10Info | null;
    weaknesses: WeaknessInfo[];
    patch: PatchInfo;
    common_consequences: Record<string, CommonConsequencesInfo[]>;
    references: ReferenceInfo[];
    location: string[];
    other: OtherInfo;
}

export interface AnalysisStats {
    number_of_issues: number;
    number_of_vulnerabilities: number;
    number_of_vulnerable_dependencies: number;
    number_of_direct_vulnerabilities: number;
    number_of_transitive_vulnerabilities: number;

    mean_severity: number;
    max_severity: number;

    number_of_owasp_top_10_2021_a1: number;
    number_of_owasp_top_10_2021_a2: number;
    number_of_owasp_top_10_2021_a3: number;
    number_of_owasp_top_10_2021_a4: number;
    number_of_owasp_top_10_2021_a5: number;
    number_of_owasp_top_10_2021_a6: number;
    number_of_owasp_top_10_2021_a7: number;
    number_of_owasp_top_10_2021_a8: number;
    number_of_owasp_top_10_2021_a9: number;
    number_of_owasp_top_10_2021_a10: number;

    number_of_critical: number;
    number_of_high: number;
    number_of_medium: number;
    number_of_low: number;
    number_of_none: number;

    mean_confidentiality_impact: number;
    mean_integrity_impact: number;
    mean_availability_impact: number;

    number_of_vulnerabilities_diff: number;
    number_of_vulnerable_dependencies_diff: number;
    number_of_direct_vulnerabilities_diff: number;
    number_of_transitive_vulnerabilities_diff: number;

    mean_severity_diff: number;
    max_severity_diff: number;

    number_of_owasp_top_10_2021_a1_diff: number;
    number_of_owasp_top_10_2021_a2_diff: number;
    number_of_owasp_top_10_2021_a3_diff: number;
    number_of_owasp_top_10_2021_a4_diff: number;
    number_of_owasp_top_10_2021_a5_diff: number;
    number_of_owasp_top_10_2021_a6_diff: number;
    number_of_owasp_top_10_2021_a7_diff: number;
    number_of_owasp_top_10_2021_a8_diff: number;
    number_of_owasp_top_10_2021_a9_diff: number;
    number_of_owasp_top_10_2021_a10_diff: number;

    number_of_critical_diff: number;
    number_of_high_diff: number;
    number_of_medium_diff: number;
    number_of_low_diff: number;
    number_of_none_diff: number;

    mean_confidentiality_impact_diff: number;
    mean_integrity_impact_diff: number;
    mean_availability_impact_diff: number;
}

export function newAnalysisStats(): AnalysisStats {
    return {
        number_of_issues: 0,
        number_of_vulnerabilities: 0,
        number_of_vulnerable_dependencies: 0,
        number_of_direct_vulnerabilities: 0,
        number_of_transitive_vulnerabilities: 0,
        mean_severity: 0,
        max_severity: 0,
        number_of_owasp_top_10_2021_a1: 0,
        number_of_owasp_top_10_2021_a2: 0,
        number_of_owasp_top_10_2021_a3: 0,
        number_of_owasp_top_10_2021_a4: 0,
        number_of_owasp_top_10_2021_a5: 0,
        number_of_owasp_top_10_2021_a6: 0,
        number_of_owasp_top_10_2021_a7: 0,
        number_of_owasp_top_10_2021_a8: 0,
        number_of_owasp_top_10_2021_a9: 0,
        number_of_owasp_top_10_2021_a10: 0,
        number_of_critical: 0,
        number_of_high: 0,
        number_of_medium: 0,
        number_of_low: 0,
        number_of_none: 0,
        mean_confidentiality_impact: 0,
        mean_integrity_impact: 0,
        mean_availability_impact: 0,

        number_of_vulnerabilities_diff: 0,
        number_of_vulnerable_dependencies_diff: 0,
        number_of_direct_vulnerabilities_diff: 0,
        number_of_transitive_vulnerabilities_diff: 0,
        mean_severity_diff: 0,
        max_severity_diff: 0,
        number_of_owasp_top_10_2021_a1_diff: 0,
        number_of_owasp_top_10_2021_a2_diff: 0,
        number_of_owasp_top_10_2021_a3_diff: 0,
        number_of_owasp_top_10_2021_a4_diff: 0,
        number_of_owasp_top_10_2021_a5_diff: 0,
        number_of_owasp_top_10_2021_a6_diff: 0,
        number_of_owasp_top_10_2021_a7_diff: 0,
        number_of_owasp_top_10_2021_a8_diff: 0,
        number_of_owasp_top_10_2021_a9_diff: 0,
        number_of_owasp_top_10_2021_a10_diff: 0,
        number_of_critical_diff: 0,
        number_of_high_diff: 0,
        number_of_medium_diff: 0,
        number_of_low_diff: 0,
        number_of_none_diff: 0,
        mean_confidentiality_impact_diff: 0,
        mean_integrity_impact_diff: 0,
        mean_availability_impact_diff: 0
    };
}
