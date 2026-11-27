import { existsSync } from "fs";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { File } from "../../src/base_modules/file/file.entity";
import { UPLOAD_FILE_SIZE_LIMIT } from "../../src/base_modules/file/upload-limits";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { type Project } from "../../src/base_modules/projects/project.entity";
import { createProject } from "../utils/deletion-fixtures";
import {
  sessionHeaders,
  testHelper,
  type TestUser,
} from "../utils/integration-test-helper";

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

  describe("PATCH /org/:org/file/:project/upload", () => {
    it("refuses a file over the size limit as too large", async () => {
      const boundary = "files-it-boundary";
      const file = Buffer.alloc(UPLOAD_FILE_SIZE_LIMIT + 1, "a");
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\n` +
            'Content-Disposition: form-data; name="file"; filename="sbom.json"\r\n' +
            "Content-Type: application/json\r\n\r\n",
        ),
        file,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const response = await testHelper.getApp().inject({
        method: "PATCH",
        url: `/org/${owner.organization.id}/file/${projectId}/upload`,
        headers: {
          ...sessionHeaders({ accessToken: owner.accessToken }),
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(response.statusCode).toBe(413);
      expect(response.json()).toMatchObject({
        status_code: 413,
        error_code: "PayloadTooLarge",
      });
    });
  });

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

  describe("GET /org/:org/file/:project/:file_name", () => {
    // Writes a file where the read endpoint looks for it.
    async function storedFile(name: string, content: string): Promise<void> {
      const folder = join(downloads, owner.organization.id, projectId);
      /* eslint-disable security/detect-non-literal-fs-filename */
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, name), content);
      /* eslint-enable security/detect-non-literal-fs-filename */
    }

    it("returns the file's content to a member", async () => {
      await storedFile("notes.txt", "hello");

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${owner.organization.id}/file/${projectId}/notes.txt`,
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBe("hello");
    });

    it("does not read outside the project's folder", async () => {
      await storedFile("notes.txt", "hello");

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${owner.organization.id}/file/${projectId}/..%2F..%2F..%2Fetc%2Fpasswd`,
        owner.accessToken,
      );

      expect(response.statusCode).not.toBe(200);
      expect(response.statusCode).toBeLessThan(500);
    });
  });
});
