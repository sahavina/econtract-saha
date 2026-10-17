/**
 * API client: gọi backend qua rewrite `/api/v1/*` (cùng origin ⇒ cookie refresh httpOnly hoạt động).
 * Access token chỉ giữ trong bộ nhớ; khi nhận 401 sẽ tự refresh một lần rồi gọi lại.
 */

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: FieldError[] = [],
    /** Toàn bộ nội dung lỗi từ máy chủ (ví dụ danh sách cảnh báo). */
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const BASE = '/api/v1';

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

/** Refresh dùng chung (single-flight) để nhiều request 401 đồng thời chỉ refresh một lần. */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  /** Gửi multipart (upload file); không đặt Content-Type để trình duyệt tự thêm boundary. */
  formData?: FormData;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.body !== undefined && !opts.formData) headers['Content-Type'] = 'application/json';
  return fetch(`${BASE}${path}${buildQuery(opts.query)}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
}

export async function apiRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) res = await send(path, opts);
    else onSessionExpired?.();
  }
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    let errors: FieldError[] = [];
    let raw: Record<string, unknown> = {};
    try {
      const body = await res.json();
      raw = body;
      message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? message);
      errors = body.errors ?? [];
    } catch {
      /* phản hồi không phải JSON */
    }
    throw new ApiError(res.status, message, errors, raw);
  }
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiRaw(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Tải file (CSV/Excel) có kèm Authorization. */
export async function downloadFile(path: string, query?: Query) {
  const res = await apiRaw(path, { query });
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : (/filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
