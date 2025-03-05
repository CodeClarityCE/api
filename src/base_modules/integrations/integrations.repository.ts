import { Injectable } from '@nestjs/common';
import { EntityNotFound, NotAuthorized } from 'src/types/errors/types';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class IntegrationsRepository {
    constructor(
        @InjectRepository(Integration, 'codeclarity')
        private integrationRepository: Repository<Integration>,
    ) { }

    async getIntegrationById(integrationId: string, organizationId: string, userId: string): Promise<Integration>  {
        const integration = await this.integrationRepository.findOne({
            relations: {
                organizations: true,
                users: true
            },
            where: {
                id: integrationId,
                organizations: {
                    id: organizationId
                },
                users: {
                    id: userId
                }
            }
        });

        if (!integration) {
            throw new EntityNotFound();
        }

        // (2) Check that the integration belongs to the org
        if (integration.organizations.find((org) => org.id == organizationId) == undefined) {
            throw new NotAuthorized();
        }
        return integration
    }
}
