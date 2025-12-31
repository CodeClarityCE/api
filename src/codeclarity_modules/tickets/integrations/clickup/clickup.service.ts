import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Ticket, TicketPriority, TicketStatus } from "../../ticket.entity";
import { ExternalTicketProvider } from "../../ticket-external-link.entity";
import {
  ClickUpAuthMethod,
  ClickUpConfig,
  IntegrationConfig,
} from "../../ticket-integration-config.entity";
import {
  ConnectionTestResult,
  ExternalFolder,
  ExternalList,
  ExternalSpace,
  ExternalTicketResult,
  ExternalWorkspace,
  formatTicketDescription,
  ITicketIntegrationProvider,
  OAuthTokenResponse,
} from "../integration-provider.interface";

import {
  CLICKUP_API_BASE_URL,
  CLICKUP_OAUTH_URL,
  ClickUpAuthorizedUserResponse,
  ClickUpCreateFolderRequest,
  ClickUpCreateListRequest,
  ClickUpCreateSpaceRequest,
  ClickUpCreateTaskRequest,
  ClickUpFolder,
  ClickUpFoldersResponse,
  ClickUpList,
  ClickUpListsResponse,
  ClickUpOAuthTokenResponse,
  ClickUpPriorityValue,
  ClickUpSpace,
  ClickUpSpacesResponse,
  ClickUpTask,
  ClickUpTeamsResponse,
  ClickUpUpdateTaskRequest,
} from "./clickup.types";

/**
 * ClickUp integration provider.
 * Supports both API key and OAuth authentication.
 */
@Injectable()
export class ClickUpService implements ITicketIntegrationProvider {
  private readonly logger = new Logger(ClickUpService.name);
  readonly name = ExternalTicketProvider.CLICKUP;

  private clientId?: string;
  private clientSecret?: string;

  constructor(private readonly configService: ConfigService) {
    // OAuth credentials (optional - only needed for OAuth flow)
    const clientId = this.configService.get<string>("CLICKUP_CLIENT_ID");
    const clientSecret = this.configService.get<string>(
      "CLICKUP_CLIENT_SECRET",
    );
    if (clientId) this.clientId = clientId;
    if (clientSecret) this.clientSecret = clientSecret;
  }

  // ============================================
  // Configuration Validation
  // ============================================

  async validateConfig(config: IntegrationConfig): Promise<boolean> {
    const clickUpConfig = config as ClickUpConfig;

    if (!clickUpConfig.auth_method) {
      throw new BadRequestException("auth_method is required");
    }

    if (clickUpConfig.auth_method === ClickUpAuthMethod.API_KEY) {
      if (!clickUpConfig.api_key) {
        throw new BadRequestException(
          "api_key is required for API Key authentication",
        );
      }
    } else if (clickUpConfig.auth_method === ClickUpAuthMethod.OAUTH) {
      if (!clickUpConfig.access_token) {
        throw new BadRequestException(
          "access_token is required for OAuth authentication",
        );
      }
    }

    if (!clickUpConfig.list_id) {
      throw new BadRequestException("list_id is required");
    }

    return true;
  }

  // ============================================
  // Connection Testing
  // ============================================

