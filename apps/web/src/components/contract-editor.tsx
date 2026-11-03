'use client';

import { TEMPLATE_VARIABLES } from '@saha/shared';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { Table, TableKit } from '@tiptap/extension-table';
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  ClipboardCheck,
  Columns3,
  FoldHorizontal,
  FoldVertical,
  Italic,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Rows3,
  SquareDashed,
  Strikethrough,
  Table as TableIcon,
  TableCellsSplit,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { ClausePicker } from '@/components/clause-picker';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { escapeHtml } from '@saha/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { type MergeDirection, mergeTableCells } from '@/lib/table-merge';
import { cn } from '@/lib/utils';

const BLOCKS = [
  { value: 'p', label: 'Đoạn văn' },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({ value: `h${level}`, label: `Tiêu đề ${level}` })),
];

function ToolButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(active && 'bg-muted text-foreground')}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** Bảng có thể ẩn viền khi xem/in/xuất PDF (class "borderless"), ví dụ bảng thông tin các bên, khối chữ ký. */
const ContractTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderless: {
        default: false,
        parseHTML: (el) => el.classList.contains('borderless'),
        renderHTML: (attrs) => (attrs.borderless ? { class: 'borderless' } : {}),
      },
    };
  },
});

function Toolbar({ editor, enableClauses }: { editor: Editor; enableClauses?: boolean }) {
  const [clauseOpen, setClauseOpen] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: ([1, 2, 3, 4, 5, 6] as const).find((level) => e.isActive('heading', { level }))
        ? `h${([1, 2, 3, 4, 5, 6] as const).find((level) => e.isActive('heading', { level }))}`
        : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      align: (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      inTable: e.isActive('table'),
      borderless: e.isActive('table', { borderless: true }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  const merge = (direction: MergeDirection) => {
    const result = mergeTableCells(editor.state, direction);
    if (typeof result === 'string') toast.error(result);
    else editor.view.dispatch(result);
    editor.commands.focus();
  };

  const setBlock = (v: string) => {
    if (v === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1.5">
      <ToolButton label="Hoàn tác" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 />
      </ToolButton>
      <ToolButton label="Làm lại" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Select value={s.block} onValueChange={setBlock}>
        <SelectTrigger size="sm" className="w-32" aria-label="Kiểu đoạn">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BLOCKS.map((b) => (
            <SelectItem key={b.value} value={b.value}>
              {b.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolButton label="In đậm" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label="In nghiêng" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton label="Gạch chân" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline />
      </ToolButton>
      <ToolButton label="Gạch ngang" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolButton label="Danh sách" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label="Danh sách đánh số" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolButton label="Căn trái" active={s.align === 'left'} onClick={() => chain().setTextAlign('left').run()}>
        <AlignLeft />
      </ToolButton>
      <ToolButton label="Căn giữa" active={s.align === 'center'} onClick={() => chain().setTextAlign('center').run()}>
        <AlignCenter />
      </ToolButton>
      <ToolButton label="Căn phải" active={s.align === 'right'} onClick={() => chain().setTextAlign('right').run()}>
        <AlignRight />
      </ToolButton>
      <ToolButton label="Căn đều" active={s.align === 'justify'} onClick={() => chain().setTextAlign('justify').run()}>
        <AlignJustify />
      </ToolButton>
      <ToolButton label="Đường kẻ ngang" onClick={() => chain().setHorizontalRule().run()}>
        <Minus />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()}>
            <TableIcon /> Bảng
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-60">
          <DropdownMenuItem onSelect={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <TableIcon /> Chèn bảng 3×3
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().addRowAfter().run()}>
            <Rows3 /> Thêm dòng
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().addColumnAfter().run()}>
            <Columns3 /> Thêm cột
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => merge('vertical')}>
            <FoldVertical /> Hợp nhất theo chiều dọc
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => merge('horizontal')}>
            <FoldHorizontal /> Hợp nhất theo chiều ngang
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().splitCell().run()}>
            <TableCellsSplit /> Tách ô đã hợp nhất
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().updateAttributes('table', { borderless: !s.borderless }).run()}>
            <SquareDashed /> {s.borderless ? 'Hiện viền bảng' : 'Ẩn viền bảng'}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().deleteRow().run()}>
            <Trash2 /> Xóa dòng
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().deleteColumn().run()}>
            <Trash2 /> Xóa cột
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} variant="destructive" onSelect={() => chain().deleteTable().run()}>
            <Trash2 /> Xóa bảng
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()}>
            <Braces /> Chèn biến
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-96 overflow-y-auto">
          {TEMPLATE_VARIABLES.map((g) => (
            <DropdownMenuGroup key={g.group}>
              <DropdownMenuLabel>{g.group}</DropdownMenuLabel>
              {g.items.map((v) => (
                <DropdownMenuItem key={v.key} onSelect={() => chain().insertContent(`{{${v.key}}}`).run()}>
                  <span>{v.label}</span>
                  <code className="ml-auto pl-3 text-xs text-muted-foreground">{`{{${v.key}}}`}</code>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {enableClauses && (
        <>
          <Button type="button" variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setClauseOpen(true)}>
            <ClipboardCheck /> Chèn điều khoản
          </Button>
          <ClausePicker
            open={clauseOpen}
            onOpenChange={setClauseOpen}
            onPick={(c, withTitle) => {
              const html = (withTitle ? `<h3>${escapeHtml(c.title)}</h3>` : '') + c.contentHtml;
              editor.chain().focus().insertContent(html).run();
              setClauseOpen(false);
            }}
          />
        </>
      )}
    </div>
  );
}

/** Trình soạn thảo nội dung hợp đồng (Tiptap). */
export function ContractEditor({
  value,
  onChange,
  enableClauses,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Hiện nút chèn điều khoản từ thư viện (cần quyền xem điều khoản). */
  enableClauses?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      // Không tự gắn liên kết: biến như {{party_b.bank_account}} có phần trông như tên miền ("b.bank") sẽ bị cắt mất.
      StarterKit.configure({ link: { openOnClick: false, autolink: false, linkOnPaste: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({ table: false }),
      // Kéo viền phải của cột để đổi độ rộng; độ rộng lưu trong <colgroup> và áp dụng khi xem, in, xuất PDF.
      ContractTable.configure({ resizable: true, cellMinWidth: 40, lastColumnResizable: false }),
      Placeholder.configure({ placeholder: 'Soạn nội dung hợp đồng… Dùng "Chèn biến" để thêm dữ liệu tự động.' }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'contract-content min-h-[480px] px-8 py-6 outline-none',
        'aria-label': 'Nội dung hợp đồng',
        // Kiểm tra chính tả của trình duyệt không hỗ trợ tốt tiếng Việt.
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  return (
    // overflow-clip (không phải overflow-hidden) để thanh công cụ "sticky" được theo trang khi cuộn.
    <div className="overflow-clip rounded-lg border bg-background">
      {/* Thanh công cụ dính ngay dưới thanh đầu trang (h-14) khi cuộn nội dung dài; nền đặc để chữ bên dưới không lộ qua. */}
      <div className="sticky top-14 z-10 bg-background">
        {editor ? <Toolbar editor={editor} enableClauses={enableClauses} /> : <div className="h-11 border-b bg-muted/30" />}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
