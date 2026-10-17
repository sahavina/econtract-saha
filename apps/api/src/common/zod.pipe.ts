import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Kiểm tra & chuẩn hóa dữ liệu đầu vào bằng Zod. Trả lỗi theo từng trường. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Dữ liệu không hợp lệ',
        errors: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
