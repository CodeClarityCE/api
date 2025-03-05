import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { EmailUnsubscriptionController } from './emailUnsubscriptions/emailUnsubscriptions.controller';
import { EmailUnsubscriptionService } from './emailUnsubscriptions/emailUnsubscriptions.service';
import { EmailRepository } from './email.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Email } from 'src/base_modules/email/email.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Email],
            'codeclarity'
        ),
        MailerModule.forRootAsync({
            useFactory: (config: ConfigService) => ({
                transport: {
                    host: config.getOrThrow<string>('MAIL_HOST'),
                    port: config.getOrThrow<number>('MAIL_PORT'),
                    requireTLS: true,
                    auth: {
                        user: config.getOrThrow<string>('MAIL_AUTH_USER'),
                        pass: process.env.MAIL_AUTH_PASSWORD
                    }
                },
                preview: false,
                defaults: {
                    from: config.getOrThrow<string>('MAIL_DEFAULT_FROM')
                },
                template: {
                    dir: join(__dirname, 'templates'),
                    adapter: new HandlebarsAdapter(),
                    options: {
                        strict: true
                    }
                },
                options: {
                    partials: {
                        dir: join(__dirname, 'templates', 'partials'),
                        options: {
                            strict: true
                        }
                    }
                }
            }),
            inject: [ConfigService]
        })
    ],
    providers: [EmailService, EmailUnsubscriptionService, EmailRepository],
    exports: [EmailService, EmailRepository],
    controllers: [EmailUnsubscriptionController]
})
export class EmailModule { }
