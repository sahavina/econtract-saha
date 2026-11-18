/**
 * Client Open API MISA eSign RemoteSigning (developer.misa.vn/products-openapi/ESIGN).
 * Luồng: đăng nhập tài khoản người ký (→ OTP nếu cần) → lấy chứng thư → băm PDF → gửi yêu cầu ký
 * (người ký xác nhận trên ứng dụng MISA eSign trong 120 giây) → kiểm tra trạng thái → gắn chữ ký vào PDF.
 */
import { Logger } from '@nestjs/common';

const logger = new Logger('MisaEsign');

export interface MisaConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface MisaTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MisaUser {
  id: string;
  displayName: string;
}

export interface MisaCertificate {
  keyAlias: string;
  keyStatus: string;
  certificate: string;
  certificateChain: string[];
  appName?: string;
}

export interface MisaSignatureBox {
  page: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  signedBy: string;
  reason: string;
  location: string;
  contact: string;
}

/** Dữ liệu trả về từ bước băm, cần giữ lại để gắn chữ ký. */
export interface MisaHashResult {
  documentId: string;
  digest: string;
  documentBytes?: string;
  signatureName?: string;
  sh?: string;
  documentHash?: string;
}

export type MisaLoginResult = { kind: 'ok'; tokens: MisaTokens; user: MisaUser } | { kind: 'otp' };

export class MisaError extends Error {
  constructor(
    message: string,
    readonly code?: string | number,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

/** Đổi mã lỗi MISA sang thông báo dễ hiểu. */
const ERROR_TEXT: Record<string, string> = {
  'Auth:001': 'ClientID/ClientSecret MISA eSign không hợp lệ',
  'Auth:002': 'Phiên đăng nhập MISA eSign không hợp lệ hoặc đã hết hạn',
  'Auth:003': 'Phiên đăng nhập MISA eSign đã hết hạn – hãy đăng nhập lại',
  'Auth:004': 'Thiếu thông tin xác thực MISA eSign',
  'Business:001': 'Gói MISA eSign đã hết hạn – liên hệ MISA để gia hạn',
  'Business:002': 'Đã hết số lượt ký của gói MISA eSign – liên hệ MISA để mua thêm',
  // Không có trong bảng mã lỗi công bố – MISA xác nhận (phiếu hỗ trợ 10/2026): login-api trả e401
  // "Không tìm thấy client." (HTTP 422) khi ClientSecret không khớp ClientID.
  e401: 'ClientSecret MISA eSign không đúng (MISA báo "Không tìm thấy client") – sao chép lại Client Secret của ứng dụng trên developer.misa.vn rồi lưu cấu hình',
  // Hai mã dưới không có trong bảng mã lỗi công bố – ghi nhận thực tế ở bước two-factor-auth (2026-10).
  e111: 'Mã OTP không đúng – kiểm tra lại mã và loại OTP (SMS/email hay ứng dụng MISA eSign)',
  e2003:
    'Tài khoản MISA eSign chưa được cấp quyền ký số từ xa cho ứng dụng tích hợp này (MISA báo: không có quyền truy cập tài nguyên). ' +
    'Liên hệ MISA để kích hoạt tài nguyên RemoteSigning cho tài khoản và duyệt yêu cầu tích hợp eSign của ClientID.',
};

type Json = Record<string, unknown>;

/** Lấy trường không phân biệt hoa/thường (tài liệu MISA dùng cả pdfDocs/PdfDocs, certificateChain/certiticateChain). */
function pick<T>(o: unknown, ...names: string[]): T | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const entries = Object.entries(o as Json);
  for (const n of names) {
    const hit = entries.find(([k]) => k.toLowerCase() === n.toLowerCase());
    if (hit && hit[1] !== undefined && hit[1] !== null) return hit[1] as T;
  }
  return undefined;
}

export class MisaEsignClient {
  constructor(
    private readonly cfg: MisaConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 30_000,
  ) {}

