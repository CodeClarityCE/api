import { SetMetadata } from "@nestjs/common";

import type { OrganizationTokenScope } from "src/base_modules/organizations/tokens/organization-token.types";

export const ORGANIZATION_TOKEN_SCOPE_KEY = "ORGANIZATION_TOKEN_SCOPE";

/** Lets an Organization token with this scope call the route; tokens are refused everywhere else. */
export const AllowOrganizationToken = (
  scope: OrganizationTokenScope,
): ReturnType<typeof SetMetadata> =>
  SetMetadata(ORGANIZATION_TOKEN_SCOPE_KEY, scope);
