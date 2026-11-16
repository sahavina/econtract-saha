'use client';

import { foldVi, PARTNER_TYPE_LABELS, PARTNER_TYPES } from '@saha/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { StatusPill, type Tone } from '@/components/list-ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { buildXlsx, downloadBlob, readXlsxRows } from '@/lib/xlsx-io';

/** Cột trong file mẫu: tiêu đề (dấu * = bắt buộc) → trường gửi lên API; các tên gọi khác vẫn nhận ra. */
const COLUMNS: { key: string; label: string; width: number; aliases?: string[]; sample: [string, string] }[] = [
  { key: 'code', label: 'Mã đối tác *', width: 14, aliases: ['ma', 'ma kh', 'ma khach hang', 'ma ncc'], sample: ['KH001', 'NCC001'] },
  { key: 'name', label: 'Tên đối tác *', width: 40, aliases: ['ten', 'ten khach hang', 'ten cong ty', 'ten doanh nghiep'], sample: ['Công ty TNHH ABC', 'Nguyễn Văn B'] },
  { key: 'type', label: 'Phân loại', width: 24, aliases: ['loai', 'loai doi tac'], sample: ['Khách hàng', 'Nhà cung cấp'] },
  { key: 'entityType', label: 'Loại pháp nhân', width: 16, aliases: ['to chuc/ca nhan', 'phap nhan'], sample: ['Tổ chức', 'Cá nhân'] },
  { key: 'shortName', label: 'Tên viết tắt', width: 14, aliases: ['viet tat'], sample: ['ABC', ''] },
  { key: 'taxCode', label: 'Mã số thuế', width: 16, aliases: ['mst'], sample: ['0101234567', ''] },
  { key: 'idNumber', label: 'Số CCCD/Hộ chiếu', width: 18, aliases: ['cccd', 'cmnd', 'so cccd', 'ho chieu'], sample: ['', '001090012345'] },
  { key: 'address', label: 'Địa chỉ', width: 40, aliases: ['dia chi tru so'], sample: ['Số 1 Đường A, Quận B, Hà Nội', ''] },
  { key: 'email', label: 'Email', width: 26, sample: ['lienhe@abc.vn', ''] },
  { key: 'phone', label: 'Điện thoại', width: 16, aliases: ['so dien thoai', 'sdt', 'dien thoai lien he'], sample: ['0241234567', '0912345678'] },
  { key: 'representative', label: 'Người đại diện', width: 22, aliases: ['dai dien'], sample: ['Trần Văn C', ''] },
  { key: 'position', label: 'Chức vụ', width: 16, sample: ['Giám đốc', ''] },
  { key: 'ownerEmail', label: 'Email người phụ trách', width: 26, aliases: ['nguoi phu trach', 'phu trach'], sample: ['', ''] },
  { key: 'note', label: 'Ghi chú', width: 30, sample: ['', ''] },
];

const normHeader = (s: string) => foldVi(s.replace(/[*:()]/g, ' '));
const HEADER_KEY = new Map<string, string>(COLUMNS.flatMap((c) => [[normHeader(c.label), c.key] as const, ...(c.aliases ?? []).map((a) => [a, c.key] as const)]));

interface ImportResult {
  summary: { total: number; create: number; update: number; skip: number; error: number };
  rows: { row: number; code: string; name: string; action: 'create' | 'update' | 'skip' | 'error'; errors: string[] }[];
  imported: boolean;
}

const ACTION: Record<ImportResult['rows'][number]['action'], { label: string; tone: Tone }> = {
  create: { label: 'Tạo mới', tone: 'green' },
  update: { label: 'Cập nhật', tone: 'sky' },
  skip: { label: 'Bỏ qua (mã đã có)', tone: 'gray' },
  error: { label: 'Lỗi', tone: 'red' },
};

/** File mẫu: trang dữ liệu (2 dòng ví dụ) + trang hướng dẫn. */
function downloadTemplate() {
  const blob = buildXlsx([
    {
      name: 'Doi tac',
      rows: [COLUMNS.map((c) => c.label), COLUMNS.map((c) => c.sample[0]), COLUMNS.map((c) => c.sample[1])],
      widths: COLUMNS.map((c) => c.width),
    },
    {
      name: 'Huong dan',
      widths: [26, 90],
      rows: [
        ['Cột', 'Cách nhập'],
        ['Mã đối tác *', 'Bắt buộc, không trùng trong file. Trùng mã đối tác đã có ⇒ bỏ qua, hoặc cập nhật nếu chọn "Cập nhật đối tác đã có".'],
        ['Tên đối tác *', 'Bắt buộc.'],
        ['Phân loại', `Một trong: ${PARTNER_TYPES.map((t) => PARTNER_TYPE_LABELS[t]).join(', ')}. Bỏ trống ⇒ Khách hàng.`],
        ['Loại pháp nhân', 'Tổ chức hoặc Cá nhân. Bỏ trống ⇒ Tổ chức.'],
        ['Tên viết tắt', 'Chữ không dấu, số, "-" hoặc "_" (dùng trong mã hợp đồng), ví dụ ABC.'],
        ['Email người phụ trách', 'Email đăng nhập của nhân viên phụ trách đối tác trong hệ thống (bỏ trống nếu chưa có).'],
        ['Lưu ý', 'Giữ nguyên dòng tiêu đề; xóa 2 dòng ví dụ trước khi nhập. Mỗi lần nhập tối đa 2.000 dòng.'],
      ],
    },
  ]);
  downloadBlob(blob, 'mau-nhap-doi-tac.xlsx');
}

