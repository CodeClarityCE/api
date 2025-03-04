import { Body, Controller, Post } from '@nestjs/common';
import { NonAuthEndpoint } from 'src/decorators/SkipAuthDecorator';
import { NoDataResponse } from 'src/types/apiResponses';
import { EmailUnsubscribePostBody } from 'src/types/entities/frontend/EmailUnsubscription';
import { EmailUnsubscriptionService } from './emailUnsubscriptions.service';

@Controller('email_unsubscribe')
export class EmailUnsubscriptionController {
    constructor(private readonly emailUnsubscribeService: EmailUnsubscriptionService) {}

    @NonAuthEndpoint()
    @Post('')
    async unsubscribeViaEmailLink(@Body() body: EmailUnsubscribePostBody): Promise<NoDataResponse> {
        await this.emailUnsubscribeService.unsubscribeViaEmailLink(body.token, body.email_digest);
        return {};
    }
}
