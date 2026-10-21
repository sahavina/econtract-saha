import { buildTemplateValues, extractVariables, normalizeVariableMarkup, renderTemplate } from '@saha/shared';

describe('renderTemplate', () => {
  const values = buildTemplateValues({
    code: 'HD-2026-00001',
    title: 'Mua bán <keo>',
    value: '125000000.50',
    currency: 'VND',
    effectiveDate: '2026-10-20T00:00:00.000Z',
    parties: [{ role: 'PARTY_A', name: 'Công ty SAHA', taxCode: '0101', bankAccount: '921019999 – MB Bank' }],
  });

  it('substitutes and escapes values', () => {
    const r = renderTemplate(
      '<p>{{contract.code}} – {{ contract.title }} – {{contract.value}} – {{contract.start_date}}</p>',
      values,
    );
    expect(r.html).toBe('<p>HD-2026-00001 – Mua bán &lt;keo&gt; – 125.000.000,5 – 20/10/2026</p>');
    expect(r.missing).toEqual([]);
  });

  it('marks missing and unknown variables', () => {
    const r = renderTemplate('{{party_b.name}} {{foo.bar}} {{party_a.name}}', values);
    expect(r.missing).toEqual(['party_b.name']);
    expect(r.unknown).toEqual(['foo.bar']);
    expect(r.html).toContain('Công ty SAHA');
    expect(r.html).toContain('<mark data-missing="empty">{{party_b.name}}</mark>');
  });

  it('fills party bank account', () => {
    const r = renderTemplate('{{party_a.bank_account}} / {{party_b.bank_account}}', values);
    expect(r.html).toContain('921019999 – MB Bank');
    expect(r.missing).toEqual(['party_b.bank_account']);
    expect(r.unknown).toEqual([]);
  });
});

describe('sanitizeContractHtml', () => {
  it('strips scripts, handlers and arbitrary styles but keeps formatting', async () => {
    const { sanitizeContractHtml } = await import('./sanitize-content.js');
    const out = sanitizeContractHtml(
      '<h2 style="text-align:center;color:red" onclick="x()">Điều 1</h2><script>alert(1)</script>' +
        '<p><strong>A</strong> <a href="javascript:alert(1)">x</a> {{contract.code}}</p><img src=x onerror=alert(1)>',
    );
    expect(out).toBe(
      '<h2 style="text-align:center">Điều 1</h2><p><strong>A</strong> <a rel="noopener noreferrer" target="_blank">x</a> {{contract.code}}</p>',
    );
  });

  it('keeps only the borderless class on tables', async () => {
    const { sanitizeContractHtml } = await import('./sanitize-content.js');
    expect(sanitizeContractHtml('<table class="borderless evil"><tbody><tr><td class="x">A</td></tr></tbody></table>')).toBe(
      '<table class="borderless"><tbody><tr><td>A</td></tr></tbody></table>',
    );
  });
});

describe('extractVariables', () => {
  it('returns unique variables in order of appearance', async () => {
    const { extractVariables } = await import('@saha/shared');
    expect(extractVariables('{{party_b.name}} {{ contract.code }} {{party_b.name}} {{foo.bar}}')).toEqual([
      'party_b.name',
      'contract.code',
      'foo.bar',
    ]);
  });
});

describe('normalizeVariableMarkup – biến bị trình soạn thảo chen thẻ', () => {
  it('gỡ liên kết tự gắn trong biến (b.bank, a.name) và vẫn thay được giá trị', () => {
    const broken = '<p>TK: {{party_<a target="_blank" rel="noopener noreferrer nofollow" href="http://b.bank">b.bank</a>_account}} – {{party_<a href="http://a.name">a.name</a>}}</p>';
    expect(normalizeVariableMarkup(broken)).toBe('<p>TK: {{party_b.bank_account}} – {{party_a.name}}</p>');
    const values = buildTemplateValues({ code: 'X', title: 't', value: '0', currency: 'VND', parties: [{ role: 'PARTY_A', name: 'KNC' }, { role: 'PARTY_B', name: 'SAHA', bankAccount: '921019999 MB' }] });
    expect(renderTemplate(broken, values).html).toBe('<p>TK: 921019999 MB – KNC</p>');
    expect(extractVariables(broken)).toEqual(['party_b.bank_account', 'party_a.name']);
  });

  it('không đụng tới liên kết thật hoặc dấu ngoặc không phải biến', () => {
    const html = '<p>Xem <a href="https://saha.vn">saha.vn</a> và {{ <strong>ghi chú</strong> }}</p>';
    expect(normalizeVariableMarkup(html)).toBe(html);
  });
});
