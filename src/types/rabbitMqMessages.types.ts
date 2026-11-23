/**
 * Represents a message used to create an analysis start.
 */
export interface AnalysisStartMessageCreate {
  /**
   * The ID of the analysis being started.
   */
  analysis_id: string;

  /**
   * The ID of the integration associated with this analysis (may be null).
   */
  integration_id: string | null;

  /**
   * The ID of the organization owning this analysis.
   */
  organization_id: string;

  /**
   * The ID of the project this analysis belongs to.
   */
  project_id: string;
}
