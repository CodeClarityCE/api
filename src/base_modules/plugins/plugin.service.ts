import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plugin } from './plugin.entity';
import { PluginsRepository } from './plugin.repository';
@Injectable()
export class PluginService {
    constructor(
        private readonly pluginsRepository: PluginsRepository
    ) {}

    /**
     * Get a plugin
     * @param pluginId The id of the plugin
     * @returns the plugin
     */
    async get(pluginId: string): Promise<Plugin> {
        return this.pluginsRepository.getById(pluginId)
    }

    /**
     * Get all plugins
     * @returns all plugins
     */
    async getAll(): Promise<Array<Plugin>> {
        return this.pluginsRepository.getAll()
    }
}
