import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/users.entity";
import { Notification } from "./notification.entity";
import { NotificationsController } from "./notifications.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User], "codeclarity")],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
