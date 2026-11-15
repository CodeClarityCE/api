import {
  ClassSerializerInterceptor,
  type INestApplication,
  ValidationPipe,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ErrorFilter } from "./filters/ExceptionFilter";
import { ResponseBodyInterceptor } from "./interceptors/ResponseBodyInterceptor";
import { ValidationFailed } from "./types/error.types";

/** Applies the validation, error and response handling every request goes through. */
export function useGlobalHandlers(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors) => new ValidationFailed(errors),
      // Stop at the first error and don't continue validating other fields
      stopAtFirstError: true,
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
  // Adds status fields, then serialises with only exposed properties
  app.useGlobalInterceptors(new ResponseBodyInterceptor());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: true,
    }),
  );
}
