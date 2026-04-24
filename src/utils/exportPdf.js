import { jsPDF } from 'jspdf';

// ── Agent accent colors ──────────────────────────────────────────────────────
const AGENT_COLORS = {
  HORMOZI:     [59,  130, 246],
  CARDONE:     [239, 68,  68 ],
  ROBBINS:     [139, 92,  246],
  GARYV:       [249, 115, 22 ],
  NAVAL:       [16,  185, 129],
  VOSS:        [71,  107, 175],
  SYNTHESIZER: [148, 163, 184],
};
const DEFAULT_COLOR = [99, 102, 241];

function getColor(agentKey) {
  return AGENT_COLORS[(agentKey || '').toUpperCase()] || DEFAULT_COLOR;
}

// Light tint: mix agent color with white (ratio = 0–1, higher = more color)
function tint(rgb, ratio = 0.1) {
  return rgb.map(c => Math.round(255 * (1 - ratio) + c * ratio));
}

// ── Unicode normalizer ───────────────────────────────────────────────────────
function norm(str = '') {
  return String(str)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2014\u2015]/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x00-\xFF]/g, '');
}

// Strip all markdown inline markers
function strip(str = '') {
  return norm(str)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}

// ── Inline bold renderer ─────────────────────────────────────────────────────
// Renders a line with **bold** segments colored in accent; returns final x.
function drawInlineLine(doc, rawLine, x, y, accentRgb, normalColor) {
  const regex = /\*\*(.+?)\*\*/g;
  let last = 0, match, cx = x;
  const [nr, ng, nb] = normalColor;
  const [ar, ag, ab] = accentRgb;

  function drawSegment(text, bold) {
    if (!text) return;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(bold ? ar : nr, bold ? ag : ng, bold ? ab : nb);
    doc.text(norm(text), cx, y);
    cx += doc.getTextWidth(norm(text));
  }

  while ((match = regex.exec(rawLine)) !== null) {
    drawSegment(rawLine.slice(last, match.index), false);
    drawSegment(match[1], true);
    last = match.index + match[0].length;
  }
  drawSegment(rawLine.slice(last), false);

  // Reset
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(nr, ng, nb);
}

