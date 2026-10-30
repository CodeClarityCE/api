import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  type MembershipsRepository,
  type OrganizationsRepository,
} from "src/base_modules/shared/repositories";
import {
  AlreadyExists,
  EntityNotFound,
  NotAuthorized,
} from "src/types/error.types";

import { DatasetLanguage, DatasetStatus } from "./dataset.entity";
import { type DatasetBuildService } from "./dataset-build.service";
import { DEFAULT_LOCKFILES } from "./dataset-builder";
import { DatasetsService } from "./datasets.service";

describe("DatasetsService", () => {
  const user = new AuthenticatedUser("user-1", [ROLE.USER], true);
  let service: DatasetsService;
  let hasRequiredRole: jest.Mock;
  let doesIntegrationBelongToOrg: jest.Mock;
  let kick: jest.Mock;
  let datasetRepository: Record<string, jest.Mock>;
  let entryRepository: Record<string, jest.Mock>;

  beforeEach(() => {
    hasRequiredRole = jest.fn().mockResolvedValue(undefined);
    doesIntegrationBelongToOrg = jest.fn().mockResolvedValue(true);
    kick = jest.fn();
    datasetRepository = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: object) => Promise.resolve({ ...value, id: "ds-1" })),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const countBuilder: Record<string, jest.Mock> = {
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    for (const method of ["select", "addSelect", "where", "groupBy"]) {
      countBuilder[method] = jest.fn().mockReturnValue(countBuilder);
    }
    entryRepository = {
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(countBuilder),
    };

    service = new DatasetsService(
      { hasRequiredRole } as unknown as MembershipsRepository,
      { doesIntegrationBelongToOrg } as unknown as OrganizationsRepository,
      { kick } as unknown as DatasetBuildService,
      datasetRepository as never,
      entryRepository as never,
    );
  });

  describe("create", () => {
    it("requires an admin, applies the defaults and starts the build", async () => {
      const id = await service.create(
        "org-1",
        { name: "  top100 ", integration_id: "int-1" },
        user,
      );

      expect(id).toBe("ds-1");
      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.ADMIN,
      );
      expect(datasetRepository["save"]).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "top100",
          status: DatasetStatus.BUILDING,
          params: {
            languages: [DatasetLanguage.JAVASCRIPT, DatasetLanguage.TYPESCRIPT],
            pages: 3,
            min_stars: 1000,
            limit: 100,
            lockfiles: DEFAULT_LOCKFILES,
          },
          organization: { id: "org-1" },
          created_by: { id: "user-1" },
          integration: { id: "int-1" },
        }),
      );
      expect(kick).toHaveBeenCalled();
    });

    it("keeps the requested parameters", async () => {
      await service.create(
        "org-1",
        {
          name: "ts",
          integration_id: "int-1",
          languages: [DatasetLanguage.TYPESCRIPT],
          pages: 1,
          min_stars: 50,
          limit: 5,
        },
        user,
      );

      expect(datasetRepository["save"]).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            languages: [DatasetLanguage.TYPESCRIPT],
            pages: 1,
            min_stars: 50,
            limit: 5,
          }),
        }),
      );
    });

    it("refuses an integration of another organization", async () => {
      doesIntegrationBelongToOrg.mockResolvedValue(false);

      await expect(
        service.create("org-1", { name: "x", integration_id: "int-2" }, user),
      ).rejects.toBeInstanceOf(NotAuthorized);
      expect(datasetRepository["save"]).not.toHaveBeenCalled();
    });

    it("refuses a name already used in the organization", async () => {
      datasetRepository["exists"]!.mockResolvedValue(true);

      await expect(
        service.create("org-1", { name: "x", integration_id: "int-1" }, user),
      ).rejects.toBeInstanceOf(AlreadyExists);
      expect(kick).not.toHaveBeenCalled();
    });

    it("stops when the membership check fails", async () => {
      hasRequiredRole.mockRejectedValue(new NotAuthorized());

      await expect(
        service.create("org-1", { name: "x", integration_id: "int-1" }, user),
      ).rejects.toBeInstanceOf(NotAuthorized);
      expect(datasetRepository["save"]).not.toHaveBeenCalled();
    });
  });

  describe("reads", () => {
    const dataset = {
      id: "ds-1",
      name: "top100",
      status: DatasetStatus.READY,
      params: {},
      stats: null,
      created_on: new Date("2026-10-30T00:00:00Z"),
      built_on: null,
      created_by: { first_name: "John", last_name: "Doe" },
      integration: { id: "int-1" },
    };

    it("get requires membership and reports the entry count", async () => {
      datasetRepository["findOne"]!.mockResolvedValue(dataset);
      entryRepository["createQueryBuilder"]!().getRawMany.mockResolvedValue([
        { dataset_id: "ds-1", count: "42" },
      ]);

      const summary = await service.get("org-1", "ds-1", user);

      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.USER,
      );
      expect(datasetRepository["findOne"]).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ds-1", organization: { id: "org-1" } },
        }),
      );
      expect(summary).toMatchObject({
        id: "ds-1",
        entry_count: 42,
        integration_id: "int-1",
        created_by_name: "John Doe",
      });
    });

    it("get hides datasets of other organizations", async () => {
      datasetRepository["findOne"]!.mockResolvedValue(null);

      await expect(service.get("org-1", "ds-9", user)).rejects.toBeInstanceOf(
        EntityNotFound,
      );
    });

    it("getEntries pages through the entries by rank", async () => {
      datasetRepository["findOne"]!.mockResolvedValue(dataset);
      entryRepository["findAndCount"]!.mockResolvedValue([[], 250]);

      const page = await service.getEntries(
        "org-1",
        "ds-1",
        { currentPage: 2, entriesPerPage: 100 },
        user,
      );

      expect(entryRepository["findAndCount"]).toHaveBeenCalledWith({
        where: { dataset: { id: "ds-1" } },
        order: { rank: "ASC" },
        skip: 200,
        take: 100,
      });
      expect(page).toMatchObject({ page: 2, total_entries: 250, total_pages: 3 });
    });
  });

  describe("delete", () => {
    it("requires an admin and deletes only within the organization", async () => {
      datasetRepository["findOne"]!.mockResolvedValue({ id: "ds-1" });

      await service.delete("org-1", "ds-1", user);

      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.ADMIN,
      );
      expect(datasetRepository["delete"]).toHaveBeenCalledWith({ id: "ds-1" });
    });

    it("refuses a dataset of another organization", async () => {
      datasetRepository["findOne"]!.mockResolvedValue(null);

      await expect(service.delete("org-1", "ds-9", user)).rejects.toBeInstanceOf(
        EntityNotFound,
      );
      expect(datasetRepository["delete"]).not.toHaveBeenCalled();
    });
  });
});
