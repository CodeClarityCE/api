export interface CVSS2 {
    base_score: number;
    exploitability_score: number;
    impact_score: number;

    access_vector: string;
    access_complexity: string;
    confidentiality_impact: string;
    availability_impact: string;
    integrity_impact: string;
    authentication: string;
    user_interaction_required?: boolean;
}

export interface CVSS3 {
    base_score: number;
    exploitability_score: number;
    impact_score: number;

    attack_vector: string;
    attack_complexity: string;
    confidentiality_impact: string;
    availability_impact: string;
    integrity_impact: string;
    user_interaction: string;
    scope: string;
    privileges_required: string;
}

export interface CVSS31 {
    base_score: number;
    exploitability_score: number;
    impact_score: number;

    attack_vector: string;
    attack_complexity: string;
    confidentiality_impact: string;
    availability_impact: string;
    integrity_impact: string;
    user_interaction: string;
    scope: string;
    privileges_required: string;
}
