import { Controller, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ALL_PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type NotificationQuery, notificationQuerySchema, NotificationsService } from './notifications.service.js';

/** Thông báo của chính người dùng đăng nhập (không cần quyền nghiệp vụ riêng). */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@RequireAnyPermission(...ALL_PERMISSIONS)
class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(notificationQuerySchema)) q: NotificationQuery) {
    return this.notifications.list(user, q);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user, id);
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
