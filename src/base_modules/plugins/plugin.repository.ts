import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Plugin } from './plugin.entity';
@Injectable()
export class PluginsRepository {
    constructor(
        @InjectRepository(Plugin, 'plugin')
        private pluginRepository: Repository<Plugin>
    ) {}

    /**
     * Get a plugin
     * @param pluginId The id of the plugin
     * @returns the plugin
     */
    async getById(pluginId: string): Promise<Plugin> {
        const plugin = await this.pluginRepository.findOne({ where: { id: pluginId } });
        if (!plugin) {
            throw new Error('No plugins found');
        }
        return plugin;
    }

    /**
     * Get all plugins
     * @returns all plugins
     */
    async getAll(): Promise<Plugin[]> {
        const plugins = await this.pluginRepository.find();
        if (!plugins) {
            throw new Error('No plugins found');
        }
        return plugins;
    }
}
