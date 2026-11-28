import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiSecurity } from "@nestjs/swagger";

/** Documents the two ways in: a web sign-in's cookie with the CSRF header, or an Organization token. */
export function ApiAuthentication(): ClassDecorator & MethodDecorator {
  return applyDecorators(
    ApiSecurity({ cookie: [], "csrf-header": [] }),
    ApiBearerAuth(),
  );
}
