import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { EntityNotFound } from "src/types/error.types";

import { License } from "./license.entity";
import { LicenseRepository } from "./license.repository";

describe("LicenseRepository", () => {
  let licenseRepository: LicenseRepository;
  let mockRepository: jest.Mocked<Repository<License>>;

  const mockLicense: License = {
    id: "uuid-123",
    name: "MIT License",
    reference: "https://opensource.org/licenses/MIT",
    isDeprecatedLicenseId: false,
    detailsUrl: "https://spdx.org/licenses/MIT.html",
    referenceNumber: 308,
    licenseId: "MIT",
    seeAlso: ["https://opensource.org/licenses/MIT"],
    isOsiApproved: true,
    details: {
      crossRef: [
        {
          IsLive: true,
          IsValid: true,
          IsWayBackLink: false,
          Match: "exact",
          Order: 1,
          Timestamp: new Date("2023-01-01"),
          URL: "https://opensource.org/licenses/MIT",
        },
      ],
      isDeprecatedLicenseId: false,
      isOsiApproved: true,
      licenseId: "MIT",
      licenseText:
        "Permission is hereby granted, free of charge, to any person obtaining a copy...",
      licenseTextHtml: "<p>Permission is hereby granted, free of charge...</p>",
      licenseTextNormalized: "permission is hereby granted free of charge",
      licenseTextNormalizedDigest: "abc123def456",
      name: "MIT License",
      seeAlso: ["https://opensource.org/licenses/MIT"],
      standardLicenseTemplate: "MIT standard template",
      description: "A short and simple permissive license",
      classification: "permissive",
      licenseProperties: {
        permissions: [
          "commercial-use",
          "modifications",
          "distribution",
          "private-use",
        ],
        conditions: ["include-copyright"],
        limitations: ["liability", "warranty"],
      },
    },
  };

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseRepository,
        {
          provide: getRepositoryToken(License, "knowledge"),
          useValue: mockRepo,
        },
      ],
    }).compile();

    licenseRepository = module.get<LicenseRepository>(LicenseRepository);
    mockRepository = module.get(getRepositoryToken(License, "knowledge"));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getLicenseData", () => {
    it("should return license when found", async () => {
      mockRepository.findOne.mockResolvedValue(mockLicense);

      const result = await licenseRepository.getLicenseData("MIT");

      expect(result).toEqual(mockLicense);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { licenseId: "MIT" },
      });
      expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it("should throw EntityNotFound when license is not found", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        licenseRepository.getLicenseData("NONEXISTENT"),
      ).rejects.toThrow(EntityNotFound);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { licenseId: "NONEXISTENT" },
      });
    });

    it("should handle repository errors gracefully", async () => {
      const dbError = new Error("Database connection failed");
      mockRepository.findOne.mockRejectedValue(dbError);

      await expect(licenseRepository.getLicenseData("MIT")).rejects.toThrow(
        "Database connection failed",
      );
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { licenseId: "MIT" },
      });
    });

    it("should handle different license ID formats", async () => {
      const testCases = [
        "MIT",
        "Apache-2.0",
        "GPL-3.0-only",
        "BSD-3-Clause",
        "ISC",
        "LGPL-2.1-only",
      ];

      for (const licenseId of testCases) {
        mockRepository.findOne.mockResolvedValue({ ...mockLicense, licenseId });

        const result = await licenseRepository.getLicenseData(licenseId);

        expect(result.licenseId).toBe(licenseId);
        expect(mockRepository.findOne).toHaveBeenCalledWith({
          where: { licenseId },
        });
      }
    });

    it("should handle empty string license ID", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(licenseRepository.getLicenseData("")).rejects.toThrow(
        EntityNotFound,
      );
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { licenseId: "" },
      });
    });

    it("should handle special characters in license ID", async () => {
      const specialLicenseId = "Custom-License-1.0'\";DROP TABLE licenses;--";
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        licenseRepository.getLicenseData(specialLicenseId),
      ).rejects.toThrow(EntityNotFound);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { licenseId: specialLicenseId },
      });
    });

    it("should handle very long license IDs", async () => {
      const longLicenseId = `VERY-LONG-${"LICENSE-".repeat(50)}1.0`;
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        licenseRepository.getLicenseData(longLicenseId),
      ).rejects.toThrow(EntityNotFound);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { licenseId: longLicenseId },
      });
    });
  });

  describe("getAllLicenseData", () => {
    it("should return all licenses when found", async () => {
      const licenses = [
        mockLicense,
        {
          ...mockLicense,
          id: "uuid-456",
          licenseId: "Apache-2.0",
          name: "Apache License 2.0",
        },
        {
          ...mockLicense,
          id: "uuid-789",
          licenseId: "GPL-3.0-only",
          name: "GNU General Public License v3.0 only",
        },
      ];

      mockRepository.find.mockResolvedValue(licenses);

      const result = await licenseRepository.getAllLicenseData();

      expect(result).toEqual(licenses);
      expect(result).toHaveLength(3);
      expect(mockRepository.find).toHaveBeenCalledWith({});
      expect(mockRepository.find).toHaveBeenCalledTimes(1);
    });

    it("should return empty array when no licenses found", async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await licenseRepository.getAllLicenseData();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(mockRepository.find).toHaveBeenCalledWith({});
    });

    it("should handle repository errors gracefully", async () => {
      const dbError = new Error("Database connection failed");
      mockRepository.find.mockRejectedValue(dbError);

      await expect(licenseRepository.getAllLicenseData()).rejects.toThrow(
        "Database connection failed",
      );
      expect(mockRepository.find).toHaveBeenCalledWith({});
    });

    it("should handle large number of licenses", async () => {
      const largeLicenseList = Array.from({ length: 1000 }, (_, index) => ({
        ...mockLicense,
        id: `uuid-${index}`,
        licenseId: `LICENSE-${index}`,
        name: `License ${index}`,
      }));

      mockRepository.find.mockResolvedValue(largeLicenseList);

      const result = await licenseRepository.getAllLicenseData();

      expect(result).toHaveLength(1000);
      expect(result[0]!.licenseId).toBe("LICENSE-0");
      expect(result[999]!.licenseId).toBe("LICENSE-999");
    });
  });

  describe("Real-world license scenarios", () => {
    it("should handle MIT License data", async () => {
      mockRepository.findOne.mockResolvedValue(mockLicense);

      const result = await licenseRepository.getLicenseData("MIT");

      expect(result.licenseId).toBe("MIT");
      expect(result.isOsiApproved).toBe(true);
      expect(result.isDeprecatedLicenseId).toBe(false);
      expect(result.details.licenseProperties.permissions).toContain(
        "commercial-use",
      );
    });

    it("should handle Apache License 2.0 data", async () => {
      const apacheLicense = {
        ...mockLicense,
        licenseId: "Apache-2.0",
        name: "Apache License 2.0",
        reference: "https://www.apache.org/licenses/LICENSE-2.0",
        details: {
          ...mockLicense.details,
          licenseId: "Apache-2.0",
          name: "Apache License 2.0",
          licenseProperties: {
            permissions: [
              "commercial-use",
              "modifications",
              "distribution",
              "patent-use",
              "private-use",
            ],
            conditions: ["include-copyright", "document-changes"],
            limitations: ["liability", "warranty"],
          },
        },
      };

      mockRepository.findOne.mockResolvedValue(apacheLicense);

      const result = await licenseRepository.getLicenseData("Apache-2.0");

      expect(result.licenseId).toBe("Apache-2.0");
      expect(result.details.licenseProperties.permissions).toContain(
        "patent-use",
      );
      expect(result.details.licenseProperties.conditions).toContain(
        "document-changes",
      );
    });

    it("should handle GPL-3.0-only License data", () => {
      const gplLicense = {
        ...mockLicense,
        licenseId: "GPL-3.0-only",
        name: "GNU General Public License v3.0 only",
        reference: "https://www.gnu.org/licenses/gpl-3.0-standalone.html",
        details: {
          ...mockLicense.details,
          licenseId: "GPL-3.0-only",
          name: "GNU General Public License v3.0 only",
          classification: "copyleft",
          licenseProperties: {
            permissions: [
              "commercial-use",
              "modifications",
              "distribution",
              "patent-use",
              "private-use",
            ],
            conditions: [
              "include-copyright",
              "document-changes",
              "disclose-source",
              "same-license",
            ],
            limitations: ["liability", "warranty"],
          },
        },
      };

      mockRepository.findOne.mockResolvedValue(gplLicense);

      return licenseRepository.getLicenseData("GPL-3.0-only").then((result) => {
        expect(result.licenseId).toBe("GPL-3.0-only");
        expect(result.details.classification).toBe("copyleft");
        expect(result.details.licenseProperties.conditions).toContain(
          "disclose-source",
        );
        expect(result.details.licenseProperties.conditions).toContain(
          "same-license",
        );
      });
    });

    it("should handle deprecated license", async () => {
      const deprecatedLicense = {
        ...mockLicense,
        licenseId: "GPL-3.0",
        name: "GNU General Public License v3.0",
        isDeprecatedLicenseId: true,
        details: {
          ...mockLicense.details,
          licenseId: "GPL-3.0",
          isDeprecatedLicenseId: true,
        },
      };

      mockRepository.findOne.mockResolvedValue(deprecatedLicense);

      const result = await licenseRepository.getLicenseData("GPL-3.0");

      expect(result.licenseId).toBe("GPL-3.0");
      expect(result.isDeprecatedLicenseId).toBe(true);
      expect(result.details.isDeprecatedLicenseId).toBe(true);
    });

    it("should handle proprietary license", async () => {
      const proprietaryLicense = {
        ...mockLicense,
        licenseId: "Proprietary",
        name: "Proprietary License",
        reference: null as any,
        isOsiApproved: false,
        seeAlso: [],
        details: {
          ...mockLicense.details,
          licenseId: "Proprietary",
          name: "Proprietary License",
          isOsiApproved: false,
          classification: "proprietary",
          licenseProperties: {
            permissions: [],
            conditions: ["include-copyright", "contact-vendor"],
            limitations: [
              "liability",
              "warranty",
              "commercial-use",
              "distribution",
            ],
          },
        },
      };

      mockRepository.findOne.mockResolvedValue(proprietaryLicense);

      const result = await licenseRepository.getLicenseData("Proprietary");

      expect(result.licenseId).toBe("Proprietary");
      expect(result.isOsiApproved).toBe(false);
      expect(result.details.classification).toBe("proprietary");
      expect(result.details.licenseProperties.limitations).toContain(
        "commercial-use",
      );
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle undefined license ID gracefully", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        licenseRepository.getLicenseData(undefined as any),
      ).rejects.toThrow(EntityNotFound);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { licenseId: undefined },
      });
    });

    it("should handle null license ID gracefully", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        licenseRepository.getLicenseData(null as any),
      ).rejects.toThrow(EntityNotFound);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { licenseId: null },
      });
    });

    it("should handle license with null details", async () => {
      const licenseWithoutDetails = {
        ...mockLicense,
        details: null as any,
      };

      mockRepository.findOne.mockResolvedValue(licenseWithoutDetails);

      const result = await licenseRepository.getLicenseData("MIT");

      expect(result.licenseId).toBe("MIT");
      expect(result.details).toBeNull();
    });

    it("should handle license with empty seeAlso array", async () => {
      const licenseWithEmptySeeAlso = {
        ...mockLicense,
        seeAlso: [],
      };

      mockRepository.findOne.mockResolvedValue(licenseWithEmptySeeAlso);

      const result = await licenseRepository.getLicenseData("MIT");

      expect(result.seeAlso).toEqual([]);
      expect(result.seeAlso).toHaveLength(0);
    });
  });

  describe("Concurrent operations", () => {
    it("should handle concurrent requests for the same license", async () => {
      mockRepository.findOne.mockResolvedValue(mockLicense);

      const promises = Array.from({ length: 5 }, () =>
        licenseRepository.getLicenseData("MIT"),
      );

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result).toEqual(mockLicense);
      });
      expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
    });

    it("should handle concurrent requests for different licenses", async () => {
      const licenseIds = [
        "MIT",
        "Apache-2.0",
        "GPL-3.0-only",
        "BSD-3-Clause",
        "ISC",
      ];

      mockRepository.findOne.mockImplementation((options: any) => {
        const licenseId = options.where?.licenseId;
        return Promise.resolve({
          ...mockLicense,
          licenseId,
          name: `${licenseId} License`,
        });
      });

      const promises = licenseIds.map((licenseId) =>
        licenseRepository.getLicenseData(licenseId),
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.licenseId).toBe(licenseIds[index]);
        expect(result.name).toBe(`${licenseIds[index]} License`);
      });
      expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
    });

    it("should handle concurrent getAllLicenseData calls", async () => {
      const licenses = [mockLicense];
      mockRepository.find.mockResolvedValue(licenses);

      const promises = Array.from({ length: 3 }, () =>
        licenseRepository.getAllLicenseData(),
      );

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result).toEqual(licenses);
      });
      expect(mockRepository.find).toHaveBeenCalledTimes(3);
    });
  });

  describe("Service initialization", () => {
    it("should be defined", () => {
      expect(licenseRepository).toBeDefined();
    });

    it("should inject repository correctly", () => {
      expect(mockRepository).toBeDefined();
    });

    it("should have all required methods", () => {
      expect(typeof licenseRepository.getLicenseData).toBe("function");
      expect(typeof licenseRepository.getAllLicenseData).toBe("function");
    });
  });
});
