import { BadRequestException, NotFoundException } from "@nestjs/common";

import { ExternalTicketProvider } from "../ticket-external-link.entity";

import type { ITicketIntegrationProvider } from "./integration-provider.interface";
import { TicketIntegrationService } from "./ticket-integration.service";

const ORG = "org-1";
const PROVIDER = ExternalTicketProvider.CLICKUP;
const CONFIG = { api_key: "saved" };

// Each hierarchy call, the provider method it uses, the args it forwards and the 400 wording.
const CALLS = [
  ["getWorkspaces", [], [], "workspaces"],
  ["getSpaces", ["w1"], ["w1"], "spaces"],
  ["getFolders", ["s1"], ["s1"], "folders"],
  ["getLists", ["f1"], ["f1"], "lists"],
  ["createSpace", ["w1", "New"], ["New", "w1"], "creating spaces"],
  ["createFolder", ["s1", "New"], ["New", "s1"], "creating folders"],
  ["createList", ["f1", "New"], ["New", "f1"], "creating lists"],
  [
    "createFolderlessList",
    ["s1", "New"],
    ["New", "s1"],
    "creating folderless lists",
  ],
] as const;

type Call = (typeof CALLS)[number][0];

function makeService(
  provider: Partial<ITicketIntegrationProvider>,
  saved: object | null = { config: CONFIG },
): TicketIntegrationService {
  const configRepository = { findOne: jest.fn().mockResolvedValue(saved) };
  const unused = undefined as never;
  const service = new TicketIntegrationService(
    configRepository as never,
    unused,
    unused,
    unused,
    unused,
  );
  service.registerProvider({
    name: PROVIDER,
    ...provider,
  } as ITicketIntegrationProvider);
  return service;
}

function invoke(
  service: TicketIntegrationService,
  call: Call,
  args: readonly string[],
): Promise<unknown> {
  const method = service[call] as (...a: unknown[]) => Promise<unknown>;
  return method.call(service, ORG, PROVIDER, ...args);
}

describe("TicketIntegrationService hierarchy calls", () => {
  it.each(CALLS)(
    "%s forwards to the provider with the saved config",
    async (call, args, forwarded) => {
      const impl = jest.fn().mockResolvedValue("result");
      const service = makeService({ [call]: impl });

      await expect(invoke(service, call, args)).resolves.toBe("result");
      expect(impl).toHaveBeenCalledWith(...forwarded, CONFIG);
    },
  );

  it.each(CALLS)(
    "%s is a 400 when the provider lacks it",
    async (call, args, _forwarded, what) => {
      const service = makeService({});

      const result = invoke(service, call, args);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow(
        `Provider ${PROVIDER} does not support ${what}`,
      );
    },
  );

  it.each(CALLS)(
    "%s is a 404 without a saved config or request credentials",
    async (call, args) => {
      const service = makeService({}, null);

      await expect(invoke(service, call, args)).rejects.toThrow(
        NotFoundException,
      );
    },
  );
});
