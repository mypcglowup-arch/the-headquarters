import { jsPDF } from 'jspdf';

/**
 * NT Solutions workflow package — professional client-deliverable PDF.
 *
 * Sections (minimum 10 pages):
 *   1.  Cover
 *   2.  Table of contents
 *   3.  Executive summary
 *   4.  Client problem diagnostic
 *   5.  How it works (plain-language explainer)
 *   6.  Installation guide (step-by-step)
 *   7.  Make.com JSON (importable blueprint)
 *   8.  Sales script & pricing
 *   9.  FAQ / objections
 *   10. Next steps & signature block
 */

// ─── Brand palette ──────────────────────────────────────────────────────
const C = {
  navy:    [10, 15, 28],
  indigo:  [99, 102, 241],
  indigoL: [165, 180, 252],
  gold:    [251, 191, 36],
  emerald: [16, 185, 129],
  red:     [239, 68, 68],
  text0:   [15, 23, 42],
  text1:   [51, 65, 85],
  text2:   [100, 116, 139],
  muted:   [148, 163, 184],
  line:    [226, 232, 240],
  bg:      [245, 244, 240],
};

// ─── Core builder ───────────────────────────────────────────────────────
// Pull the consultant's display name from localStorage userProfile.
// Fallback : 'NT Solutions' alone (company name) so the PDF still has a label.
function getConsultantName() {
  try {
    const raw = localStorage.getItem('qg_user_profile_v1');
    if (!raw) return '';
    const p = JSON.parse(raw);
    return (p?.name || '').trim();
  } catch { return ''; }
}