  private async call<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T> {
    const url = `${this.cfg.baseUrl.replace(/\/+$/, '')}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ClientID: this.cfg.clientId,
          ClientSecret: this.cfg.clientSecret,
          ...(token && { AuthorizationRM: `Bearer ${token}` }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
    } catch (e) {
      const name = (e as { name?: string }).name;
      throw new MisaError(
        name === 'TimeoutError' ? 'MISA eSign không phản hồi (quá thời gian chờ)' : 'Không kết nối được tới MISA eSign',
      );
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* phản hồi không phải JSON */
    }
    const status = pick<Json>(json, 'status');
    const code = pick<string | number>(status, 'errorCode') ?? pick<string | number>(json, 'errorCode');
    const failed = !res.ok || pick<boolean>(status, 'error') === true || pick<string>(status, 'type') === 'fail';
    if (failed) {
      const known = code !== undefined ? ERROR_TEXT[String(code)] : undefined;
      const msg =
        known ??
        pick<string>(json, 'userMsg', 'errorDescription') ??
        pick<string>(status, 'userMsg', 'message') ??
        pick<string>(json, 'devMsg', 'message') ??
        `MISA eSign báo lỗi HTTP ${res.status}`;
      // Chẩn đoán: chỉ ghi đường dẫn, mã lỗi, thông điệp gốc của MISA – không ghi body (mật khẩu, OTP) hay token.
      logger.warn(
        `${method} ${path} → HTTP ${res.status}, errorCode=${code ?? '—'}: ${JSON.stringify({
          status,
          userMsg: pick(json, 'userMsg'),
          devMsg: pick(json, 'devMsg'),
          errorDescription: pick(json, 'errorDescription'),
        }).slice(0, 600)}`,
      );
      throw new MisaError(msg, code, res.status);
    }
    // Một số API bọc kết quả trong { status, data }, số khác trả thẳng.
    return (pick<T>(json, 'data') ?? (json as T)) as T;
  }

  private static tokens(d: unknown): MisaTokens {
    const accessToken = pick<string>(d, 'remoteSigningAccessToken');
    const refreshToken = pick<string>(d, 'refreshToken');
    if (!accessToken || !refreshToken) throw new MisaError('MISA eSign không trả về token đăng nhập');
    return { accessToken, refreshToken, expiresIn: pick<number>(d, 'expiresIn') ?? 2_592_000 };
  }

  private static user(d: unknown): MisaUser {
    const u = pick<Json>(d, 'user') ?? {};
    const name = [pick<string>(u, 'lastName'), pick<string>(u, 'firstName')].filter(Boolean).join(' ');
    return { id: String(pick(u, 'id') ?? ''), displayName: name || pick<string>(u, 'email', 'username') || '' };
  }

  /** Đăng nhập bằng tài khoản MISA eSign của người ký; mã lỗi 122 ⇒ cần OTP (two-factor). */
  async login(userName: string, password: string): Promise<MisaLoginResult> {
    try {
      const d = await this.call('POST', '/esign/v1/auth/login-api', { userName, password });
      return { kind: 'ok', tokens: MisaEsignClient.tokens(d), user: MisaEsignClient.user(d) };
    } catch (e) {
      if (e instanceof MisaError && String(e.code) === '122') return { kind: 'otp' };
      throw e;
    }
  }

  async twoFactor(userName: string, code: string, otpType: 0 | 1) {
    const d = await this.call('POST', '/esign/v1/auth/two-factor-auth', { userName, code, otpType, remember: true });
    return { tokens: MisaEsignClient.tokens(d), user: MisaEsignClient.user(d) };
  }

  async resendOtp(userName: string) {
    await this.call('POST', '/esign/v1/auth/resend-otp-auth', { userName, language: 'vi-VN' });
  }

  /**
   * Kiểm tra ClientID/ClientSecret: đăng nhập login-api bằng một tài khoản giả (tên miền .invalid, không thể tồn tại).
   * Cổng refreshtoken không kiểm ClientSecret (sai Secret vẫn qua) nên không dùng được. Với login-api, MISA kiểm ứng dụng
   * trước: sai ClientID/Secret ⇒ e401 "Không tìm thấy client." / Auth:001/004 / HTTP 401, 403; ứng dụng đúng thì đi tiếp
   * tới bước kiểm tài khoản và báo sai tên đăng nhập/mật khẩu ⇒ hợp lệ. Lỗi mạng (không có mã, không có HTTP) ⇒ không đạt.
   */
  async checkCredentials(): Promise<{ ok: boolean; message: string }> {
    const valid = { ok: true, message: 'ClientID/ClientSecret hợp lệ – MISA eSign đã chấp nhận ứng dụng' };
    try {
      await this.call('POST', '/esign/v1/auth/login-api', { userName: 'econtract-connection-test@example.invalid', password: 'econtract-connection-test' });
      return valid;
    } catch (e) {
      if (!(e instanceof MisaError)) throw e;
      const code = String(e.code ?? '');
      const badClient = ['e401', 'Auth:001', 'Auth:004'].includes(code) || e.httpStatus === 401 || e.httpStatus === 403;
      if (badClient || e.httpStatus === undefined) return { ok: false, message: e.message };
      return valid;
    }
  }

  async refresh(refreshToken: string): Promise<MisaTokens> {
    return MisaEsignClient.tokens(await this.call('POST', '/esign/v1/auth/refreshtoken', { refreshToken }));
  }

  async certificates(token: string): Promise<MisaCertificate[]> {
    const d = await this.call<unknown>('GET', '/esign/v1/certificates/by-userId', undefined, token);
    const list = Array.isArray(d) ? d : (pick<unknown[]>(d, 'items', 'certificates') ?? []);
    return list.map((c) => ({
      keyAlias: String(pick(c, 'keyAlias') ?? ''),
      keyStatus: String(pick(c, 'keyStatus') ?? ''),
      certificate: String(pick(c, 'certificate') ?? ''),
      certificateChain: pick<string[]>(c, 'certificateChain', 'certiticateChain') ?? [],
      appName: pick<string>(c, 'appName'),
    }));
  }

  /** Bước 1: băm PDF (MISA dựng sẵn khung chữ ký hiển thị theo signatureInfo). */
  async hashPdf(
    cert: MisaCertificate,
    documentId: string,
    pdfBase64: string,
    box: MisaSignatureBox,
    signatureName: string,
  ): Promise<MisaHashResult> {
    const d = await this.call('POST', '/esign/v1/documents/hash', {
      certificate: cert.certificate,
      certificateChain: cert.certificateChain,
      pdfDocs: [
        {
          documentId,
          FileToSign: pdfBase64,
          signatureInfo: {
            textColor: 0,
            renderingMode: 0,
            positionX: box.positionX,
            positionY: box.positionY,
            width: box.width,
            height: box.height,
            fontSize: 8,
            page: box.page,
            signatureName,
            hashAlgorithm: 'SHA256',
            signatureDescription: {
              signedBy: box.signedBy,
              showSignedDate: true,
              location: box.location,
              reason: box.reason,
              contact: box.contact,
            },
          },
        },
      ],
    });
    const doc = (pick<Json[]>(d, 'pdfDocs') ?? [])[0];
    const digest = pick<string>(doc, 'digest');
    if (!doc || !digest) throw new MisaError('MISA eSign không trả về dữ liệu băm của tài liệu');
    return {
      documentId: String(pick(doc, 'documentId') ?? documentId),
      digest,
      documentBytes: pick<string>(doc, 'documentBytes'),
      signatureName: pick<string>(doc, 'signatureName') ?? signatureName,
      sh: pick<string>(doc, 'sh'),
      documentHash: pick<string>(doc, 'documentHash'),
    };
  }

  /** Bước 2: gửi yêu cầu ký – người ký xác nhận trên ứng dụng MISA eSign (120 giây). */
  async signHash(
    token: string,
    input: {
      userId: string;
      certAlias: string;
      documentId: string;
      digest: string;
      documentName: string;
      display: string;
    },
  ) {
    const d = await this.call(
      'POST',
      '/esign/v1/signing/hash',
      {
        DataToBeDisplayed: input.display,
        UserId: input.userId,
        CertAlias: input.certAlias,
        Documents: [
          { DocumentId: input.documentId, FileToSign: input.digest, DocumentName: input.documentName.slice(0, 100) },
        ],
      },
      token,
    );
    const transactionId = pick<string>(d, 'transactionId');
    if (!transactionId) throw new MisaError('MISA eSign không trả về mã giao dịch ký');
    return transactionId;
  }

  /** Bước 3: trạng thái ký. */
  async status(token: string, transactionId: string) {
    const d = await this.call('GET', `/esign/v1/signing/status/${encodeURIComponent(transactionId)}`, undefined, token);
    const raw = String(pick(d, 'status') ?? 'PENDING').toUpperCase();
    const status = raw === 'SUCCESS' || raw === 'FAILED' ? raw : 'PENDING';
    const signatures = (pick<Json[]>(d, 'signatures') ?? []).map((s) => ({
      documentId: String(pick(s, 'documentId') ?? ''),
      signature: String(pick(s, 'signature') ?? ''),
    }));
    return {
      status: status as 'PENDING' | 'SUCCESS' | 'FAILED',
      signatures,
      error: pick<string>(d, 'errorDescription', 'errorCode'),
    };
  }

  /** Bước 4: gắn chữ ký vào PDF, trả về PDF đã ký (base64). */
  async attach(cert: MisaCertificate, hash: MisaHashResult, signature: string): Promise<string> {
    const d = await this.call('POST', '/esign/v1/documents/attachment', {
      certificate: cert.certificate,
      CertificateChain: cert.certificateChain,
      pdfDocs: [
        {
          signature,
          documentId: hash.documentId,
          documentBytes: hash.documentBytes,
          documentHash: hash.documentHash,
          signatureName: hash.signatureName,
          digest: hash.digest,
          sh: hash.sh,
        },
      ],
    });
    const doc = (pick<Json[]>(d, 'pdfDocs') ?? [])[0];
    const pdf = pick<string>(doc, 'document');
    if (!pdf) throw new MisaError('MISA eSign không trả về tài liệu đã ký');
    return pdf;
  }
}

/** Đếm số trang PDF (đủ dùng để mặc định đặt chữ ký ở trang cuối). */
export function pdfPageCount(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const n = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  return Math.max(1, n);
}
