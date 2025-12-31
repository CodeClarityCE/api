import {
  type Ticket,
  TicketPriority,
  type TicketStatus,
} from "../ticket.entity";
import { type ExternalTicketProvider } from "../ticket-external-link.entity";
import { type IntegrationConfig } from "../ticket-integration-config.entity";

/**
 * Result returned when creating an external ticket
 */
export interface ExternalTicketResult {
  external_id: string;
  external_url: string;
}

/**
 * Result returned from OAuth token exchange
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}

/**
 * Workspace/team information from external provider
 */
export interface ExternalWorkspace {
  id: string;
  name: string;
}

/**
 * Space/project information from external provider
 */
export interface ExternalSpace {
  id: string;
  name: string;
}

/**
 * Folder information from external provider
 */
export interface ExternalFolder {
  id: string;
  name: string;
}

/**
 * List information from external provider
 */
export interface ExternalList {
  id: string;
  name: string;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  user_info?: {
    id: string;
    name: string;
    email?: string;
  };
}

/**
 * Interface for external ticket integration providers.
 * Implement this interface to add support for new providers (ClickUp, Jira, Linear, etc.)
 */
export interface ITicketIntegrationProvider {
  /**
   * Provider identifier
   */
  readonly name: ExternalTicketProvider;

  /**
   * Validate the provider-specific configuration
   * @param config The configuration to validate
   * @returns True if valid, throws an error if invalid
   */
  validateConfig(config: IntegrationConfig): Promise<boolean>;

  /**
   * Test the connection with the given configuration
   * @param config The configuration to test
   * @returns Connection test result
   */
  testConnection(config: IntegrationConfig): Promise<ConnectionTestResult>;

  /**
   * Create a ticket in the external system
   * @param ticket The CodeClarity ticket to create externally
   * @param config The integration configuration
   * @returns The external ticket ID and URL
   */
  createExternalTicket(
    ticket: Ticket,
    config: IntegrationConfig,
  ): Promise<ExternalTicketResult>;

  /**
   * Update a ticket in the external system
   * @param ticket The updated CodeClarity ticket
   * @param externalId The external ticket ID
   * @param config The integration configuration
   */
  updateExternalTicket(
    ticket: Ticket,
    externalId: string,
    config: IntegrationConfig,
  ): Promise<void>;

  /**
   * Update only the status of a ticket in the external system
   * @param status The new status
   * @param externalId The external ticket ID
   * @param config The integration configuration
   */
  updateExternalTicketStatus(
    status: TicketStatus,
    externalId: string,
    config: IntegrationConfig,
  ): Promise<void>;

  /**
   * Delete a ticket from the external system
   * @param externalId The external ticket ID
   * @param config The integration configuration
   */
  deleteExternalTicket(
    externalId: string,
    config: IntegrationConfig,
  ): Promise<void>;

  /**
   * Get the current status of an external ticket (for pull-based sync)
   * @param externalId The external ticket ID
   * @param config The integration configuration
   * @returns The mapped status, external status string, and whether it's archived
   */
  getExternalTaskStatus?(
    externalId: string,
    config: IntegrationConfig,
  ): Promise<{
    status: TicketStatus;
    externalStatus: string;
    archived: boolean;
  }>;

  // OAuth methods (optional - only for providers that support OAuth)

  /**
   * Get the OAuth authorization URL
   * @param redirectUri The callback URL after authorization
   * @param state State parameter for CSRF protection
   * @returns The authorization URL
   */
  getAuthUrl?(redirectUri: string, state: string): string;

