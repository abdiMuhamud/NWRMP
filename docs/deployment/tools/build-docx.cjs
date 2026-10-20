// Builds the Word version of the deployment runbook from docs/deployment/rocky-linux.md,
// so the two never drift apart. Re-run after editing the Markdown:
//
//   cd docs/deployment/tools
//   npm install --no-save docx@9.12.0
//   node build-docx.cjs
//
// Supports the Markdown used in the runbook: ## / ### headings, paragraphs, **bold**, *italic*,
// `code`, [links](url), fenced code blocks, tables, -, 1. and - [ ] lists, > notes.
const fs = require('fs');
const path = require('path');
const {
  AlignmentType, BorderStyle, Bookmark, Document, ExternalHyperlink, Footer, Header, HeadingLevel,
  ImageRun, InternalHyperlink, LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table,
  TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType, HeightRule,
} = require('docx');

const ROOT = path.resolve(__dirname, '../../..');
const SOURCE = path.join(ROOT, 'docs/deployment/rocky-linux.md');
const OUTPUT = path.join(ROOT, 'docs/deployment/NWRMP-Deployment-Rocky-Linux.docx');
const LOGO = path.join(ROOT, 'apps/web/public/brand/ministry-logo.png');
const EMBLEM = path.join(ROOT, 'apps/web/public/brand/emblem.png');

const DOC = {
  title: 'Deployment and End-to-End Test Guide',
  subtitle: 'Rocky Linux server · Docker · access by IP address',
  version: '1.2',
  date: '20 October 2026',
};

// Ministry palette (apps/web/src/index.css)
const GREEN = '0B8034';
const GREEN_DARK = '0A4520';
const GREEN_TINT = 'EEF8F1';
const INK = '1F2933';
const MUTED = '5B6670';
const RULE = 'C9D3CD';

// A4 with 0.75" side margins
const PAGE = { width: 11906, height: 16838 };
const MARGIN = { top: 1300, bottom: 1200, left: 1080, right: 1080, header: 560, footer: 560 };
const TEXT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

const BODY_SIZE = 21; // half-points
const TABLE_SIZE = 18;
const CODE_SIZE = 17;

// ---------------------------------------------------------------- Markdown → blocks

function parseMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
      blocks.push({ type: 'code', lang: fence[1], lines: body });
      continue;
    }
    if (line.startsWith('# ')) { blocks.push({ type: 'title', text: line.slice(2) }); continue; }
    if (line.startsWith('## ')) { blocks.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('### ')) { blocks.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (/^---+\s*$/.test(line)) continue;
    if (line.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) {
        if (/^\|\s*:?-{3,}/.test(lines[i])) continue;
        rows.push(splitRow(lines[i]));
      }
      i--;
      blocks.push({ type: 'table', rows });
      continue;
    }
    if (line.startsWith('>')) {
      const parts = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) parts.push(lines[i].replace(/^>\s?/, ''));
      i--;
      blocks.push({ type: 'note', text: parts.join(' ') });
      continue;
    }
    const item = line.match(/^(\s*)(-|\d+\.)\s+(.*)$/);
    if (item) {
      const level = item[1].length >= 2 ? 1 : 0;
      const check = item[3].match(/^\[[ x]\]\s+(.*)$/);
      if (check) blocks.push({ type: 'item', kind: 'check', level, text: check[1] });
      else if (item[2] === '-') blocks.push({ type: 'item', kind: 'bullet', level, text: item[3] });
      else blocks.push({ type: 'item', kind: 'number', level, n: parseInt(item[2], 10), text: item[3] });
      continue;
    }
    blocks.push({ type: 'para', text: line.trim() });
  }
  return blocks;
}

