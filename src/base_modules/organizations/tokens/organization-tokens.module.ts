import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { OrganizationsModule } from "../organizations.module";

import { OrganizationToken } from "./organization-token.entity";
import { OrganizationTokensController } from "./organization-tokens.controller";
import { OrganizationTokensService } from "./organization-tokens.service";

// Global so the app-wide auth guard can resolve token secrets.
@Global()
@Module({
  imports: [
    OrganizationsModule,
    TypeOrmModule.forFeature([OrganizationToken], "codeclarity"),
  ],
  providers: [OrganizationTokensService],
  exports: [OrganizationTokensService],
  controllers: [OrganizationTokensController],
})
export class OrganizationTokensModule {}
