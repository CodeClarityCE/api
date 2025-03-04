import { Module } from '@nestjs/common';
import { PluginController } from './plugin.controller';
import { PluginService } from './plugin.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plugin } from 'src/entity/plugin/Plugin';

@Module({
    imports: [TypeOrmModule.forFeature([Plugin], 'plugin')],
    providers: [PluginService],
    controllers: [PluginController]
})
export class PluginModule {}