  /**
   * Exchange an authorization code for access tokens
   * @param code The authorization code
   * @param redirectUri The callback URL (must match the one used in getAuthUrl)
   * @returns The access and refresh tokens
   */
  exchangeCodeForToken?(
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokenResponse>;

  /**
   * Refresh an expired access token
   * @param refreshToken The refresh token
   * @returns New access and refresh tokens
   */
  refreshToken?(refreshToken: string): Promise<OAuthTokenResponse>;

  // Hierarchy methods (for fetching workspaces, lists, etc.)

  /**
   * Get available workspaces/teams
   * @param config The integration configuration (with auth)
   */
  getWorkspaces?(config: IntegrationConfig): Promise<ExternalWorkspace[]>;

  /**
   * Get spaces within a workspace
   * @param workspaceId The workspace ID
   * @param config The integration configuration
   */
  getSpaces?(
    workspaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalSpace[]>;

  /**
   * Get folders within a space
   * @param spaceId The space ID
   * @param config The integration configuration
   */
  getFolders?(
    spaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalFolder[]>;

  /**
   * Get lists within a folder or space
   * @param parentId The folder ID or space ID
   * @param config The integration configuration
   */
  getLists?(
    parentId: string,
    config: IntegrationConfig,
  ): Promise<ExternalList[]>;

  // Hierarchy creation methods (for creating workspaces, lists, etc.)

  /**
   * Create a space within a workspace
   * @param name The name of the space
   * @param workspaceId The workspace ID
   * @param config The integration configuration
   */
  createSpace?(
    name: string,
    workspaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalSpace>;

  /**
   * Create a folder within a space
   * @param name The name of the folder
   * @param spaceId The space ID
   * @param config The integration configuration
   */
  createFolder?(
    name: string,
    spaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalFolder>;

  /**
   * Create a list within a folder
   * @param name The name of the list
   * @param folderId The folder ID
   * @param config The integration configuration
   */
  createList?(
    name: string,
    folderId: string,
    config: IntegrationConfig,
  ): Promise<ExternalList>;

  /**
   * Create a folderless list directly in a space
   * @param name The name of the list
   * @param spaceId The space ID
   * @param config The integration configuration
   */
  createFolderlessList?(
    name: string,
    spaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalList>;
}

/**
 * Map CodeClarity priority to external provider priority value
 */
export function mapPriorityToExternal(
  priority: TicketPriority,
  mapping?: Record<string, number | string>,
): number | string {
  if (mapping?.[priority] !== undefined) {
    return mapping[priority];
  }

  // Default mappings (ClickUp-style: 1=Urgent, 2=High, 3=Normal, 4=Low)
  const defaultMapping: Record<TicketPriority, number> = {
    [TicketPriority.CRITICAL]: 1,
    [TicketPriority.HIGH]: 2,
    [TicketPriority.MEDIUM]: 3,
    [TicketPriority.LOW]: 4,
  };

  return defaultMapping[priority];
}

/**
 * Map external provider status to CodeClarity status
 */
export function mapStatusFromExternal(
  externalStatus: string,
  mapping?: Record<string, TicketStatus>,
): TicketStatus | undefined {
  if (mapping?.[externalStatus]) {
    return mapping[externalStatus];
  }
  return undefined;
}

/**
 * Format ticket description for external systems with Markdown support
 */
export function formatTicketDescription(ticket: Ticket): string {
  const sections: string[] = [];

  sections.push(ticket.description);
  sections.push("");
  sections.push("---");
  sections.push("");
  sections.push("**Vulnerability Details**");

  if (ticket.vulnerability_id) {
    sections.push(`- **CVE/ID**: ${ticket.vulnerability_id}`);
  }

  if (ticket.affected_package) {
    sections.push(`- **Package**: ${ticket.affected_package}`);
  }

  if (ticket.affected_version) {
    sections.push(`- **Version**: ${ticket.affected_version}`);
  }

  if (ticket.severity_score !== undefined) {
    sections.push(`- **CVSS Score**: ${ticket.severity_score.toFixed(1)}`);
  }

  if (ticket.severity_class) {
    sections.push(`- **Severity**: ${ticket.severity_class}`);
  }

  if (ticket.recommended_version) {
    sections.push(`- **Recommended Version**: ${ticket.recommended_version}`);
  }

  if (ticket.remediation_notes) {
    sections.push("");
    sections.push("**Remediation Notes**");
    sections.push(ticket.remediation_notes);
  }

  sections.push("");
  sections.push("---");
  sections.push("*Created by [CodeClarity](https://codeclarity.io)*");

  return sections.join("\n");
}