/** Đọc file Excel ⇒ các dòng đã map theo tiêu đề cột (kèm số dòng trong Excel). */
async function parseFile(file: File) {
  const rows = await readXlsxRows(file);
  const headerAt = rows.findIndex((r) => r.some((c) => c.trim()));
  if (headerAt < 0) throw new Error('File không có dữ liệu');
  const keys = rows[headerAt].map((h) => HEADER_KEY.get(normHeader(h)));
  if (!keys.includes('code') || !keys.includes('name')) {
    throw new Error('Không thấy cột "Mã đối tác" và "Tên đối tác" ở dòng tiêu đề – hãy dùng file mẫu');
  }
  const out: Record<string, string | number>[] = [];
  rows.slice(headerAt + 1).forEach((r, i) => {
    if (!r.some((c) => c.trim())) return;
    const rec: Record<string, string | number> = { rowNumber: headerAt + i + 2 };
    keys.forEach((k, c) => {
      if (k && r[c]?.trim()) rec[k] = r[c].trim();
    });
    out.push(rec);
  });
  if (!out.length) throw new Error('File chỉ có dòng tiêu đề, chưa có đối tác nào');
  return out;
}

export function PartnerImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string | number>[] | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  const run = useMutation({
    meta: { silent: true },
    mutationFn: (v: { rows: Record<string, string | number>[]; updateExisting: boolean; dryRun: boolean }) =>
      api<ImportResult>('/partners/import', { method: 'POST', body: v }),
    onSuccess: (r, v) => {
      setResult(r);
      setError('');
      if (!v.dryRun) {
        toast.success(`Đã nhập ${r.summary.create} đối tác mới${r.summary.update ? `, cập nhật ${r.summary.update}` : ''}`);
        qc.invalidateQueries({ queryKey: ['partners'] });
        close();
      }
    },
    onError: (e) => setError(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message).join('; ') : e instanceof Error ? e.message : 'Nhập thất bại'),
  });

  const reset = () => {
    setFileName('');
    setRows(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };
  const close = () => {
    reset();
    setUpdateExisting(false);
    onClose();
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    if (!/\.xlsx$/i.test(file.name)) {
      setError('Chỉ nhận file Excel .xlsx (file .xls cũ: mở bằng Excel rồi Lưu thành .xlsx)');
      return;
    }
    setReading(true);
    try {
      const parsed = await parseFile(file);
      setRows(parsed);
      run.mutate({ rows: parsed, updateExisting, dryRun: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được file');
    } finally {
      setReading(false);
    }
  };

  const toggleUpdate = (v: boolean) => {
    setUpdateExisting(v);
    if (rows) run.mutate({ rows, updateExisting: v, dryRun: true });
  };

  const s = result?.summary;
  const writable = s ? s.create + s.update : 0;
  const shown = result ? [...result.rows].sort((a, b) => Number(b.action === 'error') - Number(a.action === 'error') || a.row - b.row).slice(0, 200) : [];
  const busy = reading || run.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nhập đối tác từ Excel</DialogTitle>
          <DialogDescription>Tải file mẫu, điền danh sách đối tác rồi chọn file để kiểm tra. Hệ thống chỉ nhập khi tất cả các dòng hợp lệ.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download /> Tải file mẫu
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              {reading ? <Loader2 className="animate-spin" /> : <Upload />} Chọn file Excel
            </Button>
            <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {fileName && (
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" aria-hidden />
                <span className="truncate">{fileName}</span>
                {rows && <span className="shrink-0">· {rows.length} dòng</span>}
              </span>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={updateExisting} disabled={busy} onCheckedChange={(v) => toggleUpdate(!!v)} />
            Cập nhật đối tác đã có (trùng mã) theo dữ liệu trong file – ô để trống giữ nguyên thông tin cũ
          </label>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {run.isPending && !result && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang kiểm tra dữ liệu…
            </p>
          )}

          {s && (
            <>
              <div className="flex flex-wrap gap-2" aria-live="polite">
                <StatusPill tone="green">Tạo mới {s.create}</StatusPill>
                {updateExisting ? <StatusPill tone="sky">Cập nhật {s.update}</StatusPill> : <StatusPill tone="gray">Bỏ qua {s.skip}</StatusPill>}
                {s.error > 0 ? <StatusPill tone="red">Lỗi {s.error}</StatusPill> : <StatusPill tone="green">Không có lỗi</StatusPill>}
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Dòng</th>
                      <th className="px-3 py-2 font-medium">Mã</th>
                      <th className="px-3 py-2 font-medium">Tên đối tác</th>
                      <th className="px-3 py-2 font-medium">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shown.map((r) => (
                      <tr key={r.row} className="align-top">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.row}</td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{r.code || '—'}</td>
                        <td className="px-3 py-2">{r.name || '—'}</td>
                        <td className="px-3 py-2">
                          <StatusPill tone={ACTION[r.action].tone}>{ACTION[r.action].label}</StatusPill>
                          {r.errors.length > 0 && (
                            <ul className="mt-1 list-disc pl-4 text-xs text-destructive">
                              {r.errors.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.rows.length > shown.length && <p className="text-xs text-muted-foreground">Đang hiện {shown.length}/{result.rows.length} dòng (dòng lỗi lên trước).</p>}
              {s.error > 0 && <p className="text-sm text-muted-foreground">Sửa các dòng lỗi trong file rồi chọn lại file để kiểm tra.</p>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button disabled={!rows || !s || s.error > 0 || writable === 0 || busy} onClick={() => rows && run.mutate({ rows, updateExisting, dryRun: false })}>
            {run.isPending && result ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {writable ? `Nhập ${writable} đối tác` : 'Nhập'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
