import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import type { AuthenticatedUser } from "src/base_modules/auth/auth.types";

import { LogsController } from "./logs.controller";

@Module({
  imports: [
    // About 30 error reports a minute per signed-in user; used only by LogsController.
    ThrottlerModule.forRoot({
      throttlers: [{ name: "error-reports", ttl: 60_000, limit: 30 }],
      getTracker: (req: { user?: AuthenticatedUser }) =>
        req.user?.userId ?? "anonymous",
    }),
  ],
  controllers: [LogsController],
})
export class LogsModule {}
