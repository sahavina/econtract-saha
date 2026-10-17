import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

/** Chuẩn hóa mọi lỗi về dạng { statusCode, message, errors? } và ẩn chi tiết lỗi nội bộ. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
      return res.status(status).json({ ...payload, statusCode: status });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return res
          .status(HttpStatus.CONFLICT)
          .json({ statusCode: 409, message: 'Dữ liệu bị trùng (mã hoặc giá trị duy nhất đã tồn tại)' });
      }
      if (exception.code === 'P2025') {
        return res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Không tìm thấy dữ liệu' });
      }
      if (exception.code === 'P2003') {
        return res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'Tham chiếu dữ liệu không hợp lệ' });
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, message: 'Lỗi hệ thống, vui lòng thử lại sau' });
  }
}
