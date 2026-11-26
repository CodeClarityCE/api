import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
} from "./integrations/integration-credentials";
import { TicketsController } from "./tickets.controller";

// Where @nestjs/swagger keeps a handler's documented parameters.
const API_PARAMETERS = "swagger/apiParameters";

const HIERARCHY_HANDLERS = [
  "getWorkspaces",
  "getSpaces",
  "getFolders",
  "getLists",
  "createSpace",
  "createFolder",
  "createList",
  "createFolderlessList",
] as const;

describe("TicketsController OpenAPI headers", () => {
  it.each(HIERARCHY_HANDLERS)(
    "%s documents both optional credential headers",
    (handler) => {
      const params = Reflect.getMetadata(
        API_PARAMETERS,
        TicketsController.prototype[handler],
      ) as { name: string; in: string }[];

      expect(params.filter((p) => p.in === "header")).toEqual([
        {
          name: ACCESS_TOKEN_HEADER,
          in: "header",
          required: false,
          schema: { type: "string" },
        },
        {
          name: API_KEY_HEADER,
          in: "header",
          required: false,
          schema: { type: "string" },
        },
      ]);
    },
  );
});
