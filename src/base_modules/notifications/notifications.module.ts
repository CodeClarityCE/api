import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Notification],
            'codeclarity'
        )
    ],
    controllers: [NotificationsController]
})
export class NotificationsModule { }
