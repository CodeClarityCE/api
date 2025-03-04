import { Module } from '@nestjs/common';
import { ApiKeysController } from './apiKeys.controller';
import { ApiKeysService } from './apiKeys.service';

@Module({
    imports: [],
    providers: [ApiKeysService],
    controllers: [ApiKeysController]
})
export class ApiKeysModule {}
