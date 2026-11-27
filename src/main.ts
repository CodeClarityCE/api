// Import necessary modules and classes from NestJS and Fastify libraries
import compression from "@fastify/compress";
import multipart from "@fastify/multipart";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { useGlobalHandlers } from "./app.globals";
import { AppModule } from "./app.module";
import {
  ACCESS_COOKIE,
  CSRF_HEADER,
} from "./base_modules/auth/session-cookies";
import { UPLOAD_FILE_SIZE_LIMIT } from "./base_modules/file/upload-limits";

/**
 * The main entry point of the application.
 */
async function bootstrap(): Promise<void> {
  // Create a new NestJS application instance using Fastify as the underlying server
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.register(multipart, {
    limits: { fileSize: UPLOAD_FILE_SIZE_LIMIT },
  });
  /**
   * Add a polyfill to make Passport.js compatible with Fastify.
   * This is necessary because Fastify has a different API than Express.js.
   */
  interface RawResponse {
    setHeader: (key: string, value: string) => void;
    end: () => void;
  }

  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", (request, reply, done) => {
      // Set up the reply object to mimic the Express.js API
      interface ReplyWithPolyfill {
        raw: RawResponse;
        setHeader?: (key: string, value: string) => void;
        end?: () => void;
      }
      interface RequestWithRes {
        res?: unknown;
      }

      (reply as unknown as ReplyWithPolyfill).setHeader = function (
        this: { raw: RawResponse },
        key: string,
        value: string,
      ) {
        return this.raw.setHeader(key, value);
      };
      (reply as unknown as ReplyWithPolyfill).end = function (this: {
        raw: RawResponse;
      }) {
        this.raw.end();
      };
      (request as unknown as RequestWithRes).res = reply;
      done();
    });

  // No CORS: the app is same-origin, and other origins must fail the preflight (ADR 0025).

  useGlobalHandlers(app);

  /**
   * Set up Swagger documentation for the API.
   */
  const config = new DocumentBuilder()
    .setTitle("API Documentation")
    .setDescription("")
    .setVersion("1.0")
    .addTag("")
    .addBearerAuth({
      type: "http",
      scheme: "bearer",
      description:
        "An Organization token, on routes that allow one. User access tokens are refused as bearers.",
    })
    .addCookieAuth(ACCESS_COOKIE, {
      type: "apiKey",
      in: "cookie",
      description: "A web sign-in, set by POST /auth/authenticate",
    })
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: CSRF_HEADER,
        description: "Must be 1 on every request a web sign-in authenticates",
      },
      "csrf-header",
    )
    .addServer("/api")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api_doc", app, document);

  // Register the compression middleware to enable gzip and deflate encoding
  await app.register(compression, {
    encodings: ["gzip", "deflate"],
  });

  // Start listening on the specified port and host
  await app.listen(process.env["PORT"]!, "0.0.0.0");
}

// Call the bootstrap function to start the application
void bootstrap();
