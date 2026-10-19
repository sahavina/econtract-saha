/**
 * So sánh hai phiên bản nội dung hợp đồng (HTML) theo đoạn, rồi theo từ trong đoạn bị sửa.
 * Bảng được so theo từng dòng ("ô 1 | ô 2 | …") để dễ thấy dòng nào thêm/bớt/sửa.
 */

export type WordPart = { type: 'same' | 'ins' | 'del'; text: string };
export type DiffBlock =
  | { type: 'same'; text: string }
  | { type: 'ins'; text: string }
  | { type: 'del'; text: string }
  | { type: 'mod'; parts: WordPart[] };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Tách HTML thành các khối văn bản: đoạn, tiêu đề, mục danh sách, dòng bảng. */
export function htmlToBlocks(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out: string[] = [];
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      const tag = c.tagName.toLowerCase();
      if (tag === 'table') {
        for (const tr of Array.from(c.querySelectorAll('tr'))) {
          const cells = Array.from(tr.children).map((td) => norm(td.textContent ?? ''));
          if (cells.some(Boolean)) out.push(cells.join(' | '));
        }
      } else if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre'].includes(tag) && !c.querySelector('p, li, table')) {
        const t = norm(c.textContent ?? '');
        if (t) out.push(t);
      } else walk(c);
    }
  };
  walk(doc.body.firstElementChild!);
  return out;
}

/** Bảng LCS giữa hai dãy (độ dài hợp đồng vài trăm khối ⇒ đủ nhanh). */
function lcs<T>(a: T[], b: T[]): Array<{ type: 'same' | 'ins' | 'del'; value: T }> {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<{ type: 'same' | 'ins' | 'del'; value: T }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: 'del', value: a[i++] });
    else out.push({ type: 'ins', value: b[j++] });
  }
  while (i < n) out.push({ type: 'del', value: a[i++] });
  while (j < m) out.push({ type: 'ins', value: b[j++] });
  return out;
}

function wordDiff(a: string, b: string): WordPart[] {
  const parts: WordPart[] = [];
  for (const x of lcs(a.split(/(\s+)/), b.split(/(\s+)/))) {
    const last = parts[parts.length - 1];
    if (last && last.type === x.type) last.text += x.value;
    else parts.push({ type: x.type, text: x.value });
  }
  return parts;
}

/** Khối bị xóa ngay trước khối được thêm ⇒ coi là "sửa" và so theo từ, nếu hai khối còn giống nhau phần lớn. */
export function diffContent(beforeHtml: string, afterHtml: string): DiffBlock[] {
  const ops = lcs(htmlToBlocks(beforeHtml), htmlToBlocks(afterHtml));
  const out: DiffBlock[] = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.type !== 'del') {
      out.push({ type: op.type, text: op.value });
      continue;
    }
    // Gom một loạt xóa liền nhau và loạt thêm liền sau, ghép cặp theo thứ tự.
    const dels: string[] = [];
    while (k < ops.length && ops[k].type === 'del') dels.push(ops[k++].value);
    const ins: string[] = [];
    while (k < ops.length && ops[k].type === 'ins') ins.push(ops[k++].value);
    k--;
    // Mỗi đoạn bị xóa ghép với đoạn thêm giống nó nhất (giữ thứ tự); đoạn thêm đứng trước điểm ghép được in trước.
    let next = 0;
    for (const d of dels) {
      let best = -1;
      let bestParts: WordPart[] = [];
      let bestScore = 0.4;
      for (let x = next; x < ins.length; x++) {
        const parts = wordDiff(d, ins[x]);
        const same = parts.filter((p) => p.type === 'same' && p.text.trim()).reduce((s, p) => s + p.text.length, 0);
        const score = same / Math.max(1, Math.min(d.length, ins[x].length));
        if (score > bestScore) {
          best = x;
          bestScore = score;
          bestParts = parts;
        }
      }
      if (best < 0) {
        out.push({ type: 'del', text: d });
        continue;
      }
      for (const i of ins.slice(next, best)) out.push({ type: 'ins', text: i });
      out.push({ type: 'mod', parts: bestParts });
      next = best + 1;
    }
    for (const i of ins.slice(next)) out.push({ type: 'ins', text: i });
  }
  return out;
}
