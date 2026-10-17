import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
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

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${user.tenantId}/contracts/${contractId}/${randomUUID()}`;
    await this.storage.put(storageKey, file.buffer);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Cùng tên file trong một hợp đồng ⇒ tăng phiên bản.
        const latest = await tx.contractDocument.findFirst({
          where: { contractId, fileName, deletedAt: null },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const doc = await tx.contractDocument.create({
          data: {
            tenantId: user.tenantId,
            contractId,
            fileName,
            mimeType,
            size: file.size,
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
            action: 'contract.document_upload',
            entityType: 'contract',
            entityId: contractId,
            data: { code: contract.code, documentId: doc.id, fileName, version: doc.version, sha256 },
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

  async getForDownload(user: AuthUser, contractId: string, documentId: string) {
    await this.contracts.get(user, contractId);
    const doc = await this.prisma.contractDocument.findFirst({
      where: { id: documentId, contractId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu');
    return { doc, stream: this.storage.read(doc.storageKey) };
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
