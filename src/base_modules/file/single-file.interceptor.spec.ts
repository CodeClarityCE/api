import multipart from "@fastify/multipart";
import { BadRequestException, type ExecutionContext } from "@nestjs/common";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { firstValueFrom, of } from "rxjs";

import {
  SingleFileInterceptor,
  type UploadedFilePart,
} from "./single-file.interceptor";

type ParsedRequest = Omit<FastifyRequest, "file"> & {
  file: UploadedFilePart | undefined;
};

const BOUNDARY = "test-boundary";

const filePart = (field: string, content: string): string =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"; filename="a.json"\r\nContent-Type: application/json\r\n\r\n${content}\r\n`;

const textPart = (field: string, value: string): string =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"\r\n\r\n${value}\r\n`;

describe("SingleFileInterceptor", () => {
  let app: FastifyInstance;
  let seen: { body: unknown; file: UploadedFilePart | undefined };

  beforeEach(async () => {
    app = Fastify();
    await app.register(multipart, { limits: { fileSize: 16 } });
    app.patch("/upload", async (request, reply) => {
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      try {
        const result = await new SingleFileInterceptor().intercept(context, {
          handle: () => of("handled"),
        });
        await firstValueFrom(result);
        const parsed = request as unknown as ParsedRequest;
        seen = { body: parsed.body, file: parsed.file };
        return await reply.send({ ok: true });
      } catch (error) {
        const status =
          error instanceof BadRequestException
            ? 400
            : (error as { statusCode: number }).statusCode;
        return reply.status(status).send({ ok: false });
      }
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const upload = (payload: string) =>
    app.inject({
      method: "PATCH",
      url: "/upload",
      headers: {
        "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
      },
      payload: `${payload}--${BOUNDARY}--\r\n`,
    });

  it("exposes the file and the text fields", async () => {
    const response = await upload(
      textPart("type", "application/json") + filePart("file", "content"),
    );

    expect(response.statusCode).toBe(200);
    expect(seen.body).toEqual(
      expect.objectContaining({ type: "application/json" }),
    );
    expect(seen.file).toMatchObject({
      fieldname: "file",
      originalname: "a.json",
      mimetype: "application/json",
      size: 7,
    });
    expect(seen.file?.buffer.toString()).toBe("content");
  });

  it("leaves requests without a file part with no file", async () => {
    const response = await upload(textPart("type", "x"));

    expect(response.statusCode).toBe(200);
    expect(seen.file).toBeUndefined();
  });

  it("rejects a file sent under another field name", async () => {
    const response = await upload(filePart("other", "content"));

    expect(response.statusCode).toBe(400);
  });

  it("rejects a second file", async () => {
    const response = await upload(
      filePart("file", "one") + filePart("file", "two"),
    );

    expect(response.statusCode).toBe(400);
  });

  it("enforces the configured size limit", async () => {
    const response = await upload(filePart("file", "x".repeat(17)));

    expect(response.statusCode).toBe(413);
  });
});
