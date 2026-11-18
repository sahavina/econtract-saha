import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { SecretBox } from '../integrations/secret-box.js';
import { DEFAULT_SIGNATURE_APPEARANCE, parseSignatureAppearance, signatureBoxSize, signatureTextLines } from '@saha/shared';
import { EsignService, misaSignSchema, signatureAppearanceSchema, signatureBox, signatureLogoSchema } from './esign.service.js';
import { MisaError, MisaEsignClient, pdfPageCount } from './misa-esign.client.js';

const cfg = { baseUrl: 'https://misa.test/apis/', clientId: 'cid', clientSecret: 'csec' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('MisaEsignClient', () => {
  it('đăng nhập: gửi ClientID/ClientSecret, đọc token và người dùng trong { status, data }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        status: { type: 'success', error: false },
        data: {
          remoteSigningAccessToken: 'rt',
          refreshToken: 'rf',
          expiresIn: 100,
          user: { id: 'm1', firstName: 'An', lastName: 'Nguyễn' },
        },
      }),
    );
    const r = await new MisaEsignClient(cfg, fetchMock).login('a@x.vn', 'pw');
    expect(r).toEqual({
      kind: 'ok',
      tokens: { accessToken: 'rt', refreshToken: 'rf', expiresIn: 100 },
      user: { id: 'm1', displayName: 'Nguyễn An' },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://misa.test/apis/esign/v1/auth/login-api');
    expect(init.headers).toMatchObject({ ClientID: 'cid', ClientSecret: 'csec' });
  });

  it('đăng nhập: mã lỗi 122 ⇒ cần OTP', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ status: { type: 'fail', error: true, errorCode: 122 } }, 400));
    expect(await new MisaEsignClient(cfg, fetchMock).login('a', 'b')).toEqual({ kind: 'otp' });
  });

  it('mã lỗi đã biết đổi sang thông báo tiếng Việt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ errorCode: 'Business:002' }, 400));
    await expect(new MisaEsignClient(cfg, fetchMock).certificates('t')).rejects.toMatchObject({
      code: 'Business:002',
      message: expect.stringContaining('hết số lượt ký'),
    });
  });

  it('xác thực OTP: e111 (sai mã) và e2003 (tài khoản chưa có quyền ký số từ xa) có thông báo rõ ràng', async () => {
    const reply = (errorCode: string, status: number, userMsg: string) =>
      vi
        .fn()
        .mockResolvedValue(
          json({ status: { type: 'fail', error: true, errorCode }, userMsg, devMsg: userMsg }, status),
        );
    await expect(
      new MisaEsignClient(cfg, reply('e111', 400, 'Mã xác nhận không chính xác')).twoFactor('a@x.vn', '123456', 0),
    ).rejects.toMatchObject({
      code: 'e111',
      message: expect.stringContaining('Mã OTP không đúng'),
    });
    await expect(
      new MisaEsignClient(
        cfg,
        reply('e2003', 422, 'Tài khoản người dùng không có quyền truy cập tài nguyên'),
      ).twoFactor('a@x.vn', '123456', 0),
    ).rejects.toMatchObject({
      code: 'e2003',
      httpStatus: 422,
      message: expect.stringContaining('chưa được cấp quyền ký số từ xa'),
    });
  });

  it('chứng thư: chấp nhận tên trường sai chính tả certiticateChain; gửi AuthorizationRM', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json([{ keyAlias: 'k1', keyStatus: 'ACTIVE', certificate: 'Y2VydA==', certiticateChain: ['Y2E='] }]),
      );
    const certs = await new MisaEsignClient(cfg, fetchMock).certificates('tok');
    expect(certs[0]).toMatchObject({ keyAlias: 'k1', certificateChain: ['Y2E='] });
    expect(fetchMock.mock.calls[0][1].headers.AuthorizationRM).toBe('Bearer tok');
  });

  it('băm → ký → trạng thái → gắn chữ ký', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          PdfDocs: [
            { documentId: 'd1', digest: 'DG', documentBytes: 'DB', signatureName: 'S', sh: 'SH', documentHash: 'DH' },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ transactionId: 'tx1' }))
      .mockResolvedValueOnce(json({ status: 'SUCCESS', signatures: [{ documentId: 'd1', signature: 'SIG' }] }))
      .mockResolvedValueOnce(json({ pdfDocs: [{ documentId: 'd1', document: 'UERG' }] }));
    const c = new MisaEsignClient(cfg, fetchMock);
    const cert = { keyAlias: 'k1', keyStatus: 'ACTIVE', certificate: 'C', certificateChain: [] };
    const box = {
      page: 1,
      positionX: 1,
      positionY: 1,
      width: 1,
      height: 1,
      signedBy: 'A',
      reason: 'R',
      location: 'L',
      contact: 'c',
    };
    const hash = await c.hashPdf(cert, 'd1', 'UERG', box, 'S');
    expect(hash).toMatchObject({ documentId: 'd1', digest: 'DG', sh: 'SH' });
    expect(
      await c.signHash('t', {
        userId: 'u',
        certAlias: 'k1',
        documentId: 'd1',
        digest: 'DG',
        documentName: 'x'.repeat(150),
        display: 'Ký',
      }),
    ).toBe('tx1');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).Documents[0].DocumentName).toHaveLength(100);
    const st = await c.status('t', 'tx1');
    expect(st).toMatchObject({ status: 'SUCCESS', signatures: [{ documentId: 'd1', signature: 'SIG' }] });
    expect(await c.attach(cert, hash, 'SIG')).toBe('UERG');
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).pdfDocs[0]).toMatchObject({
      signature: 'SIG',
      documentBytes: 'DB',
      documentHash: 'DH',
    });
  });

  it('kiểm tra ClientID/Secret qua login-api tài khoản giả: sai tài khoản ⇒ hợp lệ; e401/Auth:001/lỗi mạng ⇒ không hợp lệ', async () => {
    const wrongUser = vi
      .fn()
      .mockResolvedValue(json({ status: { type: 'fail', error: true, errorCode: 'e100', userMsg: 'Tên đăng nhập hoặc mật khẩu không đúng' } }, 422));
    expect(await new MisaEsignClient(cfg, wrongUser).checkCredentials()).toMatchObject({ ok: true });
    expect(wrongUser.mock.calls[0][0]).toContain('/esign/v1/auth/login-api');
    expect(JSON.parse(wrongUser.mock.calls[0][1].body).userName).toMatch(/\.invalid$/);
    const badSecret = vi
      .fn()
      .mockResolvedValue(json({ status: { type: 'fail', error: true, errorCode: 'e401' }, userMsg: 'Không tìm thấy client.' }, 422));
    expect(await new MisaEsignClient(cfg, badSecret).checkCredentials()).toMatchObject({ ok: false, message: expect.stringContaining('ClientSecret') });
    const badClient = vi.fn().mockResolvedValue(json({ errorCode: 'Auth:001' }, 401));
    expect(await new MisaEsignClient(cfg, badClient).checkCredentials()).toEqual({
      ok: false,
      message: 'ClientID/ClientSecret MISA eSign không hợp lệ',
    });
    const offline = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await new MisaEsignClient(cfg, offline).checkCredentials()).toMatchObject({ ok: false });
  });

  it('vị trí khung chữ ký: người ký chọn (x, y) thì dùng đúng chỗ; không chọn thì cuối trang, xếp chồng theo lượt', () => {
    expect(signatureBox(misaSignSchema.parse({ page: 2, x: 100.4, y: 300.6 }), 3)).toEqual({ page: 2, positionX: 100, positionY: 301, width: 180, height: 60 });
    expect(signatureBox(misaSignSchema.parse({}), 3, 1)).toEqual({ page: 3, positionX: 375, positionY: 110, width: 180, height: 60 });
    expect(signatureBox(misaSignSchema.parse({ page: 9, position: 'BOTTOM_LEFT' }), 3)).toMatchObject({ page: 3, positionX: 40, positionY: 40 });
    // Chỉ có x (thiếu y) ⇒ coi như chưa chọn.
    expect(signatureBox(misaSignSchema.parse({ x: 10 }), 1)).toMatchObject({ positionX: 375 });
    expect(() => misaSignSchema.parse({ x: -1, y: 5 })).toThrow();
  });

  it('hiển thị chữ ký: dòng chữ theo cấu hình, khung theo bố cục/cỡ hình, ảnh và chế độ hiển thị gửi sang MISA', async () => {
    const at = new Date('2026-11-18T13:51:22Z'); // 20:51:22 giờ Việt Nam
    const a = { ...DEFAULT_SIGNATURE_APPEARANCE };
    expect(signatureTextLines(a, { owner: 'CÔNG TY SAHA', signedAt: at })).toEqual(['Ký số bởi: CÔNG TY SAHA', 'Thời gian: 18/11/2026, 20:51:22']);
    expect(
      signatureTextLines(
        { ...a, showLabels: false, showCertDetails: true, language: 'en' },
        { owner: 'SAHA', signedAt: at, cert: { serial: 'AB12', issuer: 'MISA CA', validTo: new Date('2029-11-17T06:30:56Z') } },
      ),
    ).toEqual(['SAHA', '18/11/2026, 20:51:22', 'AB12', 'MISA CA', '17/11/2029']);
    expect(signatureTextLines({ ...a, language: 'en', showTime: false }, { owner: 'SAHA', signedAt: at })).toEqual(['Signed by: SAHA']);
    expect(signatureBoxSize({ layout: 'VERTICAL', imageSize: 'L' })).toEqual({ width: 160, height: 120 });
    // Không chọn vị trí: sát lề phải theo bề rộng khung, xếp chồng theo chiều cao khung.
    expect(signatureBox(misaSignSchema.parse({}), 2, 1, { width: 220, height: 75 })).toMatchObject({ page: 2, positionX: 335, positionY: 125, width: 220, height: 75 });
    expect(parseSignatureAppearance({ layout: 'X', fontSize: 99, showLogo: true })).toEqual({ ...a, showLogo: true });
    expect(signatureAppearanceSchema.safeParse({ ...a, fontSize: 11 }).success).toBe(false);
    expect(signatureLogoSchema.safeParse({ dataUrl: 'data:image/gif;base64,AAAA' }).success).toBe(false);
    expect(signatureLogoSchema.safeParse({ dataUrl: 'data:image/png;base64,iVBORw0K' }).success).toBe(true);

    const fetchMock = vi.fn().mockImplementation(async () => json({ pdfDocs: [{ documentId: 'd1', digest: 'DG' }] }));
    const box = { page: 1, positionX: 1, positionY: 1, width: 180, height: 60, signedBy: 'A', reason: 'R', location: 'L', contact: 'c' };
    const cert = { keyAlias: 'k1', keyStatus: 'ACTIVE', certificate: 'C', certificateChain: [] };
    await new MisaEsignClient(cfg, fetchMock).hashPdf(cert, 'd1', 'UERG', { ...box, appearance: { fontSize: 9, displayText: 'X\nY', signatureImage: 'IMG', logoImage: 'LOGO' } }, 'S');
    const info = JSON.parse(fetchMock.mock.calls[0][1].body).pdfDocs[0].signatureInfo;
    expect(info).toMatchObject({ renderingMode: 1, fontSize: 9, signatureImage: 'IMG', logoImage: 'LOGO' });
    expect(info.signatureDescription).toMatchObject({ displayText: 'X\nY', showSignedDate: false });
    await new MisaEsignClient(cfg, fetchMock).hashPdf(cert, 'd1', 'UERG', { ...box, appearance: { fontSize: 8, displayText: '', signatureImage: 'IMG' } }, 'S');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).pdfDocs[0].signatureInfo.renderingMode).toBe(2);
    await new MisaEsignClient(cfg, fetchMock).hashPdf(cert, 'd1', 'UERG', box, 'S');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).pdfDocs[0].signatureInfo).toMatchObject({ renderingMode: 0, fontSize: 8 });
  });

  it('đếm số trang PDF', () => {
    expect(pdfPageCount(Buffer.from('<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page >>'))).toBe(2);
  });
});

