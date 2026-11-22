import { Test, type TestingModule } from "@nestjs/testing";

import { InternalError } from "../../types/error.types";
import { AuthenticatedUser, ROLE } from "../auth/auth.types";

import { FileController, type UploadData } from "./file.controller";
import { FileService } from "./file.service";
import type { UploadedFilePart } from "./single-file.interceptor";

describe("FileController", () => {
  let controller: FileController;
  let fileService: jest.Mocked<FileService>;

  const mockUser = new AuthenticatedUser("user-123", [ROLE.USER], true);

  const mockFile: UploadedFilePart = {
    fieldname: "file",
    originalname: "test.json",
    encoding: "7bit",
    mimetype: "application/json",
    buffer: Buffer.from("test content"),
    size: 12,
  };

  const mockUploadData: UploadData = {
    type: "application/json",
    file_name: "test.json",
    chunk: "false",
    last: "true",
    id: "0",
    hash: "testhash123",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        {
          provide: FileService,
          useValue: {
            uploadFile: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FileController>(FileController);
    fileService = module.get(FileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("uploadFile", () => {
    it("should upload file successfully", async () => {
      fileService.uploadFile.mockResolvedValue(undefined);

      const result = await controller.uploadFile(
        mockUser,
        "project-123",
        "org-123",
        mockUploadData,
        mockFile,
      );

      expect(result).toBeUndefined();
      expect(fileService.uploadFile).toHaveBeenCalledWith(
        mockUser,
        mockFile,
        "project-123",
        "org-123",
        mockUploadData,
      );
    });

    it("should throw InternalError when no file is provided", async () => {
      await expect(
        controller.uploadFile(
          mockUser,
          "project-123",
          "org-123",
          mockUploadData,
          null as any,
        ),
      ).rejects.toThrow(InternalError);

      expect(fileService.uploadFile).not.toHaveBeenCalled();
    });

    it("should handle chunked upload", async () => {
      const chunkedData: UploadData = {
        ...mockUploadData,
        chunk: "true",
        last: "false",
        id: "1",
      };

      fileService.uploadFile.mockResolvedValue(undefined);

      await controller.uploadFile(
        mockUser,
        "project-123",
        "org-123",
        chunkedData,
        mockFile,
      );

      expect(fileService.uploadFile).toHaveBeenCalledWith(
        mockUser,
        mockFile,
        "project-123",
        "org-123",
        chunkedData,
      );
    });

    it("should call service without awaiting", async () => {
      fileService.uploadFile.mockResolvedValue(undefined);

      await controller.uploadFile(
        mockUser,
        "project-123",
        "org-123",
        mockUploadData,
        mockFile,
      );

      expect(fileService.uploadFile).toHaveBeenCalledWith(
        mockUser,
        mockFile,
        "project-123",
        "org-123",
        mockUploadData,
      );
    });

    it("should handle file with different types", async () => {
      const imageData: UploadData = {
        ...mockUploadData,
        type: "image/png",
        file_name: "image.png",
      };

      const imageFile: UploadedFilePart = {
        ...mockFile,
        mimetype: "image/png",
        originalname: "image.png",
      };

      fileService.uploadFile.mockResolvedValue(undefined);

      await controller.uploadFile(
        mockUser,
        "project-123",
        "org-123",
        imageData,
        imageFile,
      );

      expect(fileService.uploadFile).toHaveBeenCalledWith(
        mockUser,
        imageFile,
        "project-123",
        "org-123",
        imageData,
      );
    });

    it("should handle empty file buffer", async () => {
      const emptyFile: UploadedFilePart = {
        ...mockFile,
        buffer: Buffer.from(""),
        size: 0,
      };

      fileService.uploadFile.mockResolvedValue(undefined);

      await controller.uploadFile(
        mockUser,
        "project-123",
        "org-123",
        mockUploadData,
        emptyFile,
      );

      expect(fileService.uploadFile).toHaveBeenCalledWith(
        mockUser,
        emptyFile,
        "project-123",
        "org-123",
        mockUploadData,
      );
    });

    it("should handle undefined file properties gracefully", async () => {
      const partialFile = {
        buffer: Buffer.from("test"),
      } as UploadedFilePart;

      fileService.uploadFile.mockResolvedValue(undefined);

      await controller.uploadFile(
        mockUser,
        "project-123",
        "org-123",
        mockUploadData,
        partialFile,
      );

      expect(fileService.uploadFile).toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("should delete file successfully", async () => {
      fileService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(
        mockUser,
        "project-123",
        "org-123",
        "file-123",
      );

      expect(result).toEqual({});
      expect(fileService.delete).toHaveBeenCalledWith(
        "file-123",
        "org-123",
        "project-123",
        mockUser,
      );
    });

    it("should handle service errors during deletion", async () => {
      const error = new Error("Delete failed");
      fileService.delete.mockRejectedValue(error);

      await expect(
        controller.delete(mockUser, "project-123", "org-123", "file-123"),
      ).rejects.toThrow("Delete failed");
    });

    it("should handle deletion of non-existent file", async () => {
      fileService.delete.mockRejectedValue(new Error("File not found"));

      await expect(
        controller.delete(mockUser, "project-123", "org-123", "non-existent"),
      ).rejects.toThrow("File not found");
    });

    it("should handle concurrent deletions", async () => {
      fileService.delete.mockResolvedValue(undefined);

      const promises = [
        controller.delete(mockUser, "project-123", "org-123", "file-1"),
        controller.delete(mockUser, "project-123", "org-123", "file-2"),
        controller.delete(mockUser, "project-123", "org-123", "file-3"),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([{}, {}, {}]);
      expect(fileService.delete).toHaveBeenCalledTimes(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle null parameters gracefully", async () => {
      // The controller doesn't validate null parameters, it just passes them to the service
      fileService.uploadFile.mockResolvedValue(undefined);

      await controller.uploadFile(
        null as any,
        "project-123",
        "org-123",
        mockUploadData,
        mockFile,
      );

      expect(fileService.uploadFile).toHaveBeenCalledWith(
        null,
        mockFile,
        "project-123",
        "org-123",
        mockUploadData,
      );
    });

    it("should handle very long file names", async () => {
      const longFileName = `${"a".repeat(255)}.txt`;
      const longUploadData: UploadData = {
        ...mockUploadData,
        file_name: longFileName,
      };

      fileService.uploadFile.mockResolvedValue(undefined);

      await controller.uploadFile(
        mockUser,
        "project-123",
        "org-123",
        longUploadData,
        mockFile,
      );

      expect(fileService.uploadFile).toHaveBeenCalledWith(
        mockUser,
        mockFile,
        "project-123",
        "org-123",
        longUploadData,
      );
    });

    it("should handle malformed upload data", async () => {
      const malformedData = {
        type: "text/plain",
        // Missing required fields
      } as UploadData;

      fileService.uploadFile.mockResolvedValue(undefined);

      await controller.uploadFile(
        mockUser,
        "project-123",
        "org-123",
        malformedData,
        mockFile,
      );

      expect(fileService.uploadFile).toHaveBeenCalledWith(
        mockUser,
        mockFile,
        "project-123",
        "org-123",
        malformedData,
      );
    });
  });
});
