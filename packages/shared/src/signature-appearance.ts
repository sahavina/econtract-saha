/**
 * Hiển thị chữ ký số MISA eSign trên PDF (Cấu hình → Chữ ký số MISA eSign → Hiển thị chữ ký), dùng chung cho cả doanh nghiệp.
 * Lưu trong Tenant.settings.signatureAppearance; ảnh logo/con dấu lưu riêng (signatureLogo, base64).
 */

export const SIGNATURE_LAYOUTS = ['HORIZONTAL', 'VERTICAL'] as const;
export const SIGNATURE_IMAGE_SIZES = ['S', 'M', 'L'] as const;
export const SIGNATURE_LANGUAGES = ['vi', 'en'] as const;
/** Các nấc cỡ chữ (pt) của dòng chữ trong khung chữ ký. */
export const SIGNATURE_FONT_SIZES = [6, 7, 8, 9, 10] as const;

export interface SignatureAppearance {
  /** Chủ sở hữu chứng thư (tên trên chứng thư). */
  showOwner: boolean;
  /** Ảnh logo/con dấu doanh nghiệp đã tải lên. */
  showLogo: boolean;
  /** Thời gian ký. */
  showTime: boolean;
  /** Số serial, đơn vị cấp, hạn chứng thư. */
  showCertDetails: boolean;
  /** Nhãn trước mỗi dòng ("Ký số bởi:", "Thời gian:"…). */
  showLabels: boolean;
  /** Dấu tích xanh "đã ký số" làm nền khung chữ ký. */
  showCheck: boolean;
  layout: (typeof SIGNATURE_LAYOUTS)[number];
  imageSize: (typeof SIGNATURE_IMAGE_SIZES)[number];
  fontSize: number;
  language: (typeof SIGNATURE_LANGUAGES)[number];
}

/**
 * Khung chữ ký đã đóng lên PDF khi ký số (lưu vào bằng chứng của người ký): các dòng chữ đúng như gửi MISA
 * và kiểu hiển thị lúc ký ⇒ văn bản đã ký trên màn hình/PDF hiển thị giống hệt dù cấu hình đổi sau đó.
 */
export interface SignatureStamp {
  lines: string[];
  layout: SignatureAppearance['layout'];
  imageSize: SignatureAppearance['imageSize'];
  fontSize: number;
  showLogo: boolean;
  showCheck: boolean;
}

export const DEFAULT_SIGNATURE_APPEARANCE: SignatureAppearance = {
  showOwner: true,
  showLogo: false,
  showTime: true,
  showCertDetails: false,
  showLabels: true,
  showCheck: false,
  layout: 'HORIZONTAL',
  imageSize: 'M',
  fontSize: 8,
  language: 'vi',
};

/** Đọc cấu hình đã lưu (có thể thiếu/sai) – luôn trả về giá trị hợp lệ. */
export function parseSignatureAppearance(value: unknown): SignatureAppearance {
  const v = (value ?? {}) as Partial<Record<keyof SignatureAppearance, unknown>>;
  const d = DEFAULT_SIGNATURE_APPEARANCE;
  const bool = (k: 'showOwner' | 'showLogo' | 'showTime' | 'showCertDetails' | 'showLabels' | 'showCheck') => (typeof v[k] === 'boolean' ? (v[k] as boolean) : d[k]);
  const pick = <T extends string>(list: readonly T[], x: unknown, def: T) => (list.includes(x as T) ? (x as T) : def);
  return {
    showOwner: bool('showOwner'),
    showLogo: bool('showLogo'),
    showTime: bool('showTime'),
    showCertDetails: bool('showCertDetails'),
    showLabels: bool('showLabels'),
    showCheck: bool('showCheck'),
    layout: pick(SIGNATURE_LAYOUTS, v.layout, d.layout),
    imageSize: pick(SIGNATURE_IMAGE_SIZES, v.imageSize, d.imageSize),
    fontSize: (SIGNATURE_FONT_SIZES as readonly number[]).includes(Number(v.fontSize)) ? Number(v.fontSize) : d.fontSize,
    language: pick(SIGNATURE_LANGUAGES, v.language, d.language),
  };
}

/** Kích thước khung chữ ký (pt) theo bố cục và cỡ hình. */
export function signatureBoxSize(a: Pick<SignatureAppearance, 'layout' | 'imageSize'>): { width: number; height: number } {
  const sizes = {
    HORIZONTAL: { S: [150, 50], M: [180, 60], L: [220, 75] },
    VERTICAL: { S: [110, 80], M: [130, 100], L: [160, 120] },
  } as const;
  const [width, height] = sizes[a.layout][a.imageSize];
  return { width, height };
}

export interface SignatureTextInput {
  owner: string;
  signedAt: Date;
  cert?: { serial?: string | null; issuer?: string | null; validTo?: Date | null } | null;
}

