import { Module } from "@nestjs/common";
import { ApiKeysController } from "./apiKeys.controller";
import { ApiKeysService } from "./apiKeys.service";

@Module({
  providers: [ApiKeysService],
  controllers: [ApiKeysController],
})
export class ApiKeysModule {}
