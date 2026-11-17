import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { EntityNotFound } from "src/types/error.types";

import { Package, type Version } from "./package.entity";
import { VersionsRepository } from "./packageVersions.repository";

describe("VersionsRepository", () => {
  let repository: VersionsRepository;
  let packageRepository: any;

  const mockPackage: Package = {
    id: "package-123",
    name: "test-package",
    description: "Test package description",
    homepage: "https://test-package.com",
    latest_version: "1.0.0",
    time: new Date("2024-01-01"),
    keywords: ["test"],
    source: { type: "git", url: "https://github.com/test/package" },
    license: "MIT",
    licenses: [{ type: "MIT", url: "https://opensource.org/licenses/MIT" }],
    extra: {},
    versions: [],
  };

  const mockVersions: Version[] = [
    {
      id: "version-1",
      version: "1.0.0",
      dependencies: {},
      dev_dependencies: {},
      extra: {},
      package: mockPackage,
    },
    {
      id: "version-2",
      version: "2.0.0",
      dependencies: {},
      dev_dependencies: {},
      extra: {},
      package: mockPackage,
    },
    {
      id: "version-3",
      version: "1.5.0",
      dependencies: {},
      dev_dependencies: {},
      extra: {},
      package: mockPackage,
    },
  ];

  const mockPackageRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionsRepository,
        {
          provide: getRepositoryToken(Package, "knowledge"),
          useValue: mockPackageRepository,
        },
      ],
    }).compile();

    repository = module.get<VersionsRepository>(VersionsRepository);
    packageRepository = module.get(getRepositoryToken(Package, "knowledge"));

    jest.clearAllMocks();
  });

  describe("getDependencyVersions", () => {
    it("should return sorted versions for existing package", async () => {
      const packageWithVersions = {
        ...mockPackage,
        versions: mockVersions,
      };
      mockPackageRepository.findOne.mockResolvedValue(packageWithVersions);

      const result = await repository.getDependencyVersions("test-package");

      expect(result).toHaveLength(3);
      // Should be sorted by semver: 1.0.0, 1.5.0, 2.0.0
      expect(result[0]!.version).toBe("1.0.0");
      expect(result[1]!.version).toBe("1.5.0");
      expect(result[2]!.version).toBe("2.0.0");

      expect(packageRepository.findOne).toHaveBeenCalledWith({
        where: { name: "test-package", language: "javascript" },
        relations: { versions: true },
      });
    });

    it("should return empty array for package with no versions", async () => {
      const packageWithoutVersions = {
        ...mockPackage,
        versions: [],
      };
      mockPackageRepository.findOne.mockResolvedValue(packageWithoutVersions);

      const result = await repository.getDependencyVersions("test-package");

      expect(result).toEqual([]);
      expect(packageRepository.findOne).toHaveBeenCalledWith({
        where: { name: "test-package", language: "javascript" },
        relations: { versions: true },
      });
    });

    it("looks scoped packages up by their npm name", async () => {
      const packageWithVersions = {
        ...mockPackage,
        versions: mockVersions,
      };
      mockPackageRepository.findOne.mockResolvedValue(packageWithVersions);

      await repository.getDependencyVersions("@org/package");

      // The knowledge mirror stores npm names as the registry spells them.
      expect(packageRepository.findOne).toHaveBeenCalledWith({
        where: { name: "@org/package", language: "javascript" },
        relations: { versions: true },
      });
    });

    it("should throw EntityNotFound when package does not exist", async () => {
      mockPackageRepository.findOne.mockResolvedValue(null);

      await expect(
        repository.getDependencyVersions("non-existent-package"),
      ).rejects.toThrow(EntityNotFound);

      expect(packageRepository.findOne).toHaveBeenCalledWith({
        where: { name: "non-existent-package", language: "javascript" },
        relations: { versions: true },
      });
    });

    it("should handle complex semver sorting", async () => {
      const complexVersions: Version[] = [
        {
          id: "1",
          version: "2.0.0-alpha",
          dependencies: {},
          dev_dependencies: {},
          extra: {},
          package: mockPackage,
        },
        {
          id: "2",
          version: "1.0.0",
          dependencies: {},
          dev_dependencies: {},
          extra: {},
          package: mockPackage,
        },
        {
          id: "3",
          version: "2.0.0",
          dependencies: {},
          dev_dependencies: {},
          extra: {},
          package: mockPackage,
        },
        {
          id: "4",
          version: "1.10.0",
          dependencies: {},
          dev_dependencies: {},
          extra: {},
          package: mockPackage,
        },
        {
          id: "5",
          version: "1.2.0",
          dependencies: {},
          dev_dependencies: {},
          extra: {},
          package: mockPackage,
        },
      ];

      const packageWithComplexVersions = {
        ...mockPackage,
        versions: complexVersions,
      };
      mockPackageRepository.findOne.mockResolvedValue(
        packageWithComplexVersions,
      );

      const result = await repository.getDependencyVersions("test-package");

      expect(result).toHaveLength(5);
      expect(result[0]!.version).toBe("1.0.0");
      expect(result[1]!.version).toBe("1.2.0");
      expect(result[2]!.version).toBe("1.10.0");
      expect(result[3]!.version).toBe("2.0.0-alpha");
      expect(result[4]!.version).toBe("2.0.0");
    });

    it("should handle database errors", async () => {
      const dbError = new Error("Database connection failed");
      mockPackageRepository.findOne.mockRejectedValue(dbError);

      await expect(
        repository.getDependencyVersions("test-package"),
      ).rejects.toThrow("Database connection failed");
    });
  });
});
