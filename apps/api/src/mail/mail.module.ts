import { Global, Module } from '@nestjs/common';
import { SmtpSettingsController } from './mail.controller.js';
import { MailService } from './mail.service.js';
import { SmtpSettingsService } from './smtp-settings.service.js';

@Global()
@Module({
  controllers: [SmtpSettingsController],
  providers: [MailService, SmtpSettingsService],
  exports: [MailService],
})
export class MailModule {}