function splitRow(line) {
  const cells = [];
  let cur = '';
  let inCode = false;
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (const ch of body) {
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { cells.push(cur.trim()); cur = ''; } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const plain = (s) => s.replace(/\*\*|`|\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const anchorFor = (text) => {
  const num = text.match(/^(\d+(?:\.\d+)*)\.?\s/);
  return num ? `sec_${num[1].replace(/\./g, '_')}` : `sec_${plain(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}`;
};

// ---------------------------------------------------------------- inline text

function inline(text, base = {}) {
  const out = [];
  const re = /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(run(text.slice(last, m.index), base));
    if (m[1] !== undefined) out.push(run(m[1], { ...base, code: true }));
    else if (m[2] !== undefined) out.push(...inline(m[2], { ...base, bold: true }));
    else if (m[3] !== undefined) out.push(...inline(m[3], { ...base, italics: true }));
    else out.push(new ExternalHyperlink({ link: m[5], children: inline(m[4], { ...base, link: true }) }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(run(text.slice(last), base));
  return out;
}

function run(text, s) {
  const size = s.size || BODY_SIZE;
  return new TextRun({
    text,
    bold: s.bold,
    italics: s.italics,
    size: s.code ? size - 2 : size,
    font: s.code ? 'Consolas' : undefined,
    color: s.color || (s.link ? '1A5A8C' : s.code ? GREEN_DARK : undefined),
    underline: s.link ? {} : undefined,
    shading: s.code && !s.color ? { type: ShadingType.CLEAR, fill: 'EEF2EF', color: 'auto' } : undefined,
  });
}

// ---------------------------------------------------------------- blocks → docx

function heading(block) {
  const text = block.text;
  const isH2 = block.type === 'h2';
  return new Paragraph({
    heading: isH2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    pageBreakBefore: /^9\.\s|^9\.7\s/.test(text),
    keepNext: true,
    children: [new Bookmark({ id: anchorFor(text), children: [new TextRun(plain(text))] })],
  });
}

// A one-cell table: renders as one shaded box in Word, LibreOffice, Google Docs and previewers.
// Commands get a green bar, expected output and file contents a grey one.
function codeBlock(block, indent) {
  const command = ['bash', 'powershell', 'sh'].includes(block.lang);
  const fill = command ? 'F3F6F4' : 'FAFBFA';
  const box = { style: BorderStyle.SINGLE, size: 4, color: 'D3DCD6' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const width = TEXT_WIDTH - indent;
  const lines = block.lines.length ? block.lines : [''];
  return [
    new Table({
      width: { size: width, type: WidthType.DXA },
      columnWidths: [width],
      indent: indent ? { size: indent, type: WidthType.DXA } : undefined,
      borders: {
        top: box, bottom: box, right: box, insideHorizontal: none, insideVertical: none,
        left: { style: BorderStyle.SINGLE, size: 18, color: command ? GREEN : '8A9A90' },
      },
      margins: { top: 70, bottom: 70, left: 160, right: 120 },
      rows: [new TableRow({
        cantSplit: lines.length <= 30,
        children: [new TableCell({
          width: { size: width, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
          children: lines.map((ln) => new Paragraph({ spacing: { after: 0, line: 240 }, children: codeRuns(ln, command) })),
        })],
      })],
    }),
    new Paragraph({ spacing: { after: 100 }, children: [] }),
  ];
}

function codeRuns(line, command) {
  const mk = (text, color) => new TextRun({ text, font: 'Consolas', size: CODE_SIZE, color });
  if (!line) return [mk(' ', INK)];
  if (!command) return [mk(line, INK)];
  if (/^\s*#/.test(line)) return [mk(line, '6B7A72')];
  const c = line.search(/\s{2,}#\s/);
  if (c > 0) return [mk(line.slice(0, c), INK), mk(line.slice(c), '6B7A72')];
  return [mk(line, INK)];
}

function columnWidths(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const weights = [];
  for (let c = 0; c < cols; c++) {
    const header = plain(rows[0][c] || '').length;
    const body = rows.slice(1).map((r) => plain(r[c] || '').length);
    const avg = body.length ? body.reduce((a, b) => a + b, 0) / body.length : header;
    const max = body.length ? Math.max(...body) : header;
    weights.push(Math.max(3, header * 0.9, 0.55 * avg + 0.45 * Math.min(max, 60)));
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let widths = weights.map((w) => Math.max(720, Math.round((TEXT_WIDTH * w) / total)));
  const scale = TEXT_WIDTH / widths.reduce((a, b) => a + b, 0);
  widths = widths.map((w) => Math.round(w * scale));
  widths[widths.length - 1] += TEXT_WIDTH - widths.reduce((a, b) => a + b, 0);
  return widths;
}

function fractions(parts) {
  const widths = parts.map((p) => Math.round(TEXT_WIDTH * p));
  widths[widths.length - 1] += TEXT_WIDTH - widths.reduce((a, b) => a + b, 0);
  return widths;
}

function table(block, opts = {}) {
  const rows = block.rows;
  // A form to fill in (every cell after the first is empty): room to write in each column
  const signOff = rows.length > 1 && rows.slice(1).every((r) => r.slice(1).every((c) => !c));
  const widths = opts.widths || (signOff && rows[0].length === 4 ? fractions([0.27, 0.2, 0.33, 0.2]) : columnWidths(rows));
  const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    rows: rows.map((cells, r) => {
      const head = r === 0 && !opts.noHeader;
      return new TableRow({
        tableHeader: head,
        cantSplit: true,
        height: !head && signOff ? { value: 560, rule: HeightRule.ATLEAST } : undefined,
        children: widths.map((w, c) => new TableCell({
          width: { size: w, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: head
            ? { type: ShadingType.CLEAR, fill: GREEN, color: 'auto' }
            : opts.labelColumn && c === 0
              ? { type: ShadingType.CLEAR, fill: GREEN_TINT, color: 'auto' }
              : r % 2 === 0 ? { type: ShadingType.CLEAR, fill: 'F7F9F8', color: 'auto' } : undefined,
          children: [new Paragraph({
            spacing: { after: 0, line: 252 },
            children: inline(cells[c] || '', {
              size: TABLE_SIZE,
              bold: head || (opts.labelColumn && c === 0),
              color: head ? 'FFFFFF' : undefined,
            }),
          })],
        })),
      });
    }),
  });
}

function note(block) {
  return new Paragraph({
    children: inline(block.text),
    shading: { type: ShadingType.CLEAR, fill: GREEN_TINT, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: GREEN, space: 8 } },
    indent: { left: 180, right: 120 },
    spacing: { before: 120, after: 200, line: 276 },
  });
}

let listInstance = 0;
function listItem(block) {
  if (block.kind === 'number' && block.n === 1) listInstance++;
  const reference = block.kind === 'check' ? 'checks' : block.kind === 'number' ? 'numbers' : 'bullets';
  return new Paragraph({
    numbering: { reference, level: block.kind === 'bullet' ? block.level : 0, instance: block.kind === 'number' ? listInstance : 0 },
    spacing: { after: 80 },
    children: inline(block.text),
  });
}

function body(blocks) {
  const out = [];
  let firstPara = true;
  let prev = null;
  for (const b of blocks) {
    switch (b.type) {
      case 'title': break;
      case 'h2': case 'h3': out.push(heading(b)); break;
      case 'para':
        out.push(new Paragraph({ children: inline(b.text), pageBreakBefore: firstPara }));
        firstPara = false;
        break;
      case 'note': out.push(note(b)); break;
      case 'item': out.push(listItem(b)); break;
      case 'code': out.push(...codeBlock(b, prev && prev.type === 'item' ? 360 : 0)); break;
      case 'table':
        out.push(table(b));
        out.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
        break;
    }
    prev = b;
  }
  return out;
}

// ---------------------------------------------------------------- cover, contents, header/footer

function cover() {
  const logo = fs.readFileSync(LOGO);
  const logoWidth = 560;
  const info = [
    ['Document', 'Installation runbook and end-to-end test plan'],
    ['System', 'National Water Resources Management Platform (NWRMP)'],
    ['Target', 'One Rocky Linux 9 server (dedicated or shared), Docker Compose, HTTP or HTTPS on the server IP address'],
    ['Audience', 'Systems engineer, Ministry ICT'],
    ['Source code', 'github.com/abdiMuhamud/NWRMP (branch main)'],
    ['Version', `${DOC.version} — ${DOC.date}`],
    ['Classification', 'Internal. Contains no passwords or keys.'],
  ];
  return [
    new Paragraph({ spacing: { before: 600, after: 480 }, alignment: AlignmentType.CENTER, children: [
      new ImageRun({ type: 'png', data: logo, transformation: { width: logoWidth, height: Math.round((logoWidth * 368) / 1267) } }),
    ] }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 12, color: GREEN, space: 18 } },
      spacing: { before: 360, after: 120 },
      children: [new TextRun({ text: 'NATIONAL WATER RESOURCES MANAGEMENT PLATFORM (NWRMP)', bold: true, size: 22, color: GREEN, characterSpacing: 20 })],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: DOC.title, bold: true, size: 56, color: INK })] }),
    new Paragraph({ spacing: { after: 720 }, children: [new TextRun({ text: DOC.subtitle, size: 28, color: MUTED })] }),
    table({ rows: info }, { noHeader: true, labelColumn: true, widths: [2200, TEXT_WIDTH - 2200] }),
    new Paragraph({ spacing: { before: 1400 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: 'Republic of Somaliland · Ministry of Water Development', size: 20, color: MUTED }),
    ] }),
  ];
}

function contents(blocks) {
  const out = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')] })];
  for (const b of blocks) {
    const h2 = b.type === 'h2';
    if (!h2 && !(b.type === 'h3' && /^\d/.test(b.text))) continue;
    out.push(new Paragraph({
      indent: { left: h2 ? 0 : 480 },
      spacing: { before: h2 ? 100 : 0, after: h2 ? 30 : 20 },
      children: [new InternalHyperlink({ anchor: anchorFor(b.text), children: [
        new TextRun({ text: plain(b.text), bold: h2, size: h2 ? 22 : 20, color: h2 ? GREEN_DARK : INK }),
      ] })],
    }));
  }
  return out;
}

function header() {
  const emblem = fs.readFileSync(EMBLEM);
  return new Header({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN, space: 4 } },
    children: [
      new ImageRun({ type: 'png', data: emblem, transformation: { width: 22, height: 22 } }),
      new TextRun({ text: '  NWRMP — Deployment and End-to-End Test Guide', size: 17, color: MUTED }),
      new TextRun({ text: '\tMinistry of Water Development', size: 17, color: GREEN, bold: true }),
    ],
  })] });
}

function footer() {
  return new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
    children: [
      new TextRun({ text: `Version ${DOC.version} · ${DOC.date}`, size: 16, color: MUTED }),
      new TextRun({ children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES_IN_SECTION], size: 16, color: MUTED }),
    ],
  })] });
}

// ---------------------------------------------------------------- document

const blocks = parseMarkdown(fs.readFileSync(SOURCE, 'utf8'));
const pageProps = { page: { size: PAGE, margin: MARGIN } };
const level = (lvl, text, left, font) => ({
  level: lvl,
  format: text.startsWith('%') ? LevelFormat.DECIMAL : LevelFormat.BULLET,
  text,
  alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left, hanging: 300 } }, run: font ? { font } : undefined },
});

const doc = new Document({
  creator: 'NWRMP project team',
  title: `NWRMP — ${DOC.title}`,
  description: 'Installation runbook and end-to-end test plan for NWRMP on Rocky Linux (IP address deployment).',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: BODY_SIZE, color: INK }, paragraph: { spacing: { after: 120, line: 276 } } },
      heading1: { run: { font: 'Calibri', size: 32, bold: true, color: GREEN }, paragraph: { spacing: { before: 360, after: 140 }, keepNext: true } },
      heading2: { run: { font: 'Calibri', size: 25, bold: true, color: GREEN_DARK }, paragraph: { spacing: { before: 260, after: 100 }, keepNext: true } },
    },
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [level(0, '•', 360), level(1, '–', 720)] },
      { reference: 'numbers', levels: [level(0, '%1.', 360)] },
      { reference: 'checks', levels: [level(0, '☐', 360, 'Segoe UI Symbol')] },
    ],
  },
  sections: [
    { properties: pageProps, children: cover() },
    {
      properties: { ...pageProps, page: { ...pageProps.page, pageNumbers: { start: 1 } } },
      headers: { default: header() },
      footers: { default: footer() },
      children: [...contents(blocks), ...body(blocks)],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUTPUT, buf);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${Math.round(buf.length / 1024)} KB)`);
});
