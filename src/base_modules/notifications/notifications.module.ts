import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { User } from '../users/users.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Notification, User], 'codeclarity')],
    controllers: [NotificationsController]
})
export class NotificationsModule {}
