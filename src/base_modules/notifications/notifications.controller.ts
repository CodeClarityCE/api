import {
    Controller,
    Get,
    Query,
    DefaultValuePipe,
    ParseIntPipe,
    Param,
    Delete,
    HttpException,
    HttpStatus
} from '@nestjs/common';
import { NoDataResponse, TypedPaginatedResponse } from 'src/types/apiResponses.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { User } from '../users/users.entity';

@Controller('/notifications')
export class NotificationsController {
    constructor(
        @InjectRepository(Notification, 'codeclarity')
        private readonly notificationsRepo: Repository<Notification>,
        @InjectRepository(User, 'codeclarity')
        private readonly usersRepo: Repository<User>
    ) {}

    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page = 0,
        @Query('entries_per_page', new DefaultValuePipe(10), ParseIntPipe) entries_per_page = 10
    ): Promise<TypedPaginatedResponse<Notification>> {
        const skip = page * entries_per_page;

        const qb = this.notificationsRepo
            .createQueryBuilder('n')
            .leftJoin('n.users', 'u')
            .where('u.id = :uid', { uid: user.userId })
            .orderBy('n.id', 'DESC');

        const [rows, count] = await qb.skip(skip).take(entries_per_page).getManyAndCount();

        return {
            data: rows,
            page,
            entry_count: rows.length,
            entries_per_page,
            total_entries: count,
            total_pages: Math.ceil(count / entries_per_page),
            matching_count: count,
            filter_count: {}
        };
    }

    @Delete(':notification_id')
    async delete(
        @AuthUser() user: AuthenticatedUser,
        @Param('notification_id') notification_id: string
    ): Promise<NoDataResponse> {
        const notif = await this.notificationsRepo
            .createQueryBuilder('n')
            .leftJoin('n.users', 'u')
            .where('n.id = :nid', { nid: notification_id })
            .andWhere('u.id = :uid', { uid: user.userId })
            .getOne();
        if (!notif) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
        // Instead of removing globally, just detach this user
        await this.notificationsRepo
            .createQueryBuilder()
            .relation(Notification, 'users')
            .of(notif)
            .remove(user.userId);
        return {};
    }

    @Delete('')
    async deleteAll(@AuthUser() user: AuthenticatedUser): Promise<NoDataResponse> {
        // Fetch all notifications for user and detach
        const notifs = await this.notificationsRepo
            .createQueryBuilder('n')
            .leftJoin('n.users', 'u')
            .where('u.id = :uid', { uid: user.userId })
            .getMany();
        if (notifs.length > 0) {
            for (const notif of notifs) {
                await this.notificationsRepo
                    .createQueryBuilder()
                    .relation(Notification, 'users')
                    .of(notif)
                    .remove(user.userId);
            }
        }
        return {};
    }
}
