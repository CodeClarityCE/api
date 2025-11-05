import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';


/**
 * This service offers methods for working with API Keys
 */
@Injectable()
export class ApiKeysService {
    /**
     * Deletes an api key
     * @param apiKeyId The api key's id
     * @param user The authenticated user
     */
    async deleteApiKey(apiKeyId: string, user: AuthenticatedUser): Promise<void> {
        console.log(apiKeyId, user);
        throw new Error('Not implemented');
    }
}