// ── Content parser ───────────────────────────────────────────────────────────
function parseContent(raw) {
  const blocks = [];
  const lines  = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line    = lines[i];
    const trimmed = line.trim();

    // H1
    if (/^# (?!#)/.test(trimmed)) {
      blocks.push({ type: 'h1', text: strip(trimmed.replace(/^#\s+/, '')) });
      i++; continue;
    }
    // H2
    if (/^## (?!#)/.test(trimmed)) {
      blocks.push({ type: 'h2', text: strip(trimmed.replace(/^##\s+/, '')) });
      i++; continue;
    }
    // H3
    if (/^###/.test(trimmed)) {
      blocks.push({ type: 'h3', text: strip(trimmed.replace(/^###\s+/, '')) });
      i++; continue;
    }
    // HR
    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++; continue;
    }
    // Table — collect all consecutive pipe rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const rows = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t.startsWith('|') || !t.endsWith('|')) break;
        if (!/^\|[\s\-|:]+\|$/.test(t)) {          // skip separator row
          rows.push(t.slice(1, -1).split('|').map(c => strip(c.trim())));
        }
        i++;
      }
      if (rows.length) blocks.push({ type: 'table', rows });
      continue;
    }
    // Callout / blockquote
    if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'callout', raw: trimmed.slice(2) });
      i++; continue;
    }
    // Bullet
    if (/^[-*+]\s/.test(trimmed)) {
      blocks.push({ type: 'bullet', raw: trimmed.replace(/^[-*+]\s+/, '') });
      i++; continue;
    }
    // Numbered list
    const nm = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (nm) {
      blocks.push({ type: 'numbered', num: parseInt(nm[1]), raw: nm[2] });
      i++; continue;
    }
    // Blank
    if (trimmed === '') {
      blocks.push({ type: 'blank' });
      i++; continue;
    }
    // Paragraph
    blocks.push({ type: 'paragraph', raw: trimmed });
    i++;
  }
  return blocks;
}

// ── Table renderer ───────────────────────────────────────────────────────────
function renderTable(doc, rows, y, margin, maxW, pageH, accentRgb) {
  if (!rows.length) return y;
  const [ar, ag, ab] = accentRgb;
  const lightRow     = tint(accentRgb, 0.04);
  const colCount     = Math.max(...rows.map(r => r.length));
  const colW         = maxW / colCount;
  const rowH         = 7.5;
  const padX         = 2.5;
  const textY        = 4.8; // baseline inside row

  doc.setLineWidth(0.15);

  for (let ri = 0; ri < rows.length; ri++) {
    if (y + rowH > pageH - margin - 12) { doc.addPage(); y = margin; }

    const isHeader = ri === 0;
    const isAlt    = !isHeader && ri % 2 === 0;

    // Row background
    if (isHeader) {
      doc.setFillColor(ar, ag, ab);
    } else if (isAlt) {
      doc.setFillColor(...lightRow);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(margin, y, maxW, rowH, 'F');

    // Outer border
    doc.setDrawColor(209, 213, 219);
    doc.rect(margin, y, maxW, rowH);

    for (let ci = 0; ci < colCount; ci++) {
      const cellX = margin + ci * colW;
      const text  = (rows[ri][ci] || '').trim();

      // Column divider
      if (ci > 0) {
        doc.setDrawColor(209, 213, 219);
        doc.line(cellX, y, cellX, y + rowH);
      }

      // Cell text
      if (isHeader) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 65, 81);
      }
      const maxCell = colW - padX * 2;
      const lines   = doc.splitTextToSize(text, maxCell);
      doc.text(lines[0] || '', cellX + padX, y + textY);
    }
    y += rowH;
  }

  // Reset
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(55, 65, 81);
  return y + 4;
}

// ── Main doc builder ─────────────────────────────────────────────────────────
function buildDoc(agentKey, agentName, content, date) {
  const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setCharSpace(0);

  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxW   = pageW - margin * 2;

  const accent = getColor(agentKey);
  const [ar, ag, ab] = accent;
  const lightBg = tint(accent, 0.08);
  const medBg   = tint(accent, 0.14);

  // ── HEADER ─────────────────────────────────────────────────────────────────
  // Accent color band (top 4mm)
  doc.setFillColor(ar, ag, ab);
  doc.rect(0, 0, pageW, 4, 'F');

  // Dark header background
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 4, pageW, 36, 'F');

  // "THE HEADQUARTERS" label
  doc.setTextColor(ar, ag, ab);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('THE HEADQUARTERS', margin, 13);

  // Report title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(19);
  doc.setFont('helvetica', 'bold');
  doc.text('Strategic Report', margin, 26);

  // Date (right-aligned, vertically centered)
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    new Date(date).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    pageW - margin, 26, { align: 'right' }
  );

  // Prepared-by line
  doc.setTextColor(ar, ag, ab);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Prepared by ${norm(agentName)}`, margin, 34);

  // ── BODY ───────────────────────────────────────────────────────────────────
  const blocks = parseContent(content);
  const normalColor = [55, 65, 81];
  let y = 50;
  let firstParagraphRendered = false;

  function guard(needed) {
    if (y + needed > pageH - margin - 12) { doc.addPage(); y = margin + 4; return true; }
    return false;
  }

  for (const block of blocks) {

    switch (block.type) {

      // ── H1: full colored band ───────────────────────────────────────────────
      case 'h1': {
        guard(14);
        // Background band
        doc.setFillColor(...medBg);
        doc.rect(margin - 4, y - 6.5, maxW + 8, 13, 'F');
        // Left accent bar
        doc.setFillColor(ar, ag, ab);
        doc.rect(margin - 4, y - 6.5, 3.5, 13, 'F');
        // Text
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39);
        doc.text(block.text, margin + 2, y + 1.5);
        y += 14;
        break;
      }

      // ── H2: left bar + underline ─────────────────────────────────────────────
      case 'h2': {
        guard(13);
        doc.setFillColor(ar, ag, ab);
        doc.rect(margin, y - 5, 2.5, 9, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39);
        doc.text(block.text, margin + 5.5, y);
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.25);
        doc.line(margin, y + 3.5, pageW - margin, y + 3.5);
        y += 11;
        break;
      }

      // ── H3: small dot + bold ─────────────────────────────────────────────────
      case 'h3': {
        guard(9);
        doc.setFillColor(ar, ag, ab);
        doc.circle(margin + 1.2, y - 2, 1.5, 'F');
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39);
        doc.text(block.text, margin + 5, y);
        y += 8;
        break;
      }

      // ── Bullet ────────────────────────────────────────────────────────────────
      case 'bullet': {
        const plain   = strip(block.raw);
        const wrapped = doc.splitTextToSize(plain, maxW - 7);
        guard(wrapped.length * 5.5 + 2);
        // Colored bullet
        doc.setFillColor(ar, ag, ab);
        doc.circle(margin + 1.5, y - 1.5, 1.3, 'F');
        // Text (first line with inline bold, rest plain)
        doc.setFontSize(10.5);
        drawInlineLine(doc, block.raw, margin + 5.5, y, accent, normalColor);
        for (let li = 1; li < wrapped.length; li++) {
          y += 5.5;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...normalColor);
          doc.text(wrapped[li], margin + 5.5, y);
        }
        y += 6;
        break;
      }

      // ── Numbered ─────────────────────────────────────────────────────────────
      case 'numbered': {
        const plain   = strip(block.raw);
        const wrapped = doc.splitTextToSize(plain, maxW - 9);
        guard(wrapped.length * 5.5 + 2);
        // Colored circle with number
        doc.setFillColor(ar, ag, ab);
        doc.circle(margin + 2.2, y - 1.8, 2.8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(String(block.num), margin + 2.2, y - 0.3, { align: 'center' });
        // Text
        doc.setFontSize(10.5);
        drawInlineLine(doc, block.raw, margin + 7.5, y, accent, normalColor);
        for (let li = 1; li < wrapped.length; li++) {
          y += 5.5;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...normalColor);
          doc.text(wrapped[li], margin + 7.5, y);
        }
        y += 6;
        break;
      }

      // ── Callout / blockquote ─────────────────────────────────────────────────
      case 'callout': {
        const plain   = strip(block.raw);
        const wrapped = doc.splitTextToSize(plain, maxW - 10);
        const boxH    = wrapped.length * 5.5 + 7;
        guard(boxH + 4);
        doc.setFillColor(...lightBg);
        doc.rect(margin, y - 4.5, maxW, boxH, 'F');
        doc.setFillColor(ar, ag, ab);
        doc.rect(margin, y - 4.5, 3, boxH, 'F');
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...normalColor);
        wrapped.forEach((ln, li) => doc.text(ln, margin + 6.5, y + li * 5.5));
        y += boxH + 4;
        break;
      }

      // ── First paragraph: styled as intro callout ──────────────────────────────
      case 'paragraph': {
        const isIntro = !firstParagraphRendered && block.raw.length < 120;
        firstParagraphRendered = true;

        if (isIntro) {
          // Render as a subtle intro band
          const wrapped = doc.splitTextToSize(strip(block.raw), maxW - 6);
          const boxH    = wrapped.length * 6 + 7;
          guard(boxH + 4);
          doc.setFillColor(...lightBg);
          doc.rect(margin - 4, y - 5, maxW + 8, boxH, 'F');
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(ar, ag, ab);
          wrapped.forEach((ln, li) => doc.text(ln, margin, y + li * 6));
          y += boxH + 4;
        } else {
          const wrapped = doc.splitTextToSize(strip(block.raw), maxW);
          guard(wrapped.length * 5.5);
          doc.setFontSize(10.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...normalColor);
          wrapped.forEach((ln, li) => {
            if (y + li * 5.5 > pageH - margin - 12) { doc.addPage(); y = margin + 4; }
            doc.text(ln, margin, y + li * 5.5);
          });
          y += wrapped.length * 5.5;
        }
        break;
      }

      // ── Table ────────────────────────────────────────────────────────────────
      case 'table': {
        y = renderTable(doc, block.rows, y, margin, maxW, pageH, accent);
        break;
      }

      // ── HR: colored line with center diamond ─────────────────────────────────
      case 'hr': {
        guard(8);
        doc.setDrawColor(ar, ag, ab);
        doc.setLineWidth(0.4);
        doc.line(margin, y, pageW / 2 - 4, y);
        doc.line(pageW / 2 + 4, y, pageW - margin, y);
        // Diamond
        const cx = pageW / 2, cy = y;
        doc.setFillColor(ar, ag, ab);
        doc.lines([[2, -2], [2, 2], [-2, 2], [-2, -2]], cx - 2, cy, [1, 1], 'F', true);
        doc.setLineWidth(0.25);
        y += 7;
        break;
      }

      case 'blank': {
        y += 3;
        break;
      }
    }
  }

  // ── FOOTER (all pages) ──────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fy = pageH - 7;
    // Footer rule
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(margin, fy - 3.5, pageW - margin, fy - 3.5);
    // Footer accent dot
    doc.setFillColor(ar, ag, ab);
    doc.circle(margin - 2, fy - 3.5, 1.2, 'F');
    // Text
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text('Samuel Nicolas  |  NT Solutions', margin, fy);
    doc.text(
      new Date(date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }),
      pageW / 2, fy, { align: 'center' }
    );
    doc.text(`${p} / ${totalPages}`, pageW - margin, fy, { align: 'right' });
  }

  return doc;
}

// ── Public API ───────────────────────────────────────────────────────────────
export function exportToPdf(agentKey, agentName, content, date) {
  const doc      = buildDoc(agentKey, agentName, content, date);
  const filename = `HQ-${(agentName || agentKey).replace(/\s+/g, '-')}-${new Date(date).toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

export function getPdfBlobUrl(agentKey, agentName, content, date) {
  const doc  = buildDoc(agentKey, agentName, content, date);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}
