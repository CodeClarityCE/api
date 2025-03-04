import { Module } from '@nestjs/common';
import { PluginController } from './plugin.controller';
import { PluginService } from './plugin.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Plugin } from './plugin.entity';
import { defaultOptions } from 'src/app.module';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            name: 'plugin',
            useFactory: () => ({
                ...defaultOptions,
                database: 'plugins',
                entities: [Plugin]
            })
        }),
        TypeOrmModule.forFeature([Plugin], 'plugin')
    ],
    providers: [PluginService],
    controllers: [PluginController]
})
export class PluginModule { }
