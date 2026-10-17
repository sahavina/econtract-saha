import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../config/env.js';
import { assertValidKey, LocalStorageDriver, S3StorageDriver, StorageNotFoundError } from './storage.service.js';

const readAll = async (s: Readable) => {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString();
};

describe('storage keys', () => {
  it('accepts generated keys and rejects traversal', () => {
    expect(() => assertValidKey('t1/contracts/c1/abc-123')).not.toThrow();
    for (const bad of ['../x', 't/../x', '/abs', 't//x', 't/./x', 't\\x', 'a b', '']) {
      expect(() => assertValidKey(bad), bad).toThrow();
    }
  });
});

describe('LocalStorageDriver', () => {
  let dir: string;
  let driver: LocalStorageDriver;
  beforeAll(async () => {
    dir = await mkdtemp(join(process.env.TEMP ?? tmpdir(), 'saha-storage-'));
    driver = new LocalStorageDriver(dir);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('round-trips, refuses overwrite, reports missing files', async () => {
    await driver.check();
    await driver.put('t1/a/file1', Buffer.from('xin chào'));
    expect(await readAll(await driver.read('t1/a/file1'))).toBe('xin chào');
    await expect(driver.put('t1/a/file1', Buffer.from('x'))).rejects.toThrow();
    await driver.remove('t1/a/file1');
    await expect(driver.read('t1/a/file1')).rejects.toBeInstanceOf(StorageNotFoundError);
    await driver.remove('t1/a/file1'); // xóa lần hai không lỗi
  });
});

describe('S3StorageDriver', () => {
  const send = vi.fn();
  const driver = new S3StorageDriver(
    { bucket: 'econtract', region: 'us-east-1', forcePathStyle: true, prefix: 'prod/', serverSideEncryption: 'AES256' },
    { send } as unknown as S3Client,
  );

  it('puts with prefix, content type and encryption', async () => {
    send.mockResolvedValueOnce({});
    await driver.put('t1/c/k1', Buffer.from('abc'), 'application/pdf');
    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: 'econtract',
      Key: 'prod/t1/c/k1',
      ContentType: 'application/pdf',
      ContentLength: 3,
      ServerSideEncryption: 'AES256',
    });
  });

  it('streams objects and maps NoSuchKey', async () => {
    send.mockResolvedValueOnce({ Body: Readable.from([Buffer.from('nội dung')]) });
    expect(await readAll(await driver.read('t1/c/k1'))).toBe('nội dung');
    expect((send.mock.lastCall![0] as GetObjectCommand).input.Key).toBe('prod/t1/c/k1');

    send.mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
    await expect(driver.read('t1/c/k2')).rejects.toBeInstanceOf(StorageNotFoundError);
    send.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await expect(driver.read('t1/c/k2')).rejects.toThrow('denied');
  });

  it('deletes with prefix and rejects bad keys before calling S3', async () => {
    send.mockClear().mockResolvedValueOnce({});
    await driver.remove('t1/c/k1');
    expect((send.mock.calls[0][0] as DeleteObjectCommand).input.Key).toBe('prod/t1/c/k1');
    await expect(driver.remove('../etc/passwd')).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('environment', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_ACCESS_SECRET: 'a'.repeat(40) };

  it('parses booleans literally and requires a bucket for s3', () => {
    expect(validateEnv({ ...base, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(false);
    expect(validateEnv(base).S3_FORCE_PATH_STYLE).toBe(true);
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET/);
    expect(validateEnv({ ...base, STORAGE_DRIVER: 's3', S3_BUCKET: 'b', S3_ENDPOINT: '' }).S3_ENDPOINT).toBeUndefined();
    expect(() => validateEnv({ ...base, S3_PREFIX: 'no-slash' })).toThrow(/S3_PREFIX/);
  });

  it('rejects example secrets and missing SMTP in production', () => {
    const prod = { ...base, NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' };
    expect(() => validateEnv(prod)).not.toThrow();
    expect(() => validateEnv({ ...prod, JWT_ACCESS_SECRET: 'dev-access-secret-change-me-0123456789abcdef' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() => validateEnv({ ...prod, SMTP_HOST: '' })).toThrow(/SMTP_HOST/);
  });
});
