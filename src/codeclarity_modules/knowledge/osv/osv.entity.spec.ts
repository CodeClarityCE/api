import { OSV } from "./osv.entity";

describe("OSV Entity", () => {
  let osvEntity: OSV;

  beforeEach(() => {
    osvEntity = new OSV();
  });

  it("should create an instance", () => {
    expect(osvEntity).toBeDefined();
    expect(osvEntity).toBeInstanceOf(OSV);
  });

  it("should have all required properties when populated", () => {
    // Initialize with test data
    osvEntity.id = "test-id";
    osvEntity.osv_id = "test-osv-id";
    osvEntity.schema_version = "1.0.0";
    osvEntity.vlai_score = "5.0";
    osvEntity.vlai_confidence = 0.8;
    osvEntity.modified = "2024-01-01T00:00:00Z";
    osvEntity.published = "2024-01-01T00:00:00Z";
    osvEntity.withdrawn = null as any;

    expect(osvEntity).toHaveProperty("id");
    expect(osvEntity).toHaveProperty("osv_id");
    expect(osvEntity).toHaveProperty("schema_version");
    expect(osvEntity).toHaveProperty("vlai_score");
    expect(osvEntity).toHaveProperty("vlai_confidence");
    expect(osvEntity).toHaveProperty("modified");
    expect(osvEntity).toHaveProperty("published");
    expect(osvEntity).toHaveProperty("withdrawn");
  });

  it("should allow setting all properties", () => {
    const testData = {
      id: "test-uuid",
      osv_id: "GHSA-1234-5678-9abc",
      schema_version: "1.4.0",
      vlai_score: "7.5",
      vlai_confidence: 0.95,
      modified: "2024-01-02T00:00:00.000Z",
      published: "2024-01-01T00:00:00.000Z",
      withdrawn: null,
    };

    Object.assign(osvEntity, testData);

    expect(osvEntity.id).toBe(testData.id);
    expect(osvEntity.osv_id).toBe(testData.osv_id);
    expect(osvEntity.schema_version).toBe(testData.schema_version);
    expect(osvEntity.vlai_score).toBe(testData.vlai_score);
    expect(osvEntity.vlai_confidence).toBe(testData.vlai_confidence);
    expect(osvEntity.modified).toBe(testData.modified);
    expect(osvEntity.published).toBe(testData.published);
    expect(osvEntity.withdrawn).toBe(testData.withdrawn);
  });

  it("should handle nullable properties", () => {
    osvEntity.id = "test-uuid";
    osvEntity.osv_id = "GHSA-1234-5678-9abc";

    // These properties should be nullable
    osvEntity.schema_version = null as any;
    osvEntity.vlai_score = null as any;
    osvEntity.vlai_confidence = null as any;
    osvEntity.modified = null as any;
    osvEntity.published = null as any;
    osvEntity.withdrawn = null as any;

    expect(osvEntity.schema_version).toBeNull();
    expect(osvEntity.vlai_score).toBeNull();
    expect(osvEntity.vlai_confidence).toBeNull();
    expect(osvEntity.modified).toBeNull();
    expect(osvEntity.published).toBeNull();
    expect(osvEntity.withdrawn).toBeNull();
  });

  it("should handle different OSV identifier formats", () => {
    const osvIds = [
      "GHSA-1234-5678-9abc",
      "CVE-2024-1234",
      "PYSEC-2024-123",
      "RUSTSEC-2024-0001",
      "GO-2024-0001",
    ];

    osvIds.forEach((id) => {
      osvEntity.osv_id = id;
      expect(osvEntity.osv_id).toBe(id);
    });
  });

  it("should handle schema versions", () => {
    const versions = ["1.0.0", "1.2.0", "1.4.0", "1.5.0"];

    versions.forEach((version) => {
      osvEntity.schema_version = version;
      expect(osvEntity.schema_version).toBe(version);
    });
  });

  it("should handle VLAI scores as strings", () => {
    const scores = ["0.0", "3.5", "7.5", "9.8", "10.0"];

    scores.forEach((score) => {
      osvEntity.vlai_score = score;
      expect(osvEntity.vlai_score).toBe(score);
    });
  });

  it("should handle VLAI confidence as float", () => {
    const confidences = [0.0, 0.25, 0.5, 0.75, 0.95, 1.0];

    confidences.forEach((confidence) => {
      osvEntity.vlai_confidence = confidence;
      expect(osvEntity.vlai_confidence).toBe(confidence);
    });
  });

  it("should handle date strings in ISO format", () => {
    const dates = [
      "2024-01-01T00:00:00.000Z",
      "2024-01-02T12:30:45.123Z",
      "2023-12-31T23:59:59.999Z",
    ];

    dates.forEach((date) => {
      osvEntity.published = date;
      osvEntity.modified = date;

      expect(osvEntity.published).toBe(date);
      expect(osvEntity.modified).toBe(date);
    });
  });

  it("should handle withdrawn vulnerabilities", () => {
    // Initially not withdrawn
    osvEntity.withdrawn = null as any;
    expect(osvEntity.withdrawn).toBeNull();

    // Set withdrawal date
    const withdrawnDate = "2024-01-15T10:00:00.000Z";
    osvEntity.withdrawn = withdrawnDate;
    expect(osvEntity.withdrawn).toBe(withdrawnDate);
  });

  it("should handle confidence values within valid range", () => {
    // Test boundary values
    osvEntity.vlai_confidence = 0.0;
    expect(osvEntity.vlai_confidence).toBe(0.0);

    osvEntity.vlai_confidence = 1.0;
    expect(osvEntity.vlai_confidence).toBe(1.0);

    // Test intermediate values
    osvEntity.vlai_confidence = 0.5;
    expect(osvEntity.vlai_confidence).toBe(0.5);

    osvEntity.vlai_confidence = 0.999;
    expect(osvEntity.vlai_confidence).toBe(0.999);
  });

  it("should handle different vulnerability ecosystems", () => {
    const ecosystemIds = [
      "GHSA-abcd-1234-efgh", // GitHub Advisory
      "CVE-2024-12345", // CVE
      "PYSEC-2024-100", // Python Security
      "RUSTSEC-2024-001", // Rust Security
      "GO-2024-001", // Go Security
      "OSV-2024-001", // Generic OSV
    ];

    ecosystemIds.forEach((id) => {
      osvEntity.osv_id = id;
      expect(osvEntity.osv_id).toBe(id);
    });
  });

  it("should maintain chronological order of dates", () => {
    const publishedDate = "2024-01-01T00:00:00.000Z";
    const modifiedDate = "2024-01-02T00:00:00.000Z";
    const withdrawnDate = "2024-01-03T00:00:00.000Z";

    osvEntity.published = publishedDate;
    osvEntity.modified = modifiedDate;
    osvEntity.withdrawn = withdrawnDate;

    expect(new Date(osvEntity.published).getTime()).toBeLessThan(
      new Date(osvEntity.modified).getTime(),
    );
    expect(new Date(osvEntity.modified).getTime()).toBeLessThan(
      new Date(osvEntity.withdrawn).getTime(),
    );
  });

  it("should handle edge case confidence values", () => {
    // Very small positive value
    osvEntity.vlai_confidence = 0.001;
    expect(osvEntity.vlai_confidence).toBe(0.001);

    // Very close to 1
    osvEntity.vlai_confidence = 0.999999;
    expect(osvEntity.vlai_confidence).toBe(0.999999);
  });
});
