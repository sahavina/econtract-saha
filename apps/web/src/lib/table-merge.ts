import type { EditorState, Transaction } from '@tiptap/pm/state';
import { CellSelection, mergeCells, selectedRect, TableMap } from '@tiptap/pm/tables';

export type MergeDirection = 'vertical' | 'horizontal';

/**
 * Hợp nhất ô theo một chiều:
 * - dọc: gộp các ô được chọn trong từng cột (chọn 2 cột, 3 dòng ⇒ 2 ô cao 3 dòng); ngang: gộp trong từng dòng;
 * - chỉ đứng ở một ô: gộp với ô ngay dưới (dọc) hoặc ngay bên phải (ngang).
 * Trả về transaction để dispatch (hoàn tác một lần), hoặc thông báo lỗi tiếng Việt.
 */
export function mergeTableCells(state: EditorState, direction: MergeDirection): Transaction | string {
  const vertical = direction === 'vertical';
  const rect = selectedRect(state);
  const { tableStart, left, top } = rect;
  let { right, bottom } = rect;
  const single = !(state.selection instanceof CellSelection) || rect.map.cellsInRect(rect).length === 1;
  if (single) {
    if (vertical) bottom += 1;
    else right += 1;
    if (vertical ? bottom > rect.map.height : right > rect.map.width) return vertical ? 'Không còn ô phía dưới để hợp nhất' : 'Không còn ô bên phải để hợp nhất';
  } else if (vertical ? bottom - top < 2 : right - left < 2) {
    return vertical ? 'Chọn ít nhất hai ô trong cùng một cột' : 'Chọn ít nhất hai ô trong cùng một dòng';
  }

  /** Gộp vùng ô trên trạng thái hiện tại; vùng cắt ngang ô đã gộp thì không gộp được (mergeCells trả false). */
  const mergeRect = (from: EditorState, r: { left: number; right: number; top: number; bottom: number }) => {
    const table = from.doc.nodeAt(tableStart - 1);
    if (!table) return null;
    const map = TableMap.get(table);
    const at = (row: number, col: number) => from.doc.resolve(tableStart + map.map[row * map.width + col]);
    const selected = from.apply(from.tr.setSelection(new CellSelection(at(r.top, r.left), at(r.bottom - 1, r.right - 1))));
    let merged: Transaction | null = null;
    mergeCells(selected, (tr) => (merged = tr));
    return merged as Transaction | null;
  };

  // Gộp từ cuối về đầu để vị trí các nhóm chưa xử lý không đổi.
  const groups: { left: number; right: number; top: number; bottom: number }[] = [];
  if (vertical) for (let col = right - 1; col >= left; col--) groups.push({ left: col, right: col + 1, top, bottom });
  else for (let row = bottom - 1; row >= top; row--) groups.push({ left, right, top: row, bottom: row + 1 });

  const steps: Transaction['steps'] = [];
  let current = state;
  for (const group of groups) {
    const tr = mergeRect(current, group);
    if (!tr) continue;
    steps.push(...tr.steps);
    current = current.apply(tr);
  }
  // Các nhóm đều cắt ngang ô đã gộp (vd hai dòng đã gộp ngang) ⇒ gộp cả vùng.
  if (!steps.length) {
    const tr = mergeRect(state, { left, right, top, bottom });
    if (tr) steps.push(...tr.steps);
  }
  if (!steps.length) return 'Không hợp nhất được vì vùng chọn cắt ngang ô đã hợp nhất. Hãy tách ô đó trước.';
  const out = state.tr;
  for (const step of steps) out.step(step);
  return out;
}
