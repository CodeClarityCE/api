import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import {
  NotAuthorized,
  PersonalOrgCannotBeModified,
} from "src/types/error.types";

import { OrganizationsService } from "./organizations.service";

describe("OrganizationsService.deleteOrg", () => {
  const user = new AuthenticatedUser("owner-id", [ROLE.USER], true);
  const manager = { tx: true };
  let calls: string[];
  let deps: Record<string, any>;
  let service: OrganizationsService;

  beforeEach(() => {
    calls = [];
    const record =
      (name: string, result?: unknown) => async (): Promise<unknown> => {
        calls.push(name);
        return result;
      };
    deps = {
      memberships: {
        hasRequiredRole: jest.fn().mockResolvedValue(undefined),
        getMembershipsByOrganizationId: jest
          .fn()
          .mockResolvedValue([{ id: "m1" }]),
        removeMemberships: jest.fn(record("removeMemberships")),
      },
      organizations: {
        getOrganizationById: jest.fn().mockResolvedValue({ personal: false }),
        runInTransaction: jest.fn(async (work: any) => {
          const result = await work(manager);
          calls.push("commit");
          return result;
        }),
        deleteOrganization: jest.fn(record("deleteOrganization")),
      },
      teardown: {
        deleteContents: jest.fn(record("deleteContents", ["p1", "p2"])),
      },
      projectRows: { removeFolders: jest.fn(record("removeFolders")) },
    };
    service = new OrganizationsService(
      {} as any,
      deps["organizations"],
      deps["memberships"],
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      deps["teardown"],
      deps["projectRows"],
    );
  });

  it("deletes the contents, memberships and row in one transaction, then the folders", async () => {
    await service.deleteOrg("org-id", user);

    expect(calls).toEqual([
      "deleteContents",
      "removeMemberships",
      "deleteOrganization",
      "commit",
      "removeFolders",
    ]);
    expect(deps["teardown"].deleteContents).toHaveBeenCalledWith(
      "org-id",
      manager,
    );
    expect(deps["memberships"].removeMemberships).toHaveBeenCalledWith(
      [{ id: "m1" }],
      manager,
    );
    expect(deps["organizations"].deleteOrganization).toHaveBeenCalledWith(
      "org-id",
      manager,
    );
    expect(deps["projectRows"].removeFolders).toHaveBeenCalledWith("org-id", [
      "p1",
      "p2",
    ]);
  });

  it("keeps the folders when the transaction fails", async () => {
    deps["organizations"].deleteOrganization.mockRejectedValue(
      new Error("foreign key"),
    );

    await expect(service.deleteOrg("org-id", user)).rejects.toThrow(
      "foreign key",
    );
    expect(deps["projectRows"].removeFolders).not.toHaveBeenCalled();
  });

  it("refuses a member who is not an owner", async () => {
    deps["memberships"].hasRequiredRole.mockRejectedValue(new NotAuthorized());

    await expect(service.deleteOrg("org-id", user)).rejects.toThrow(
      NotAuthorized,
    );
    expect(deps["teardown"].deleteContents).not.toHaveBeenCalled();
  });

  it("refuses a personal organization", async () => {
    deps["organizations"].getOrganizationById.mockResolvedValue({
      personal: true,
    });

    await expect(service.deleteOrg("org-id", user)).rejects.toThrow(
      PersonalOrgCannotBeModified,
    );
    expect(deps["teardown"].deleteContents).not.toHaveBeenCalled();
  });
});
