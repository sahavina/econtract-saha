import sanitizeHtml from 'sanitize-html';

const ALIGN = { 'text-align': [/^(left|right|center|justify)$/] };

/**
 * Làm sạch HTML nội dung hợp đồng (từ trình soạn thảo Tiptap) trước khi lưu.
 * Chỉ giữ thẻ/thuộc tính định dạng văn bản; loại bỏ script, sự kiện, iframe, style tùy ý.
 */
export function sanitizeContractHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'blockquote',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'sub',
      'sup',
      'code',
      'span',
      'mark',
      'ul',
      'ol',
      'li',
      'a',
      'table',
      'colgroup',
      'col',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      ol: ['start', 'type'],
      th: ['colspan', 'rowspan', 'colwidth', 'style'],
      td: ['colspan', 'rowspan', 'colwidth', 'style'],
      col: ['style'],
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      h4: ['style'],
      h5: ['style'],
      h6: ['style'],
    },
    // Bảng có thể ẩn viền (class "borderless") – chỉ cho đúng class này.
    allowedClasses: { table: ['borderless'] },
    allowedStyles: {
      p: ALIGN,
      h1: ALIGN,
      h2: ALIGN,
      h3: ALIGN,
      h4: ALIGN,
      h5: ALIGN,
      h6: ALIGN,
      td: ALIGN,
      th: ALIGN,
      col: { width: [/^\d+px$/], 'min-width': [/^\d+px$/] },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}
