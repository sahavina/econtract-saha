import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { Env } from '../config/env.js';

/** Giao diện chung của các driver lưu trữ file nhị phân. Key luôn do backend sinh (tenantId/…/uuid). */
export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
  /** Kiểm tra kết nối cho health check; ném lỗi nếu không dùng được. */
  check(): Promise<void>;
}

/** File không tồn tại trong kho (đã bị xóa thủ công, chuyển driver chưa di chuyển dữ liệu…). */
export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(`Không tìm thấy file trong kho lưu trữ: ${key}`);
  }
}

/** Key hợp lệ: các đoạn [A-Za-z0-9._-] ngăn bởi "/", không có "..", không bắt đầu bằng "/". */
export function assertValidKey(key: string) {
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(key) || key.split('/').some((p) => p === '..' || p === '.')) {
    throw new Error(`Storage key không hợp lệ: ${key}`);
  }
}

/** Lưu trên đĩa (thư mục STORAGE_DIR). Dùng cho phát triển hoặc máy chủ đơn có volume bền vững. */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  /** Chuyển key thành đường dẫn tuyệt đối, chặn path traversal. */
  private pathOf(key: string): string {
    assertValidKey(key);
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error(`Storage key không hợp lệ: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.pathOf(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data, { flag: 'wx' });
  }

  async read(key: string): Promise<Readable> {
    const full = this.pathOf(key);
    try {
      await access(full);
    } catch {
      throw new StorageNotFoundError(key);
    }
    return createReadStream(full);
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async check(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root);
  }
}

export interface S3Options {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  /** Tiền tố key trong bucket (ví dụ "econtract/"), cho phép dùng chung bucket. */
  prefix: string;
  serverSideEncryption?: ServerSideEncryption;
}

/** S3 hoặc dịch vụ tương thích (MinIO, Wasabi, Viettel/VNPT Object Storage…). */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';

  constructor(
    private readonly opts: S3Options,
    private readonly client: S3Client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle,
      // Không đặt khóa ⇒ SDK tự lấy từ IAM role / biến môi trường chuẩn AWS.
      credentials:
        opts.accessKeyId && opts.secretAccessKey
          ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
          : undefined,
    }),
  ) {}

  private objectKey(key: string) {
    assertValidKey(key);
    return this.opts.prefix + key;
  }

  async put(key: string, data: Buffer, contentType = 'application/octet-stream'): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: this.objectKey(key),
        Body: data,
        ContentType: contentType,
        ContentLength: data.length,
        ServerSideEncryption: this.opts.serverSideEncryption,
      }),
    );
  }

  async read(key: string): Promise<Readable> {
    const res = await this.client
      .send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: this.objectKey(key) }))
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'NoSuchKey') throw new StorageNotFoundError(key);
        throw e;
      });
    if (!res.Body) throw new Error(`Không đọc được object ${key}`);
    return res.Body instanceof Readable ? res.Body : Readable.from(await res.Body.transformToByteArray());
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: this.objectKey(key) }));
  }

  async check(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.opts.bucket }));
  }
}

/**
 * Lưu trữ file nhị phân; chọn driver theo STORAGE_DRIVER ("local" | "s3").
 * Chuyển driver không tự di chuyển dữ liệu cũ – xem docs/DEPLOYMENT.md.
 */
@Injectable()
export class StorageService implements StorageDriver {
  private readonly driver: StorageDriver;

  constructor(config: ConfigService<Env, true>) {
    const env = (k: keyof Env) => config.get(k, { infer: true });
    this.driver =
      env('STORAGE_DRIVER') === 's3'
        ? new S3StorageDriver({
            bucket: env('S3_BUCKET') as string,
            region: env('S3_REGION') as string,
            endpoint: (env('S3_ENDPOINT') as string | undefined) || undefined,
            accessKeyId: env('S3_ACCESS_KEY_ID') as string | undefined,
            secretAccessKey: env('S3_SECRET_ACCESS_KEY') as string | undefined,
            forcePathStyle: env('S3_FORCE_PATH_STYLE') as boolean,
            prefix: env('S3_PREFIX') as string,
            serverSideEncryption: (env('S3_SSE') as ServerSideEncryption | undefined) || undefined,
          })
        : new LocalStorageDriver(env('STORAGE_DIR') as string);
    new Logger('Storage').log(`Driver lưu trữ: ${this.driver.name}`);
  }

  get name() {
    return this.driver.name;
  }

  put(key: string, data: Buffer, contentType?: string) {
    return this.driver.put(key, data, contentType);
  }

  read(key: string) {
    return this.driver.read(key);
  }

  remove(key: string) {
    return this.driver.remove(key);
  }

  check() {
    return this.driver.check();
  }
}
