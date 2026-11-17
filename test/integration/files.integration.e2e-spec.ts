import { existsSync } from "fs";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { File } from "../../src/base_modules/file/file.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { type Project } from "../../src/base_modules/projects/project.entity";
import { createProject } from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Files (e2e)", () => {
  let owner: TestUser;
  let projectId: string;
  let downloads: string;
  let previousDownloadPath: string | undefined;

  beforeAll(async () => {
    await testHelper.setupTestApp();
    downloads = await mkdtemp(join(tmpdir(), "files-it-"));
    previousDownloadPath = process.env["DOWNLOAD_PATH"];
    process.env["DOWNLOAD_PATH"] = downloads;
  });

  afterAll(async () => {
    process.env["DOWNLOAD_PATH"] = previousDownloadPath;
    await rm(downloads, { recursive: true, force: true });
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@files.com",
      role: MemberRole.OWNER,
    });
    projectId = await createProject(owner, "files-project");
  });

  // Stores an uploaded file the way the upload endpoint leaves it.
  async function uploadedFile(name: string): Promise<File> {
    const folder = join(downloads, owner.user.id, projectId);
    // The path is built from a temp folder and test ids.
    /* eslint-disable security/detect-non-literal-fs-filename */
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, name), "{}");
    /* eslint-enable security/detect-non-literal-fs-filename */

    const repository = testHelper.getDataSource().getRepository(File);
    return repository.save(
      repository.create({
        name,
        type: "SBOM",
        added_on: new Date(),
        added_by: owner.user,
        project: { id: projectId } as Project,
      }),
    );
  }

  describe("DELETE /org/:org/file/:project/:file", () => {
    it("deletes the uploader's file from the database and disk", async () => {
      const file = await uploadedFile("sbom.json");

      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${owner.organization.id}/file/${projectId}/${file.id}`,
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      const left = await testHelper
        .getDataSource()
        .getRepository(File)
        .findOneBy({ id: file.id });
      expect(left).toBeNull();
      expect(
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        existsSync(join(downloads, owner.user.id, projectId, file.name)),
      ).toBe(false);
    });
  });
});