const user = { tenantId: 't1', userId: 'u1', fullName: 'Admin', email: 'a@saha.vn' } as AuthUser;
const KEY = 'x'.repeat(32);

function setupSession(status: 'PENDING' | 'SUCCESS' | 'FAILED', signerId: string | null = null) {
  const box = new SecretBox(KEY);
  const session = {
    id: 's1',
    tenantId: 't1',
    userId: 'u1',
    contractId: 'c1',
    documentId: 'doc1',
    transactionId: 'tx1',
    signerId,
    status: 'PENDING',
    error: null,
    resultDocumentId: null,
    expiresAt: new Date(Date.now() + 60_000),
    hashData: {
      hash: { documentId: 'd1', digest: 'DG' },
      cert: { certificate: 'C', certificateChain: [] },
      fileName: 'HD.pdf',
      sourceVersion: 1,
    },
  };
  const prisma = {
    esignSession: {
      findFirst: vi.fn().mockResolvedValue(session),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn((a: { data: object }) => Promise.resolve({ ...session, ...a.data })),
    },
    esignAccount: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: 'a1',
          username: 'a',
          tokenEnc: box.seal(JSON.stringify({ accessToken: 'at', refreshToken: 'rt' })),
          expiresAt: new Date(Date.now() + 1e9),
        }),
    },
  };
  const client = {
    status: vi
      .fn()
      .mockResolvedValue({
        status,
        signatures: [{ documentId: 'd1', signature: 'SIG' }],
        error: status === 'FAILED' ? 'Từ chối' : undefined,
      }),
    attach: vi.fn().mockResolvedValue(Buffer.from('%PDF-signed').toString('base64')),
  };
  const documents = { storeVersion: vi.fn().mockResolvedValue({ id: 'doc2', sha256: 'abc' }) };
  const signatures = { completeDigital: vi.fn().mockResolvedValue('COMPLETED') };
  const contracts = { get: vi.fn().mockResolvedValue({ id: 'c1', code: 'HD-01' }) };
  const config = { get: vi.fn((k: string) => (k === 'INTEGRATION_SECRET' ? KEY : undefined)) };
  const svc = new EsignService(
    prisma as never,
    { log: vi.fn() } as never,
    config as never,
    contracts as never,
    documents as never,
    signatures as never,
  );
  (svc as unknown as { client: () => Promise<unknown> }).client = () => Promise.resolve(client);
  return { svc, prisma, client, documents, signatures };
}