const LABELS = {
  vi: { owner: 'Ký số bởi', time: 'Thời gian', serial: 'Số serial', issuer: 'Đơn vị cấp', validTo: 'Hiệu lực đến' },
  en: { owner: 'Signed by', time: 'Date', serial: 'Serial', issuer: 'Issuer', validTo: 'Valid to' },
} as const;

/** Ngày giờ theo giờ Việt Nam (UTC+7): dd/MM/yyyy, HH:mm:ss. */
function vnDateTime(d: Date, withTime = true): string {
  const t = new Date(d.getTime() + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
  return withTime ? `${date}, ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}` : date;
}

/** Các dòng chữ trong khung chữ ký theo cấu hình (MISA nhận dạng chuỗi xuống dòng bằng "\n"). */
export function signatureTextLines(a: SignatureAppearance, input: SignatureTextInput): string[] {
  const L = LABELS[a.language];
  const line = (label: string, value: string) => (a.showLabels ? `${label}: ${value}` : value);
  const out: string[] = [];
  if (a.showOwner && input.owner) out.push(line(L.owner, input.owner));
  if (a.showTime) out.push(line(L.time, vnDateTime(input.signedAt)));
  if (a.showCertDetails && input.cert) {
    if (input.cert.serial) out.push(line(L.serial, input.cert.serial));
    if (input.cert.issuer) out.push(line(L.issuer, input.cert.issuer));
    if (input.cert.validTo) out.push(line(L.validTo, vnDateTime(input.cert.validTo, false)));
  }
  return out;
}

/** Dấu tích xanh "đã ký số" (PNG 96×96, phần mềm tự vẽ) – logoImage của khung chữ ký khi bật "Logo tích xanh". */
export const SIGNATURE_CHECK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAD6UlEQVR42u2dPW8UMRCG8xOucn0N/Ur8gROle2qOHqT8AIqV6OlTXeEGqqVANBSbhjQUJ0FBFZ2UKhVLkYZq0SCfdES3H7bX9th+R7IUXXLJ5Xn9MTO2Zy8uYDAYDHbOhJKVUHIrlKyFko1QshVK7oWS/UDb659p9HvovRVImgGvNcR+4dbq3w1BHkHfCCV3QsnOA/Sh1um/uSkV+kooeSmUPASEPtQO+rOsSgFfB+7tJqOizlII5uDzFkJ7IimAPyfENmXwa0/eTOhG/8MavR6jYfZcv8sI/OO2Y7s2aPj7jOGfRtsrbvArJj59yNih4gS/Kwj+6bpQAX6pIgB+RBH0gnsA/P/WhBW8nRK8o8z9fOc4IUSEC9DjbesL/hqL7uxFee1DgBZw5yfwMPXkMhVprwdTj91UtFpCgBowrVuN3p/yKCix97+4ftt/vf/eH42+pteCj4ISe//72y/9kNH3go4CfVamGPhvvl31U+YwEi5tBCgm2fb65l0/x2g6sk3W2RwXBPwz5vC3Nki4PWrPPr3qf/95CCXAzkSADvAXnYL+LcYmO11Zw3/avDSG77gIH1tVvO//5MPz/sevW2P4Dm6oWUyQc9YzMvx5WdKce//nuxtj+CTYkp+h2Pl/LModg0+jZuHPUhWX92cEf3yfIMcF2DTQIiMPidzU4Clqfb0T8P3Bp9YU4QGRz25jnuGPe0K5HLiyiXLJaMSEOMAVzAX1sLmROvxxVzSBzY3JQOvu4d4Y/tXPj0FHqHcB5sy/S4vAIMrlI8DptBPin08JfhABQgc8zAKttARwhZEa/CkB9iGnIFcotHiaGi3SMeFPuaFtzCCIRKDNkoSjXOdArImZAJsLKWH4k6mIRZNxNlPEFCx63cZ8B4BLJeO2HBJiQyKkEOW6pqMrLlnJowjHnpsJ/OmNeU6p4aPRscGUAi3rLUnfKWnqzTa92MY4wp+7KV9zzFaaGG2+J3thI8TGvE8RYke5zgezQh1N9CECc/gdu8O5FPXaLK5DHtPcKJr9LfqQx9NtU8lMo9xljqeHvqDhIkIi8A/sryjZisAw0FrsilKUS3omSbxE4NtfVY11Um6OCBQdZ39ZO+ZV1RinKliWK4h5XjTGuSJWpQpQroBBsQ6Uq2FSOQsFmyIWbELJMgYlyzAVRS7ah7KVDMpWonArg8KtKF0cuXQxinefXXRRQb04+BCBAXw8wgQP8cnb27EUAY+xYiAEHuTGQAQ8yhCjobBeP7E24HG2EKJQ8ANC4JHmTMTYaPeuC9zbd8bHBQsQo9LTQOvJm6nZRbAJCLLV4BoNcT8Rpbb6Z2v9XgCHwWCw8/YXThYJCAwJcuAAAAAASUVORK5CYII=';