export function buildWorkflowPdf({ answers, template, pkg, lang = 'fr' }) {
  if (!template || !pkg) return null;
  const consultantName = getConsultantName();
  const consultantLine = consultantName ? `${consultantName} · NT Solutions` : 'NT Solutions';
  const consultantRef  = consultantName || (lang === 'fr' ? 'le consultant' : 'the consultant');

  const doc    = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 56;
  const contentW = pageW - margin * 2;

  // Page tracking — we number all pages except the cover
  const pages = { cover: 1 };
  let pageNum = 1;
  let y = margin;

  // Helpers ──────────────────────────────────────────────────────────────
  const setColor = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setFill  = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const setDraw  = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  const ensureSpace = (needed) => {
    if (y + needed > pageH - margin - 20) {
      addPageFooter();
      newPage();
    }
  };

  const addPageFooter = () => {
    if (pageNum === pages.cover) return; // cover has no footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(C.muted);
    const now = new Date().toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
    doc.text(`NT Solutions · ${template.emoji} ${template.name} · ${answers.clientName}`, margin, pageH - 28);
    doc.text(`${lang === 'fr' ? 'page' : 'page'} ${pageNum}`, pageW - margin, pageH - 28, { align: 'right' });
    setDraw(C.line); doc.setLineWidth(0.4);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
  };

  const newPage = () => {
    doc.addPage();
    pageNum++;
    y = margin;
  };

  const section = (title, eyebrow) => {
    ensureSpace(80);
    if (eyebrow) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setColor(C.indigo);
      doc.text(String(eyebrow).toUpperCase(), margin, y);
      y += 14;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    setColor(C.text0);
    doc.text(title, margin, y);
    y += 10;
    setDraw(C.indigo); doc.setLineWidth(2);
    doc.line(margin, y + 4, margin + 60, y + 4);
    y += 28;
  };

  const subsection = (title) => {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setColor(C.indigo);
    doc.text(title, margin, y);
    y += 20;
  };

  const paragraph = (text, opts = {}) => {
    const { size = 10.5, gap = 6, color = C.text1, font = 'normal', indent = 0 } = opts;
    doc.setFont('helvetica', font);
    doc.setFontSize(size);
    setColor(color);
    const maxW = contentW - indent;
    const lines = doc.splitTextToSize(String(text), maxW);
    const lh = size * 1.5;
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, margin + indent, y);
      y += lh;
    }
    y += gap;
  };

  // Parse a chunk of markdown and render to PDF.
  // Handles: # / ## / ### headings, **bold** (approximate via font switch for lines starting with bold),
  // `- ` bullets, `1.` numbered lists, blank-line paragraphs. Strips other md.
  const markdown = (md) => {
    if (!md) return;
    const lines = String(md).split('\n');
    let listCounter = 0;
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();

      // Blank line → paragraph break
      if (line === '') { y += 4; inList = false; continue; }

      // Strip inline markdown markers from text content
      const clean = (s) => s
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

      // H1
      if (line.startsWith('# ')) {
        ensureSpace(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        setColor(C.text0);
        doc.text(clean(line.slice(2)), margin, y);
        y += 24;
        inList = false;
        continue;
      }
      // H2
      if (line.startsWith('## ')) {
        ensureSpace(26);
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        setColor(C.indigo);
        doc.text(clean(line.slice(3)), margin, y);
        y += 18;
        inList = false;
        continue;
      }
      // H3
      if (line.startsWith('### ')) {
        ensureSpace(22);
        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        setColor(C.text0);
        doc.text(clean(line.slice(4)), margin, y);
        y += 15;
        inList = false;
        continue;
      }
      // Bullet
      if (/^[-*]\s+/.test(line)) {
        if (!inList) { inList = true; }
        const text = clean(line.replace(/^[-*]\s+/, ''));
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        setColor(C.text1);
        const bulletIndent = 14;
        const maxW = contentW - bulletIndent;
        const wrapped = doc.splitTextToSize(text, maxW);
        const lh = 15;
        ensureSpace(lh);
        // Bullet glyph
        setFill(C.indigo);
        doc.circle(margin + 4, y - 3, 1.6, 'F');
        setColor(C.text1);
        for (let k = 0; k < wrapped.length; k++) {
          if (k > 0) ensureSpace(lh);
          doc.text(wrapped[k], margin + bulletIndent, y);
          y += lh;
        }
        continue;
      }
      // Numbered
      const numMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        if (!inList) { inList = true; listCounter = 0; }
        listCounter++;
        const text = clean(numMatch[2]);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        setColor(C.text1);
        const numIndent = 20;
        const maxW = contentW - numIndent;
        const wrapped = doc.splitTextToSize(text, maxW);
        const lh = 15;
        ensureSpace(lh);
        doc.setFont('helvetica', 'bold');
        setColor(C.indigo);
        doc.text(`${numMatch[1]}.`, margin, y);
        doc.setFont('helvetica', 'normal');
        setColor(C.text1);
        for (let k = 0; k < wrapped.length; k++) {
          if (k > 0) ensureSpace(lh);
          doc.text(wrapped[k], margin + numIndent, y);
          y += lh;
        }
        continue;
      }

      // Regular paragraph line — detect **bold** at start for inline bold question markers (FAQ: "Q:", "R:")
      inList = false;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      setColor(C.text1);
      paragraph(clean(line), { size: 10.5, gap: 2 });
    }
    y += 4;
  };

  // Colored callout box
  const callout = (title, lines, rgb) => {
    ensureSpace(80);
    const boxTop = y;
    const padding = 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const titleH = 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const textLines = lines.flatMap((l) => doc.splitTextToSize(l, contentW - padding * 2));
    const bodyH = textLines.length * 14;
    const boxH  = titleH + bodyH + padding * 1.5;
    setFill([rgb[0], rgb[1], rgb[2]]);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    // Background tint — draw opaque then overlay alpha via GState if needed; jsPDF native: use lighter fill color
    doc.setFillColor(255, 255, 255); // reset clean
    // Border + light tint approach: just stroked rectangle + bold title
    setDraw(rgb); doc.setLineWidth(1);
    doc.roundedRect(margin, boxTop, contentW, boxH, 8, 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setColor(rgb);
    doc.text(String(title).toUpperCase(), margin + padding, boxTop + padding + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setColor(C.text1);
    let ty = boxTop + padding + titleH + 4;
    for (const line of textLines) {
      doc.text(line, margin + padding, ty);
      ty += 14;
    }
    y = boxTop + boxH + 12;
  };

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ═════════════════════════════════════════════════════════════════════
  setFill(C.navy);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Two-square brand mark (matches the app header logo)
  setFill([241, 245, 249]);
  doc.roundedRect(margin, margin + 4, 14, 14, 2, 2, 'F');
  setFill([102, 108, 116]);
  doc.roundedRect(margin + 20, margin + 4, 14, 14, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(241, 245, 249);
  doc.text('NT SOLUTIONS', margin + 44, margin + 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(lang === 'fr' ? 'Agence d\'automatisation IA · Québec' : 'AI automation agency · Quebec', margin + 44, margin + 27);

  // Big emoji
  doc.setFontSize(54);
  doc.setTextColor(241, 245, 249);
  doc.text(String(template.emoji || ''), margin, 210);

  // Title block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(165, 180, 252);
  doc.text(lang === 'fr' ? 'PACKAGE WORKFLOW' : 'WORKFLOW PACKAGE', margin, 260);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  doc.setTextColor(241, 245, 249);
  doc.text(doc.splitTextToSize(template.name, contentW), margin, 298);

  // Client block
  doc.setDrawColor(99, 102, 241);
  doc.setLineWidth(2);
  doc.line(margin, 360, margin + 40, 360);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text(lang === 'fr' ? 'Préparé pour' : 'Prepared for', margin, 380);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(241, 245, 249);
  doc.text(String(answers.clientName || '—'), margin, 408);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(148, 163, 184);
  doc.text(`${answers.industry || ''} · ${answers.volume || '—'} ${lang === 'fr' ? 'unités/mois' : 'units/mo'}`, margin, 428);

  // Pricing band at bottom
  if (pkg.pricing) {
    const p = pkg.pricing;
    const bandY = pageH - 200;
    doc.setFillColor(99, 102, 241);
    // Top thin accent line
    doc.rect(margin, bandY, contentW, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(251, 191, 36);
    doc.text(lang === 'fr' ? `TIER SUGGÉRÉ — ${p.tier.toUpperCase()}` : `SUGGESTED TIER — ${p.tier.toUpperCase()}`, margin, bandY + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(lang === 'fr' ? 'Setup initial' : 'Initial setup', margin, bandY + 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(241, 245, 249);
    doc.text(`$${p.setupMin.toLocaleString()} — $${p.setupMax.toLocaleString()}`, margin, bandY + 70);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(lang === 'fr' ? 'Retainer mensuel' : 'Monthly retainer', margin + 260, bandY + 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(241, 245, 249);
    doc.text(`$${p.retainerMin.toLocaleString()} — $${p.retainerMax.toLocaleString()} / mo`, margin + 260, bandY + 70);
  }

  // Footer
  const today = new Date().toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`${today} · Document confidentiel`, margin, pageH - 40);

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 2 — TABLE OF CONTENTS
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? 'Sommaire' : 'Table of contents', 'NT Solutions');
  const toc = [
    { n: 3,  title: lang === 'fr' ? 'Résumé exécutif' : 'Executive summary' },
    { n: 4,  title: lang === 'fr' ? 'Diagnostic du client' : 'Client diagnostic' },
    { n: 5,  title: lang === 'fr' ? 'Comment ça fonctionne' : 'How it works' },
    { n: 7,  title: lang === 'fr' ? "Guide d'installation" : 'Installation guide' },
    { n: 9,  title: lang === 'fr' ? 'Blueprint Make.com (JSON)' : 'Make.com blueprint (JSON)' },
    { n: 10, title: lang === 'fr' ? 'Script de vente & pricing' : 'Sales script & pricing' },
    { n: 11, title: lang === 'fr' ? 'FAQ — objections anticipées' : 'FAQ — anticipated objections' },
    { n: 12, title: lang === 'fr' ? 'Prochaines étapes' : 'Next steps' },
  ];
  for (const item of toc) {
    ensureSpace(26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    setColor(C.text1);
    const dotsStart = margin + doc.getTextWidth(item.title) + 12;
    doc.text(item.title, margin, y);
    doc.setFont('helvetica', 'bold');
    setColor(C.indigo);
    doc.text(String(item.n), pageW - margin, y, { align: 'right' });
    // Dotted leader
    setColor(C.line);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const dotsW = pageW - margin - dotsStart - 20;
    const dotCount = Math.max(0, Math.floor(dotsW / 4));
    doc.text('.'.repeat(dotCount), dotsStart, y);
    y += 22;
  }
  addPageFooter();

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 3 — EXECUTIVE SUMMARY
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? 'Résumé exécutif' : 'Executive summary', 'SECTION 1');
  paragraph(
    lang === 'fr'
      ? `Ce document présente le système d'automatisation "${template.name}" préparé par NT Solutions pour ${answers.clientName}. Il inclut le diagnostic du problème actuel, le workflow complet, le guide d'installation, le blueprint Make.com prêt à importer, ainsi que la proposition commerciale détaillée.`
      : `This document outlines the "${template.name}" automation system prepared by NT Solutions for ${answers.clientName}. It includes the current problem diagnostic, the complete workflow, the installation guide, a ready-to-import Make.com blueprint, and the detailed commercial proposal.`,
    { size: 11, gap: 12 }
  );

  // Key metrics snapshot
  const pricing = pkg.pricing;
  if (pricing) {
    subsection(lang === 'fr' ? 'Proposition commerciale en un coup d\'œil' : 'Commercial proposal at a glance');
    callout(
      lang === 'fr' ? `TIER ${pricing.tier}` : `TIER ${pricing.tier}`,
      [
        (lang === 'fr' ? 'Setup initial : ' : 'Initial setup: ') + `$${pricing.setupMin.toLocaleString()} — $${pricing.setupMax.toLocaleString()}`,
        (lang === 'fr' ? 'Retainer mensuel : ' : 'Monthly retainer: ') + `$${pricing.retainerMin.toLocaleString()} — $${pricing.retainerMax.toLocaleString()} / mois`,
        (lang === 'fr' ? 'Score de complexité : ' : 'Complexity score: ') + `${pricing.score}/15`,
        (lang === 'fr' ? 'Multiplicateur industrie : ' : 'Industry multiplier: ') + `×${pricing.industryMultiplier}`,
      ],
      C.gold
    );
  }

  subsection(lang === 'fr' ? 'Contenu de ce document' : 'What this document covers');
  paragraph(lang === 'fr'
    ? `Les pages qui suivent sont organisées pour passer de la compréhension du problème → à la description du système → au pricing → aux objections anticipées. Chaque section peut être lue indépendamment. Le PDF constitue le livrable complet — aucune autre pièce n'est nécessaire pour démarrer.`
    : `The following pages go from problem understanding → system description → pricing → anticipated objections. Each section stands on its own. This PDF is the complete deliverable — no other document is needed to get started.`);
  addPageFooter();

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 4 — CLIENT PROBLEM DIAGNOSTIC
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? 'Diagnostic du client' : 'Client diagnostic', 'SECTION 2');
  if (pkg.problemSummary) {
    markdown(pkg.problemSummary);
  } else {
    paragraph(lang === 'fr' ? 'Diagnostic non généré.' : 'Diagnostic not generated.', { color: C.muted });
  }
  addPageFooter();

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 5-6 — HOW IT WORKS
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? 'Comment ça fonctionne' : 'How it works', 'SECTION 3');
  if (pkg.workflowExplainer) {
    markdown(pkg.workflowExplainer);
  } else {
    paragraph(lang === 'fr' ? 'Explication non générée.' : 'Explainer not generated.', { color: C.muted });
  }
  addPageFooter();

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 7-8 — INSTALLATION GUIDE
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? "Guide d'installation" : 'Installation guide', 'SECTION 4');
  paragraph(
    lang === 'fr'
      ? `Ce guide est écrit pour ${consultantRef} (consultant NT Solutions) qui installe le système pour ${answers.clientName}. Suis les étapes dans l'ordre. Prévois 30-90 minutes selon la complexité des intégrations.`
      : `This guide is written for ${consultantRef} (NT Solutions consultant) installing the system for ${answers.clientName}. Follow the steps in order. Expect 30-90 minutes depending on integration complexity.`,
    { color: C.text2, size: 9.5, gap: 14 }
  );
  if (pkg.guide) {
    markdown(pkg.guide);
  } else {
    paragraph(lang === 'fr' ? 'Guide non généré.' : 'Guide not generated.', { color: C.muted });
  }
  addPageFooter();

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 9 — MAKE.COM JSON BLUEPRINT
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? 'Blueprint Make.com' : 'Make.com blueprint', 'SECTION 5');
  paragraph(
    lang === 'fr'
      ? `Copie le JSON ci-dessous et importe-le dans Make.com (Scenario → Import blueprint). Les placeholders "REPLACE_ME_*" doivent être remplacés par les vrais IDs du client avant activation.`
      : `Copy the JSON below and import it into Make.com (Scenario → Import blueprint). The "REPLACE_ME_*" placeholders must be replaced with the client's real IDs before activating.`,
    { color: C.text2, size: 9.5, gap: 12 }
  );

  const jsonText = pkg.makeJson
    ? JSON.stringify(pkg.makeJson, null, 2)
    : (lang === 'fr' ? '// JSON non généré — réessaie la génération' : '// JSON not generated — retry generation');

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.8);
  setColor(C.text1);
  const jsonLines = doc.splitTextToSize(jsonText, contentW);
  const jsonLH = 10;
  for (const line of jsonLines) {
    if (y + jsonLH > pageH - margin - 20) {
      addPageFooter();
      newPage();
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.8);
      setColor(C.text1);
    }
    doc.text(line, margin, y);
    y += jsonLH;
  }
  y += 8;
  addPageFooter();

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 10 — SALES SCRIPT & PRICING
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? 'Script de vente & pricing' : 'Sales script & pricing', 'SECTION 6');
  paragraph(
    lang === 'fr'
      ? `Ce script est pour ${consultantRef} au téléphone ou en meeting avec ${answers.clientName}. Chaque section peut être adaptée, mais les chiffres de pricing sont calibrés — ne descends pas en dessous du minimum sans raison solide.`
      : `This script is for ${consultantRef} on the phone or in a meeting with ${answers.clientName}. Each section can be adapted, but the pricing numbers are calibrated — don't go below the minimum without a solid reason.`,
    { color: C.text2, size: 9.5, gap: 14 }
  );
  if (pkg.script) {
    markdown(pkg.script);
  } else {
    paragraph(lang === 'fr' ? 'Script non généré.' : 'Script not generated.', { color: C.muted });
  }

  // Pricing recap callout at end of section
  if (pricing) {
    ensureSpace(120);
    subsection(lang === 'fr' ? 'Rappel du pricing calibré' : 'Calibrated pricing recap');
    callout(
      lang === 'fr' ? 'CHIFFRES À UTILISER EN DIRECT' : 'NUMBERS TO USE LIVE',
      [
        `${lang === 'fr' ? 'Setup' : 'Setup'}: $${pricing.setupMin.toLocaleString()} — $${pricing.setupMax.toLocaleString()}`,
        `${lang === 'fr' ? 'Retainer' : 'Retainer'}: $${pricing.retainerMin.toLocaleString()} — $${pricing.retainerMax.toLocaleString()} / ${lang === 'fr' ? 'mois' : 'month'}`,
        `${lang === 'fr' ? 'Justifie par le ROI mensuel, pas par le coût de ton temps.' : 'Justify by monthly ROI, never by hourly cost.'}`,
      ],
      C.indigo
    );
  }
  addPageFooter();

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 11 — FAQ / OBJECTIONS
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? 'FAQ — objections anticipées' : 'FAQ — anticipated objections', 'SECTION 7');
  paragraph(
    lang === 'fr'
      ? `Les objections que ${answers.clientName} est susceptible de poser, et les réponses que ${consultantRef} a prêtes. Lis avant l'appel — ne réinvente pas la roue en direct.`
      : `Objections ${answers.clientName} is likely to raise, and ${consultantRef}'s ready answers. Read before the call — don't reinvent live.`,
    { color: C.text2, size: 9.5, gap: 14 }
  );
  if (pkg.faq) {
    markdown(pkg.faq);
  } else {
    paragraph(lang === 'fr' ? 'FAQ non générée.' : 'FAQ not generated.', { color: C.muted });
  }
  addPageFooter();

  // ═════════════════════════════════════════════════════════════════════
  // PAGE 12 — NEXT STEPS
  // ═════════════════════════════════════════════════════════════════════
  newPage();
  section(lang === 'fr' ? 'Prochaines étapes' : 'Next steps', 'SECTION 8');

  subsection(lang === 'fr' ? `De ton côté${consultantName ? ` (${consultantName})` : ''}` : `On your side${consultantName ? ` (${consultantName})` : ''}`);
  markdown(lang === 'fr'
    ? `1. Relis le script (section 6) et le FAQ (section 7) avant l'appel.
2. Vérifie que les credentials ${Array.isArray(answers.tools) ? answers.tools.filter((t) => t !== 'Aucun').join(', ') : ''} sont accessibles côté client.
3. Prépare un slot de 90 minutes pour l'installation après le go.
4. Décide du tier exact (dans la fourchette ${pricing?.tier || ''}) avant de présenter le prix.`
    : `1. Re-read the script (section 6) and FAQ (section 7) before the call.
2. Confirm the client's ${Array.isArray(answers.tools) ? answers.tools.filter((t) => t !== 'Aucun').join(', ') : ''} credentials will be available.
3. Block 90 minutes for installation once approved.
4. Pick the exact tier (within the ${pricing?.tier || ''} range) before quoting.`);

  subsection(lang === 'fr' ? 'Côté client' : 'On the client side');
  markdown(lang === 'fr'
    ? `1. Lecture du document complet (sections 2 et 3 en priorité).
2. Confirmation verbale du budget + tier sélectionné.
3. Signature d'entente + paiement du setup (50% upfront, 50% à la livraison).
4. Accès fourni aux outils mentionnés en section 4.`
    : `1. Read the full document (sections 2 and 3 first).
2. Verbal confirmation of budget + selected tier.
3. Agreement signed + setup paid (50% upfront, 50% on delivery).
4. Credentials for the tools mentioned in section 4 provided.`);

  subsection(lang === 'fr' ? 'Contact' : 'Contact');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  setColor(C.text1);
  doc.text(consultantLine, margin, y);
  y += 16;
  doc.text('mypcglowup@gmail.com', margin, y);
  y += 16;
  setColor(C.text2);
  doc.setFontSize(9);
  doc.text(lang === 'fr' ? 'Québec, Canada' : 'Quebec, Canada', margin, y);

  // Signature block
  y += 40;
  ensureSpace(80);
  setDraw(C.line); doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 200, y);
  doc.line(pageW - margin - 200, y, pageW - margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(C.text2);
  doc.text(consultantLine, margin, y + 14);
  doc.text(String(answers.clientName || ''), pageW - margin - 200, y + 14);
  setColor(C.muted);
  doc.setFontSize(8);
  doc.text(lang === 'fr' ? 'Date : ________________' : 'Date: ________________', margin, y + 30);
  doc.text(lang === 'fr' ? 'Date : ________________' : 'Date: ________________', pageW - margin - 200, y + 30);

  addPageFooter();

  // ─── Finalize ────────────────────────────────────────────────────────
  const safeName = String(answers.clientName || template.id).replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 50);
  const filename = `NTSolutions_${template.id}_${safeName}.pdf`;
  const blob = doc.output('blob');
  return { blob, filename };
}

/**
 * Trigger download of a pre-built blob — instant, no jsPDF work.
 */
export function downloadPdfBlob(blob, filename) {
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename || 'workflow.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

/**
 * One-shot helper — backward compatible with the old API signature.
 */
export function exportWorkflowPdf(opts) {
  const res = buildWorkflowPdf(opts);
  if (!res) return false;
  return downloadPdfBlob(res.blob, res.filename);
}