describe('EsignService.session', () => {
  it('đã ký ⇒ gắn chữ ký và lưu phiên bản mới cùng tên tệp', async () => {
    const { svc, documents, client } = setupSession('SUCCESS');
    const r = await svc.session(user, 's1');
    expect(client.attach).toHaveBeenCalledWith(
      expect.objectContaining({ certificate: 'C' }),
      { documentId: 'd1', digest: 'DG' },
      'SIG',
    );
    expect(documents.storeVersion).toHaveBeenCalledWith(
      user,
      { id: 'c1', code: 'HD-01' },
      expect.objectContaining({ fileName: 'HD.pdf', mimeType: 'application/pdf' }),
      'contract.document_esign',
      expect.objectContaining({ transactionId: 'tx1' }),
    );
    expect(r).toMatchObject({ status: 'SUCCESS', resultDocumentId: 'doc2' });
  });

  it('lượt khác đã giành quyền gắn ⇒ không lưu lần hai', async () => {
    const { svc, prisma, documents } = setupSession('SUCCESS');
    prisma.esignSession.updateMany.mockResolvedValue({ count: 0 });
    (prisma.esignSession as unknown as { findUniqueOrThrow: unknown }).findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ id: 's1', status: 'ATTACHING', error: null, expiresAt: new Date(), resultDocumentId: null });
    expect(await svc.session(user, 's1')).toMatchObject({ status: 'ATTACHING' });
    expect(documents.storeVersion).not.toHaveBeenCalled();
  });

  it('đang chờ ⇒ giữ PENDING; bị từ chối ⇒ FAILED', async () => {
    expect(await setupSession('PENDING').svc.session(user, 's1')).toMatchObject({ status: 'PENDING' });
    expect(await setupSession('FAILED').svc.session(user, 's1')).toMatchObject({ status: 'FAILED', error: 'Từ chối' });
  });

  it('lượt ký số trong yêu cầu ký ⇒ ghi nhận người ký sau khi lưu PDF đã ký', async () => {
    const { svc, signatures } = setupSession('SUCCESS', 'signer1');
    expect(await svc.session(user, 's1')).toMatchObject({ status: 'SUCCESS', resultDocumentId: 'doc2' });
    expect(signatures.completeDigital).toHaveBeenCalledWith(
      user,
      'signer1',
      expect.objectContaining({ documentId: 'doc2', sha256: 'abc', transactionId: 'tx1' }),
    );
  });

  it('tài liệu lẻ (không thuộc yêu cầu ký) ⇒ không ghi nhận lượt ký', async () => {
    const { svc, signatures } = setupSession('SUCCESS');
    await svc.session(user, 's1');
    expect(signatures.completeDigital).not.toHaveBeenCalled();
  });

  it('lỗi gắn chữ ký ⇒ đánh dấu FAILED', async () => {
    const { svc, client, prisma } = setupSession('SUCCESS');
    client.attach.mockRejectedValue(new MisaError('Hỏng'));
    await expect(svc.session(user, 's1')).rejects.toThrow('Hỏng');
    expect(prisma.esignSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED', error: 'Hỏng' } }),
    );
  });
});
