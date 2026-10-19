import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { PlanLimitsService } from '../platform/plan-limits.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageNotFoundError, StorageService } from '../storage/storage.service.js';
import { ALLOWED_EXTENSIONS, detectFileType, normalizeFileName } from './file-types.js';

const documentSelect = {
  id: true,
  kind: true,
  fileName: true,
  mimeType: true,
  size: true,
  sha256: true,
  version: true,
  scanStatus: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
    private readonly limits: PlanLimitsService,
  ) {}

  async list(user: AuthUser, contractId: string) {
    await this.contracts.get(user, contractId);
    return this.prisma.contractDocument.findMany({
      where: { tenantId: user.tenantId, contractId, deletedAt: null },
      select: documentSelect,
      orderBy: [{ fileName: 'asc' }, { version: 'desc' }],
    });
  }

  async upload(user: AuthUser, contractId: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Vui lòng chọn file để tải lên');
    const contract = await this.contracts.get(user, contractId);
    if (contract.deletedAt || contract.archivedAt) {
      throw new BadRequestException('Hợp đồng đã lưu trữ hoặc ở thùng rác, không thể thêm tài liệu');
    }
    if (contract.status === 'PENDING_APPROVAL' || contract.status === 'PENDING_SIGNATURE') {
      throw new BadRequestException(
        'Hợp đồng đang chờ phê duyệt/ký, hãy rút lại hoặc hủy yêu cầu trước khi thay đổi tài liệu',
      );
    }

    const fileName = normalizeFileName(file.originalname);
    const mimeType = detectFileType(fileName, file.buffer);
    if (!mimeType) {
      throw new BadRequestException(
        `Định dạng không được hỗ trợ hoặc nội dung không khớp đuôi file. Cho phép: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    return this.storeVersion(user, contract, { fileName, mimeType, buffer: file.buffer }, 'contract.document_upload');
  }

  /**
   * Lưu tệp vào kho và tạo bản ghi tài liệu; cùng tên tệp trong một hợp đồng ⇒ phiên bản mới.
   * Dùng cho tải lên và cho bản PDF đã ký số (ký số tạo phiên bản kế tiếp của chính tệp đó).
   */
  async storeVersion(
    user: AuthUser,
    contract: { id: string; code: string },
    file: { fileName: string; mimeType: string; buffer: Buffer },
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    const { fileName, mimeType, buffer } = file;
    await this.limits.assertStorage(user.tenantId, buffer.length);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const storageKey = `${user.tenantId}/contracts/${contract.id}/${randomUUID()}`;
    await this.storage.put(storageKey, buffer, mimeType);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const latest = await tx.contractDocument.findFirst({
          where: { contractId: contract.id, fileName, deletedAt: null },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const doc = await tx.contractDocument.create({
          data: {
            tenantId: user.tenantId,
            contractId: contract.id,
            fileName,
            mimeType,
            size: buffer.length,
            sha256,
            version: (latest?.version ?? 0) + 1,
            storageKey,
            uploadedById: user.userId,
          },
          select: documentSelect,
        });
        await this.audit.log(
          user,
          {
            action,
            entityType: 'contract',
            entityId: contract.id,
            data: { code: contract.code, documentId: doc.id, fileName, version: doc.version, sha256, ...extra },
          },
          tx,
        );
        return doc;
      });
    } catch (err) {
      // Không để file mồ côi khi ghi DB thất bại.
      await this.storage.remove(storageKey);
      throw err;
    }
  }

  /** Đọc toàn bộ nội dung một tài liệu (đã kiểm tra quyền xem hợp đồng). */
  async readBuffer(user: AuthUser, contractId: string, documentId: string) {
    const { doc, stream } = await this.getForDownload(user, contractId, documentId);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
    return { doc, buffer: Buffer.concat(chunks) };
  }

  async getForDownload(user: AuthUser, contractId: string, documentId: string) {
    await this.contracts.get(user, contractId);
    const doc = await this.prisma.contractDocument.findFirst({
      where: { id: documentId, contractId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu');
    try {
      return { doc, stream: await this.storage.read(doc.storageKey) };
    } catch (err) {
      if (err instanceof StorageNotFoundError) throw new NotFoundException('File tài liệu không còn trong kho lưu trữ');
      throw err;
    }
  }

  /** Xóa mềm: giữ file trên storage để phục vụ truy vết. */
  async remove(user: AuthUser, contractId: string, documentId: string) {
    const contract = await this.contracts.get(user, contractId);
    if (contract.deletedAt || contract.archivedAt) {
      throw new BadRequestException('Hợp đồng đã lưu trữ hoặc ở thùng rác, không thể xóa tài liệu');
    }
    if (contract.status === 'PENDING_APPROVAL' || contract.status === 'PENDING_SIGNATURE') {
      throw new BadRequestException(
        'Hợp đồng đang chờ phê duyệt/ký, hãy rút lại hoặc hủy yêu cầu trước khi thay đổi tài liệu',
      );
    }
    if (contract.signatureStatus === 'COMPLETED') {
      throw new BadRequestException('Hợp đồng đã ký, không được xóa tài liệu (tài liệu là một phần bằng chứng ký)');
    }
    const doc = await this.prisma.contractDocument.findFirst({
      where: { id: documentId, contractId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu');
    await this.prisma.$transaction(async (tx) => {
      await tx.contractDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        user,
        {
          action: 'contract.document_delete',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code, documentId: doc.id, fileName: doc.fileName, version: doc.version },
        },
        tx,
      );
    });
  }
}
