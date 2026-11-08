import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Observable } from "rxjs";

const FILE_FIELD = "file";

export interface UploadedFilePart {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

type UploadRequest = Omit<FastifyRequest, "file"> & {
  file: UploadedFilePart | undefined;
};

/**
 * Reads a multipart request, exposing its one "file" part through
 * `@UploadedFile()` and its text fields through `@Body()`.
 */
@Injectable()
export class SingleFileInterceptor implements NestInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    // The multipart plugin defines request.file as a method; clear it so a
    // request without a file reads as having none.
    request.file = undefined;

    // Other content types carry no file, so the controller rejects them.
    if (!request.isMultipart()) {
      return next.handle();
    }

    // No prototype, so a field name can never reach Object.prototype.
    const body = Object.create(null) as Record<string, string>;
    let uploaded: UploadedFilePart | undefined;

    for await (const part of request.parts()) {
      if (part.type !== "file") {
        body[part.fieldname] = String(part.value);
        continue;
      }
      if (part.fieldname !== FILE_FIELD || uploaded) {
        throw new BadRequestException(`Unexpected field: ${part.fieldname}`);
      }
      const buffer = await part.toBuffer();
      uploaded = {
        fieldname: part.fieldname,
        originalname: part.filename,
        encoding: part.encoding,
        mimetype: part.mimetype,
        buffer,
        size: buffer.length,
      };
    }

    request.body = body;
    request.file = uploaded;
    return next.handle();
  }
}
