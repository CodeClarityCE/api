export interface AnalysisStartMessageCreate {
    analysis_id: string;
    integration_id: string | null;
    organization_id: string;
}

export interface DispatcherPluginMessage {
    Data: any;
    AnalysisId: string;
    ProjectId: string;
}
