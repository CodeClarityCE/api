import { forwardRef, Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";

import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [
    EmailModule,
    forwardRef(() => AuthModule), // Service-level circular dep: UsersService <-> AuthService
  ],
  exports: [UsersService],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
