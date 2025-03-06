import {
    Controller,
    Get,
    Query,
    DefaultValuePipe,
    ParseIntPipe,
    Param,
    Delete
} from '@nestjs/common';
import { NoDataResponse, TypedPaginatedResponse } from 'src/types/apiResponses';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';

@Controller('/notifications')
export class NotificationsController {
    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number
    ): Promise<TypedPaginatedResponse<Notification>> {
        throw new Error('Method not implemented.');
    }

    @Delete(':notification_id')
    async delete(
        @AuthUser() user: AuthenticatedUser,
        @Param('notification_id') notification_id: string
    ): Promise<NoDataResponse> {
        throw new Error('Method not implemented.');
    }

    @Delete('')
    async deleteAll(@AuthUser() user: AuthenticatedUser): Promise<NoDataResponse> {
        throw new Error('Method not implemented.');
    }
}
