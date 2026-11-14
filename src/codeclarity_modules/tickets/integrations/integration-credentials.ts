import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import {
  ClickUpAuthMethod,
  type ClickUpConfig,
  type IntegrationConfig,
} from "../ticket-integration-config.entity";

/** Credentials sent with a request to use instead of the saved ones; never stored. */
export interface IntegrationCredentials {
  api_key?: string | undefined;
  access_token?: string | undefined;
}

export const API_KEY_HEADER = "x-integration-api-key";
export const ACCESS_TOKEN_HEADER = "x-integration-access-token";

// Reads unsaved credentials from the request headers, if any were sent.
export const RequestCredentials = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): IntegrationCredentials | undefined => {
    const headers = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>().headers;
    const read = (name: string): string | undefined => {
      const value = headers[name];
      return typeof value === "string" && value !== "" ? value : undefined;
    };
    const credentials = {
      api_key: read(API_KEY_HEADER),
      access_token: read(ACCESS_TOKEN_HEADER),
    };
    return hasCredentials(credentials) ? credentials : undefined;
  },
);

export function hasCredentials(
  credentials: IntegrationCredentials | undefined,
): credentials is IntegrationCredentials {
  return !!(credentials?.api_key ?? credentials?.access_token);
}

// Lays the given credentials over a saved config, dropping the other auth method's token.
export function withCredentials(
  saved: IntegrationConfig | undefined,
  credentials: IntegrationCredentials,
): IntegrationConfig {
  const auth: Partial<ClickUpConfig> = credentials.access_token
    ? {
        auth_method: ClickUpAuthMethod.OAUTH,
        access_token: credentials.access_token,
        api_key: undefined,
        refresh_token: undefined,
      }
    : {
        auth_method: ClickUpAuthMethod.API_KEY,
        api_key: credentials.api_key,
        access_token: undefined,
        refresh_token: undefined,
      };
  return { ...saved, ...auth } as IntegrationConfig;
}
