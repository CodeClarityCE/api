export interface PatchInfo {
    affected_deps: string[];
    affected_dep_name: string;
    occurance_count: number;
    patchable_occurances_count: number;
    unpatchable_occurances_count: number;
    vulnerability_id: string;
    introduction_type: string;
    patch_type: string;
    vulnerability_info: VulnerabilitySummary;
    patches: Record<string, unknown>;
}

export interface VulnerabilitySummary {
    Severity: string;
    Weaknesses?: string[];
}

export interface AnalysisStats {
    before_patch_number_of_issues: number;
    before_patch_number_of_vulnerabilities: number;
    before_patch_number_of_vulnerable_dependencies: number;
    before_patch_number_of_direct_vulnerabilities: number;
    before_patch_number_of_transitive_vulnerabilities: number;

    before_patch_mean_severity: number;
    before_patch_max_severity: number;

    before_patch_number_of_critical: number;
    before_patch_number_of_high: number;
    before_patch_number_of_medium: number;
    before_patch_number_of_low: number;
    before_patch_number_of_none: number;

    before_patch_overall_confidentiality_impact: number;
    before_patch_overall_integrity_impact: number;
    before_patch_overall_availability_impact: number;

    after_patch_number_of_issues: number;
    after_patch_number_of_vulnerabilities: number;
    after_patch_number_of_vulnerable_dependencies: number;
    after_patch_number_of_direct_vulnerabilities: number;
    after_patch_number_of_transitive_vulnerabilities: number;

    after_patch_mean_severity: number;
    after_patch_max_severity: number;

    after_patch_number_of_critical: number;
    after_patch_number_of_high: number;
    after_patch_number_of_medium: number;
    after_patch_number_of_low: number;
    after_patch_number_of_none: number;

    after_patch_overall_confidentiality_impact: number;
    after_patch_overall_integrity_impact: number;
    after_patch_overall_availability_impact: number;
}

export function newAnalysisStats(): AnalysisStats {
    return {
        before_patch_number_of_issues: 0,
        before_patch_number_of_vulnerabilities: 0,
        before_patch_number_of_vulnerable_dependencies: 0,
        before_patch_number_of_direct_vulnerabilities: 0,
        before_patch_number_of_transitive_vulnerabilities: 0,

        before_patch_mean_severity: 0,
        before_patch_max_severity: 0,

        before_patch_number_of_critical: 0,
        before_patch_number_of_high: 0,
        before_patch_number_of_medium: 0,
        before_patch_number_of_low: 0,
        before_patch_number_of_none: 0,

        before_patch_overall_confidentiality_impact: 0,
        before_patch_overall_integrity_impact: 0,
        before_patch_overall_availability_impact: 0,

        after_patch_number_of_issues: 0,
        after_patch_number_of_vulnerabilities: 0,
        after_patch_number_of_vulnerable_dependencies: 0,
        after_patch_number_of_direct_vulnerabilities: 0,
        after_patch_number_of_transitive_vulnerabilities: 0,

        after_patch_mean_severity: 0,
        after_patch_max_severity: 0,

        after_patch_number_of_critical: 0,
        after_patch_number_of_high: 0,
        after_patch_number_of_medium: 0,
        after_patch_number_of_low: 0,
        after_patch_number_of_none: 0,

        after_patch_overall_confidentiality_impact: 0,
        after_patch_overall_integrity_impact: 0,
        after_patch_overall_availability_impact: 0
    };
}
