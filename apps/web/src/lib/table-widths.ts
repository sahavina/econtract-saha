/** Bề ngang vùng nội dung trang A4 (px, 96 dpi) – bảng dựng từ file tải lên chia cột trong phạm vi này. */
export const A4_CONTENT_PX = 640;
/** Khoảng đệm hai bên ô (px) – cộng vào bề ngang từ dài nhất để ước lượng cột tối thiểu. */
const CELL_PADDING_PX = 14;
/** Bề ngang ước lượng một từ ở cỡ chữ bảng nhiều cột (khoảng 10pt): chữ in hoa, chữ số rộng hơn chữ thường. */
const wordPx = (word: string) => Array.from(word).reduce((s, ch) => s + (/[A-ZĐ0-9]/.test(ch.normalize('NFD')[0]) ? 9.4 : 6.8), 0);

/**
 * Độ rộng cột (px) vừa khổ A4: mỗi cột tối thiểu đủ chứa từ dài nhất của nó (chữ các ô không gộp) để không ngắt chữ
 * giữa từ; phần còn lại chia theo tỉ lệ cột của file gốc (`raw`, đơn vị bất kỳ).
 */
export function fitColumnWidths(raw: number[], texts: string[][]): number[] {
  const need = texts.map((col) => Math.round(Math.max(0, ...col.flatMap((t) => t.split(/\s+/).map(wordPx))) + CELL_PADDING_PX));
  const needTotal = need.reduce((s, w) => s + w, 0);
  const rawTotal = raw.reduce((s, w) => s + w, 0) || 1;
  const widths =
    needTotal >= A4_CONTENT_PX
      ? need.map((w) => (w / needTotal) * A4_CONTENT_PX)
      : need.map((w, k) => w + ((A4_CONTENT_PX - needTotal) * raw[k]) / rawTotal);
  return widths.map((w) => Math.max(24, Math.round(w)));
}
