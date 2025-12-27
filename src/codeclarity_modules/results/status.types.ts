export interface StatusError {
  type: string;
  description: string;
}

export interface StatusResponse {
  stage_start?: string;
  stage_end?: string;
  public_errors?: StatusError[];
  private_errors?: StatusError[];
}
