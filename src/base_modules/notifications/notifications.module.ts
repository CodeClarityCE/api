import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

@Module({
    imports: [],
    providers: [],
    controllers: [NotificationsController]
})
export class NotificationsModule {}
