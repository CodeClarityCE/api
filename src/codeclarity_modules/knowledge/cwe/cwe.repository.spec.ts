import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { EntityNotFound } from "src/types/error.types";

import { CWE } from "./cwe.entity";
import { CWERepository } from "./cwe.repository";

describe("CWERepository", () => {
  let cweRepository: CWERepository;
  let mockRepository: jest.Mocked<Repository<CWE>>;

  const mockCWE: CWE = {
    id: "uuid-123",
    cwe_id: "CWE-79",
    name: "Cross-site Scripting",
    abstraction: "Base",
    structure: "Simple",
    status: "Stable",
    description: "Improper neutralization of input during web page generation",
    extended_description:
      "The software does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output that is used as a web page that is served to other users.",
    likelihood_of_exploit: "High",
    related_weaknesses: [
      { nature: "ChildOf", cwe_id: "CWE-20", view_id: "1000" },
    ],
    modes_of_introduction: [
      { phase: "Implementation", note: "Failure to validate input" },
    ],
    common_consequences: [
      {
        scope: ["Confidentiality", "Integrity", "Availability"],
        impact: [
          "Read Application Data",
          "Modify Application Data",
          "Execute Unauthorized Code or Commands",
        ],
      },
    ],
    detection_methods: [
      {
        method: "Automated Static Analysis",
        description: "Use automated static analysis tools",
      },
    ],
    potential_mitigations: [
      {
        phase: "Implementation",
        description: "Use a vetted library or framework",
      },
    ],
    taxonomy_mappings: {
      "OWASP Top Ten 2004": "A4 Cross Site Scripting",
    },
    observed_examples: [
      {
        reference: "CVE-2002-0564",
        description: "XSS in web application",
        link: "https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2002-0564",
      },
    ],
    alternate_terms: [
      {
        term: "XSS",
        description: "Commonly used abbreviation for Cross-Site Scripting",
      },
    ],
    affected_resources: ["Memory", "File or Directory"],
    functional_areas: ["Input Validation"],
    categories: ["OWASP Top Ten 2021"],
    applicable_platforms: {
      languages: [
        { name: "JavaScript", prevalence: "Often" },
        { name: "PHP", prevalence: "Often" },
      ],
    },
  };

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CWERepository,
        {
          provide: getRepositoryToken(CWE, "knowledge"),
          useValue: mockRepo,
        },
      ],
    }).compile();

    cweRepository = module.get<CWERepository>(CWERepository);
    mockRepository = module.get(getRepositoryToken(CWE, "knowledge"));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getCWE", () => {
    it("should return CWE when found", async () => {
      mockRepository.findOne.mockResolvedValue(mockCWE);

      const result = await cweRepository.getCWE("CWE-79");

      expect(result).toEqual(mockCWE);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: "CWE-79",
        },
      });
      expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it("should throw EntityNotFound when CWE is not found", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(cweRepository.getCWE("CWE-999")).rejects.toThrow(
        EntityNotFound,
      );
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: "CWE-999",
        },
      });
    });

    it("should handle repository errors gracefully", async () => {
      const dbError = new Error("Database connection failed");
      mockRepository.findOne.mockRejectedValue(dbError);

      await expect(cweRepository.getCWE("CWE-79")).rejects.toThrow(
        "Database connection failed",
      );
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: "CWE-79",
        },
      });
    });

    it("should handle different CWE ID formats", async () => {
      const testCases = [
        "CWE-1",
        "CWE-10",
        "CWE-100",
        "CWE-1000",
        "CWE-79",
        "CWE-89",
      ];

      for (const cweId of testCases) {
        mockRepository.findOne.mockResolvedValue({ ...mockCWE, cwe_id: cweId });

        const result = await cweRepository.getCWE(cweId);

        expect(result.cwe_id).toBe(cweId);
        expect(mockRepository.findOne).toHaveBeenCalledWith({
          where: {
            cwe_id: cweId,
          },
        });
      }
    });
  });

  describe("getCWEWithoutFailing", () => {
    it("should return CWE when found", async () => {
      mockRepository.findOne.mockResolvedValue(mockCWE);

      const result = await cweRepository.getCWEWithoutFailing("CWE-79");

      expect(result).toEqual(mockCWE);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: "CWE-79",
        },
      });
    });

    it("should return null when CWE is not found", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await cweRepository.getCWEWithoutFailing("CWE-999");

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: "CWE-999",
        },
      });
    });

    it("should return null when CWE ID is empty string", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await cweRepository.getCWEWithoutFailing("");

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: "",
        },
      });
    });

    it("should handle repository errors", async () => {
      const dbError = new Error("Database connection failed");
      mockRepository.findOne.mockRejectedValue(dbError);

      await expect(
        cweRepository.getCWEWithoutFailing("CWE-79"),
      ).rejects.toThrow("Database connection failed");
    });

    it("should handle special characters in CWE ID", async () => {
      const specialCweId = "CWE-79'\";DROP TABLE cwe;--";
      mockRepository.findOne.mockResolvedValue(null);

      const result = await cweRepository.getCWEWithoutFailing(specialCweId);

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: specialCweId,
        },
      });
    });
  });

  describe("Integration scenarios", () => {
    it("should handle concurrent requests for the same CWE", async () => {
      mockRepository.findOne.mockResolvedValue(mockCWE);

      const promises = Array.from({ length: 5 }, () =>
        cweRepository.getCWE("CWE-79"),
      );

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result).toEqual(mockCWE);
      });
      expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
    });

    it("should handle concurrent requests for different CWEs", async () => {
      const cweIds = ["CWE-79", "CWE-89", "CWE-20", "CWE-200", "CWE-22"];

      mockRepository.findOne.mockImplementation((options: any) => {
        const cweId = options.where?.cwe_id;
        return Promise.resolve({
          ...mockCWE,
          cwe_id: cweId,
          name: `Mock CWE for ${cweId}`,
        });
      });

      const promises = cweIds.map((cweId) => cweRepository.getCWE(cweId));

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.cwe_id).toBe(cweIds[index]);
        expect(result.name).toBe(`Mock CWE for ${cweIds[index]}`);
      });
      expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
    });

    it("should handle mixed success and failure scenarios", async () => {
      const existingCWEs = ["CWE-79", "CWE-89"];
      const nonExistentCWEs = ["CWE-999", "CWE-888"];

      mockRepository.findOne.mockImplementation((options: any) => {
        const cweId = options.where?.cwe_id;
        if (existingCWEs.includes(cweId)) {
          return Promise.resolve({ ...mockCWE, cwe_id: cweId });
        }
        return Promise.resolve(null);
      });

      const existingResults = await Promise.all(
        existingCWEs.map((cweId) => cweRepository.getCWEWithoutFailing(cweId)),
      );

      const nonExistentResults = await Promise.all(
        nonExistentCWEs.map((cweId) =>
          cweRepository.getCWEWithoutFailing(cweId),
        ),
      );

      existingResults.forEach((result, index) => {
        expect(result).not.toBeNull();
        expect(result?.cwe_id).toBe(existingCWEs[index]);
      });

      nonExistentResults.forEach((result) => {
        expect(result).toBeNull();
      });
    });
  });

  describe("Error handling edge cases", () => {
    it("should handle undefined CWE ID gracefully", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await cweRepository.getCWEWithoutFailing(undefined as any);

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: undefined,
        },
      });
    });

    it("should handle null CWE ID gracefully", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await cweRepository.getCWEWithoutFailing(null as any);

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: null,
        },
      });
    });

    it("should handle very long CWE ID strings", async () => {
      const longCweId = `CWE-${"1".repeat(1000)}`;
      mockRepository.findOne.mockResolvedValue(null);

      const result = await cweRepository.getCWEWithoutFailing(longCweId);

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          cwe_id: longCweId,
        },
      });
    });
  });

  describe("Service initialization", () => {
    it("should be defined", () => {
      expect(cweRepository).toBeDefined();
    });

    it("should inject repository correctly", () => {
      expect(mockRepository).toBeDefined();
    });

    it("should have all required methods", () => {
      expect(typeof cweRepository.getCWE).toBe("function");
      expect(typeof cweRepository.getCWEWithoutFailing).toBe("function");
    });
  });
});
