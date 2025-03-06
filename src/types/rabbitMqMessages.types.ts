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
}

/**
 * Represents a message sent by a dispatcher plugin to another entity.
 */
export interface DispatcherPluginMessage {
  /**
   * Arbitrary data associated with this message (type determined at runtime).
   */
    Data: any;

  /**
   * The ID of the analysis related to this message.
   */
    AnalysisId: string;

  /**
   * The ID of the project related to this message.
   */
    ProjectId: string;
}