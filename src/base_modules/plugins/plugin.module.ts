
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { defaultOptions } from 'src/app.module';

import { PluginController } from './plugin.controller';
import { Plugin } from './plugin.entity';
import { PluginsRepository } from './plugin.repository';
import { PluginService } from './plugin.service';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            name: 'plugin',
            useFactory: () => ({
                ...defaultOptions,
                database: 'plugins',
                entities: [Plugin],
                migrations: ['dist/src/migrations/plugins/*.js']
            })
        }),
        TypeOrmModule.forFeature([Plugin], 'plugin')
    ],
    providers: [PluginService, PluginsRepository],
    controllers: [PluginController]
})
export class PluginModule {}
