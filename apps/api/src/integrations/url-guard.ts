import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Địa chỉ nội bộ/loopback/link-local – không cho tích hợp gọi tới (chống SSRF vào mạng của máy chủ). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/**
 * Kiểm tra URL hệ thống ngoài do quản trị viên doanh nghiệp nhập: chỉ HTTPS và không trỏ vào địa chỉ nội bộ,
 * trừ khi bật INTEGRATION_ALLOW_PRIVATE_HOSTS (môi trường phát triển).
 */
export async function assertSafeIntegrationUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL không hợp lệ');
  }
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    throw new Error('Chỉ hỗ trợ kết nối HTTPS');
  }
  if (url.username || url.password) throw new Error('URL không được chứa tài khoản/mật khẩu');
  await assertPublicHost(url.hostname, allowPrivate);
  return url;
}

/** Tên máy/IP phải phân giải ra địa chỉ công cộng (dùng cho cả máy chủ SMTP do doanh nghiệp nhập). */
export async function assertPublicHost(hostname: string, allowPrivate: boolean): Promise<void> {
  if (allowPrivate) return;
  const host = hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`Không phân giải được tên miền ${hostname}`);
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error('Không cho phép kết nối tới địa chỉ mạng nội bộ');
  }
}
