import {
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import { isUUID } from "class-validator";

import { ValidationFailed } from "src/types/error.types";

// Route parameters that always hold a uuid.
const UUID_ROUTE_PARAMS = new Set([
  "org_id",
  "project_id",
  "analysis_id",
  "policy_id",
]);

/** Rejects a malformed id in the route with a 400 before it reaches the database. */
@Injectable()
export class IdParamPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (
      metadata.type !== "param" ||
      metadata.data === undefined ||
      !UUID_ROUTE_PARAMS.has(metadata.data) ||
      (typeof value === "string" && isUUID(value))
    ) {
      return value;
    }
    throw new ValidationFailed([
      {
        property: metadata.data,
        constraints: { isUuid: `${metadata.data} must be a UUID` },
        children: [],
      },
    ]);
  }
}
