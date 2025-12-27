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

export interface CVSS4 {
  base_score: number;

  // Base Metrics - Exploitability
  attack_vector: string;
  attack_complexity: string;
  attack_requirements: string;
  privileges_required: string;
  user_interaction: string;

  // Base Metrics - Vulnerable System Impact
  confidentiality_impact_vulnerable: string;
  integrity_impact_vulnerable: string;
  availability_impact_vulnerable: string;

  // Base Metrics - Subsequent System Impact
  confidentiality_impact_subsequent: string;
  integrity_impact_subsequent: string;
  availability_impact_subsequent: string;

  // Threat Metric
  exploit_maturity?: string;

  // Supplemental Metrics (informational, do not affect score)
  safety?: string;
  automatable?: string;
  recovery?: string;
  value_density?: string;
  response_effort?: string;
  provider_urgency?: string;
}