  async testConnection(
    config: IntegrationConfig,
  ): Promise<ConnectionTestResult> {
    const clickUpConfig = config as ClickUpConfig;

    try {
      const response = await this.makeRequest<ClickUpAuthorizedUserResponse>(
        "/user",
        clickUpConfig,
      );

      return {
        success: true,
        user_info: {
          id: response.user.id.toString(),
          name: response.user.username,
          email: response.user.email,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  // ============================================
  // OAuth Flow
  // ============================================

  getAuthUrl(redirectUri: string, state: string): string {
    if (!this.clientId) {
      throw new BadRequestException("ClickUp OAuth is not configured");
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
    });

    return `${CLICKUP_OAUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(
    code: string,
    _redirectUri: string,
  ): Promise<OAuthTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException("ClickUp OAuth is not configured");
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
    });

    // Token endpoint is on api.clickup.com, not app.clickup.com
    const response = await fetch(
      `${CLICKUP_API_BASE_URL}/oauth/token?${params.toString()}`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(`OAuth token exchange failed: ${error}`);
    }

    const data = (await response.json()) as ClickUpOAuthTokenResponse;

    return {
      access_token: data.access_token,
      token_type: data.token_type,
    };
  }

  // Note: ClickUp OAuth tokens don't expire, so no refreshToken implementation needed

  // ============================================
  // Hierarchy Fetching
  // ============================================

  async getWorkspaces(config: IntegrationConfig): Promise<ExternalWorkspace[]> {
    const clickUpConfig = config as ClickUpConfig;
    const response = await this.makeRequest<ClickUpTeamsResponse>(
      "/team",
      clickUpConfig,
    );

    return response.teams.map((team) => ({
      id: team.id,
      name: team.name,
    }));
  }

  async getSpaces(
    workspaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalSpace[]> {
    const clickUpConfig = config as ClickUpConfig;
    const response = await this.makeRequest<ClickUpSpacesResponse>(
      `/team/${workspaceId}/space?archived=false`,
      clickUpConfig,
    );

    return response.spaces.map((space) => ({
      id: space.id,
      name: space.name,
    }));
  }

  async getFolders(
    spaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalFolder[]> {
    const clickUpConfig = config as ClickUpConfig;
    const response = await this.makeRequest<ClickUpFoldersResponse>(
      `/space/${spaceId}/folder?archived=false`,
      clickUpConfig,
    );

    return response.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
    }));
  }

  async getLists(
    parentId: string,
    config: IntegrationConfig,
  ): Promise<ExternalList[]> {
    const clickUpConfig = config as ClickUpConfig;

    // Try as folder first, then as space (folderless lists)
    let lists: ExternalList[] = [];

    try {
      const folderResponse = await this.makeRequest<ClickUpListsResponse>(
        `/folder/${parentId}/list?archived=false`,
        clickUpConfig,
      );
      lists = folderResponse.lists.map((list) => ({
        id: list.id,
        name: list.name,
      }));
    } catch {
      // If folder fails, try as space (for folderless lists)
      const spaceResponse = await this.makeRequest<ClickUpListsResponse>(
        `/space/${parentId}/list?archived=false`,
        clickUpConfig,
      );
      lists = spaceResponse.lists.map((list) => ({
        id: list.id,
        name: list.name,
      }));
    }

    return lists;
  }

  // ============================================
  // Hierarchy Creation
  // ============================================

  async createSpace(
    name: string,
    workspaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalSpace> {
    const clickUpConfig = config as ClickUpConfig;

    const requestData: ClickUpCreateSpaceRequest = {
      name,
      multiple_assignees: true,
      features: {
        due_dates: { enabled: true },
        time_tracking: { enabled: true },
        tags: { enabled: true },
        custom_fields: { enabled: true },
      },
    };

    const response = await this.makeRequest<ClickUpSpace>(
      `/team/${workspaceId}/space`,
      clickUpConfig,
      "POST",
      requestData,
    );

    this.logger.log(`Created ClickUp space: ${response.id} - ${response.name}`);

    return {
      id: response.id,
      name: response.name,
    };
  }

  async createFolder(
    name: string,
    spaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalFolder> {
    const clickUpConfig = config as ClickUpConfig;

    const requestData: ClickUpCreateFolderRequest = {
      name,
    };

    const response = await this.makeRequest<ClickUpFolder>(
      `/space/${spaceId}/folder`,
      clickUpConfig,
      "POST",
      requestData,
    );

    this.logger.log(
      `Created ClickUp folder: ${response.id} - ${response.name}`,
    );

    return {
      id: response.id,
      name: response.name,
    };
  }

  async createList(
    name: string,
    folderId: string,
    config: IntegrationConfig,
  ): Promise<ExternalList> {
    const clickUpConfig = config as ClickUpConfig;

    const requestData: ClickUpCreateListRequest = {
      name,
    };

    const response = await this.makeRequest<ClickUpList>(
      `/folder/${folderId}/list`,
      clickUpConfig,
      "POST",
      requestData,
    );

    this.logger.log(`Created ClickUp list: ${response.id} - ${response.name}`);

    return {
      id: response.id,
      name: response.name,
    };
  }

  async createFolderlessList(
    name: string,
    spaceId: string,
    config: IntegrationConfig,
  ): Promise<ExternalList> {
    const clickUpConfig = config as ClickUpConfig;

    const requestData: ClickUpCreateListRequest = {
      name,
    };

    const response = await this.makeRequest<ClickUpList>(
      `/space/${spaceId}/list`,
      clickUpConfig,
      "POST",
      requestData,
    );

    this.logger.log(
      `Created ClickUp folderless list: ${response.id} - ${response.name}`,
    );

    return {
      id: response.id,
      name: response.name,
    };
  }

  // ============================================
  // Ticket Operations
  // ============================================

  async createExternalTicket(
    ticket: Ticket,
    config: IntegrationConfig,
  ): Promise<ExternalTicketResult> {
    const clickUpConfig = config as ClickUpConfig;

    const priority = this.mapPriority(
      ticket.priority,
      clickUpConfig.priority_mapping,
    );
    const description = formatTicketDescription(ticket);

    const taskData: ClickUpCreateTaskRequest = {
      name: ticket.title,
      markdown_description: description,
      priority,
      tags: this.buildTags(ticket),
      notify_all: false,
    };

    if (ticket.due_date) {
      taskData.due_date = ticket.due_date.getTime();
      taskData.due_date_time = true;
    }

    const response = await this.makeRequest<ClickUpTask>(
      `/list/${clickUpConfig.list_id}/task`,
      clickUpConfig,
      "POST",
      taskData,
    );

    this.logger.log(`Created ClickUp task: ${response.id}`);

    return {
      external_id: response.id,
      external_url: response.url,
    };
  }

  async updateExternalTicket(
    ticket: Ticket,
    externalId: string,
    config: IntegrationConfig,
  ): Promise<void> {
    const clickUpConfig = config as ClickUpConfig;

    const priority = this.mapPriority(
      ticket.priority,
      clickUpConfig.priority_mapping,
    );
    const description = formatTicketDescription(ticket);

    const updateData: ClickUpUpdateTaskRequest = {
      name: ticket.title,
      markdown_description: description,
      priority,
    };

    if (ticket.due_date) {
      updateData.due_date = ticket.due_date.getTime();
      updateData.due_date_time = true;
    } else {
      updateData.due_date = null;
    }

    await this.makeRequest<ClickUpTask>(
      `/task/${externalId}`,
      clickUpConfig,
      "PUT",
      updateData,
    );

    this.logger.log(`Updated ClickUp task: ${externalId}`);
  }

  async updateExternalTicketStatus(
    status: TicketStatus,
    externalId: string,
    config: IntegrationConfig,
  ): Promise<void> {
    const clickUpConfig = config as ClickUpConfig;

    // Map CodeClarity status to ClickUp status name
    const clickUpStatus = this.mapStatus(status);

    const updateData: ClickUpUpdateTaskRequest = {
      status: clickUpStatus,
    };

    // Archive in ClickUp only for CLOSED and WONT_FIX (not RESOLVED)
    // RESOLVED stays visible as "complete", CLOSED/WONT_FIX get archived
    if (status === TicketStatus.CLOSED || status === TicketStatus.WONT_FIX) {
      updateData.archived = true;
    }

    await this.makeRequest<ClickUpTask>(
      `/task/${externalId}`,
      clickUpConfig,
      "PUT",
      updateData,
    );

    this.logger.log(
      `Updated ClickUp task ${externalId} status to: ${clickUpStatus}`,
    );
  }

  async deleteExternalTicket(
    externalId: string,
    config: IntegrationConfig,
  ): Promise<void> {
    const clickUpConfig = config as ClickUpConfig;

    await this.makeRequest<void>(
      `/task/${externalId}`,
      clickUpConfig,
      "DELETE",
    );

    this.logger.log(`Deleted ClickUp task: ${externalId}`);
  }

  /**
   * Get external task status from ClickUp
   * Returns the mapped CodeClarity status and the external task details
   */
  async getExternalTaskStatus(
    externalId: string,
    config: IntegrationConfig,
  ): Promise<{
    status: TicketStatus;
    externalStatus: string;
    archived: boolean;
  }> {
    const clickUpConfig = config as ClickUpConfig;

    const task = await this.makeRequest<ClickUpTask>(
      `/task/${externalId}`,
      clickUpConfig,
      "GET",
    );

    const externalStatus = task.status?.status?.toLowerCase() ?? "";
    const mappedStatus = this.mapClickUpStatusToCodeClarity(
      externalStatus,
      task.archived ?? false,
    );

    this.logger.log(
      `Fetched ClickUp task ${externalId}: status="${externalStatus}", archived=${task.archived}, mapped="${mappedStatus}"`,
    );

    return {
      status: mappedStatus,
      externalStatus: task.status?.status ?? "unknown",
      archived: task.archived ?? false,
    };
  }

  /**
   * Map ClickUp status to CodeClarity status
   */
  mapClickUpStatusToCodeClarity(
    clickUpStatus: string,
    archived: boolean,
  ): TicketStatus {
    const normalizedStatus = clickUpStatus.toLowerCase().trim();

    // If archived, it's either resolved or closed
    if (archived) {
      if (
        normalizedStatus.includes("complete") ||
        normalizedStatus.includes("done")
      ) {
        return TicketStatus.RESOLVED;
      }
      return TicketStatus.CLOSED;
    }

    // Map common ClickUp status names to CodeClarity statuses
    if (
      normalizedStatus.includes("to do") ||
      normalizedStatus.includes("todo") ||
      normalizedStatus.includes("open") ||
      normalizedStatus.includes("backlog")
    ) {
      return TicketStatus.OPEN;
    }

    if (
      normalizedStatus.includes("in progress") ||
      normalizedStatus.includes("doing") ||
      normalizedStatus.includes("working")
    ) {
      return TicketStatus.IN_PROGRESS;
    }

    if (
      normalizedStatus.includes("complete") ||
      normalizedStatus.includes("done") ||
      normalizedStatus.includes("resolved")
    ) {
      return TicketStatus.RESOLVED;
    }

    if (
      normalizedStatus.includes("closed") ||
      normalizedStatus.includes("cancelled") ||
      normalizedStatus.includes("canceled")
    ) {
      return TicketStatus.CLOSED;
    }

    // Default to OPEN if status is unrecognized
    this.logger.warn(
      `Unknown ClickUp status "${clickUpStatus}", defaulting to OPEN`,
    );
    return TicketStatus.OPEN;
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async makeRequest<T>(
    endpoint: string,
    config: ClickUpConfig,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    body?: unknown,
  ): Promise<T> {
    const token = config.access_token ?? config.api_key;
    if (!token) {
      throw new BadRequestException("No authentication token available");
    }

    const headers: Record<string, string> = {
      Authorization: token,
      "Content-Type": "application/json",
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    const url = `${CLICKUP_API_BASE_URL}${endpoint}`;
    this.logger.debug(`ClickUp API: ${method} ${endpoint}`);

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`ClickUp API error: ${response.status} - ${errorText}`);
      throw new BadRequestException(
        `ClickUp API error (${response.status}): ${errorText}`,
      );
    }

    // Handle DELETE with no content
    if (method === "DELETE" && response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  private mapPriority(
    priority: TicketPriority,
    customMapping?: Record<string, number>,
  ): number {
    if (customMapping?.[priority] !== undefined) {
      return customMapping[priority];
    }

    const defaultMapping: Record<TicketPriority, ClickUpPriorityValue> = {
      [TicketPriority.CRITICAL]: ClickUpPriorityValue.URGENT,
      [TicketPriority.HIGH]: ClickUpPriorityValue.HIGH,
      [TicketPriority.MEDIUM]: ClickUpPriorityValue.NORMAL,
      [TicketPriority.LOW]: ClickUpPriorityValue.LOW,
    };

    return defaultMapping[priority];
  }

  private mapStatus(status: TicketStatus): string {
    // ClickUp default statuses: TO DO, IN PROGRESS, COMPLETE
    // Note: ClickUp doesn't have a "closed" status by default, so we map
    // CLOSED and WONT_FIX to "complete" and use the archive flag to distinguish them
    const statusMapping: Record<TicketStatus, string> = {
      [TicketStatus.OPEN]: "to do",
      [TicketStatus.IN_PROGRESS]: "in progress",
      [TicketStatus.RESOLVED]: "complete",
      [TicketStatus.CLOSED]: "complete",
      [TicketStatus.WONT_FIX]: "complete",
    };

    return statusMapping[status];
  }

  private buildTags(ticket: Ticket): string[] {
    const tags: string[] = ["codeclarity", "vulnerability"];

    if (ticket.severity_class) {
      tags.push(ticket.severity_class.toLowerCase());
    }

    if (ticket.vulnerability_id) {
      // Add CVE as a tag if it's a CVE ID
      if (ticket.vulnerability_id.startsWith("CVE-")) {
        tags.push("cve");
      }
    }

    return tags;
  }
}
