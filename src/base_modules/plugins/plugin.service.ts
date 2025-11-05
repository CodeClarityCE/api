import { Injectable } from '@nestjs/common';

import { Plugin } from './plugin.entity';
import { PluginsRepository } from './plugin.repository';
@Injectable()
export class PluginService {
    constructor(private readonly pluginsRepository: PluginsRepository) {}

    /**
     * Get a plugin
     * @param pluginId The id of the plugin
     * @returns the plugin
     */
    async get(pluginId: string): Promise<Plugin> {
        return this.pluginsRepository.getById(pluginId);
    }

    /**
     * Get all plugins
     * @returns all plugins
     */
    async getAll(): Promise<Plugin[]> {
        return this.pluginsRepository.getAll();
    }
}
