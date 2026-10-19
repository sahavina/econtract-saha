import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BadRequestException,
  Controller,
  Injectable,
  Logger,
  Post,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import { memoryStorage } from 'multer';
import { RequireAnyPermission } from '../common/decorators.js';
import type { Env } from '../config/env.js';
import { ALLOWED_FILE_TYPES, MAX_UPLOAD_BYTES } from './file-types.js';

const DOCX_MIME = ALLOWED_FILE_TYPES.docx.mime;
const OLE = ALLOWED_FILE_TYPES.doc.signature;
/** Quá thời gian này coi như file lỗi/độc hại – dừng LibreOffice. */
const CONVERT_TIMEOUT_MS = 60_000;

/**
 * Chuyển Word 97–2003 (.doc) sang .docx bằng LibreOffice (headless) để trình duyệt đọc được như file .docx
 * (tự điền thông tin, chép nội dung). Chạy lần lượt từng file, mỗi lần một hồ sơ LibreOffice riêng trong thư mục tạm.
 */
@Injectable()
export class DocConvertService {
  private readonly logger = new Logger(DocConvertService.name);
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ConfigService<Env, true>) {}

  convert(data: Buffer): Promise<Buffer> {
    if (data.length < OLE.length || !OLE.every((b, i) => data[i] === b)) {
      throw new BadRequestException('Tệp không phải định dạng Word 97–2003 (.doc)');
    }
    // Một lần một file: LibreOffice tốn RAM/CPU, máy chủ dùng chung với dịch vụ khác.
    const run = this.queue.then(() => this.run(data));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async run(data: Buffer): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'econtract-doc-'));
    try {
      const input = join(dir, 'input.doc');
      await writeFile(input, data);
      const soffice = this.config.get('SOFFICE_PATH', { infer: true }) ?? 'soffice';
      await new Promise<void>((resolve, reject) => {
        execFile(
          soffice,
          [
            '--headless',
            '--norestore',
            '--nolockcheck',
            `-env:UserInstallation=${pathToFileURL(join(dir, 'profile')).href}`,
            '--convert-to',
            'docx',
            '--outdir',
            dir,
            input,
          ],
          { timeout: CONVERT_TIMEOUT_MS, killSignal: 'SIGKILL', windowsHide: true },
          (err) => {
            if (!err) return resolve();
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              return reject(new ServiceUnavailableException('Máy chủ chưa cài bộ chuyển đổi .doc – hãy lưu tệp thành .docx trong Word rồi tải lại'));
            }
            this.logger.warn(`Chuyển .doc thất bại: ${err.message}`);
            reject(new BadRequestException('Không chuyển được tệp .doc (tệp hỏng, có mật khẩu hoặc quá phức tạp) – hãy lưu thành .docx trong Word rồi tải lại'));
          },
        );
      });
      const out = await readFile(join(dir, 'input.docx')).catch(() => null);
      if (!out) throw new BadRequestException('Không chuyển được tệp .doc – hãy lưu thành .docx trong Word rồi tải lại');
      return out;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

@ApiTags('Contract documents')
@ApiBearerAuth()
@Controller('documents')
export class DocConvertController {
  constructor(private readonly converter: DocConvertService) {}

  /** Nhận .doc, trả .docx (không lưu lại tệp nào trên máy chủ). */
  @Post('convert-doc')
  @RequireAnyPermission(PERMISSIONS.CONTRACT_CREATE, PERMISSIONS.CONTRACT_UPDATE)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async convert(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Chưa chọn tệp');
    const docx = await this.converter.convert(file.buffer);
    return new StreamableFile(docx, { type: DOCX_MIME, disposition: 'attachment; filename="converted.docx"' });
  }
}
