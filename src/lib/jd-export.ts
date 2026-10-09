import { jsPDF } from 'jspdf';
import type { JobDescription } from '@/types/job-description';
import {
  formatJobDescriptionHtml,
  formatJobDescriptionMarkdown,
  formatJobDescriptionPlainText,
  getJobDescriptionMetadata,
  getJobDescriptionSections,
  parseInline,
  type InlineSegment
} from '@/lib/jd-formatters';

export type ExportOptions = {
  /** Hiring company shown in the document banner; no banner is drawn when it is absent. */
  companyName?: string;
};

function sanitiseFilename(value: string, fallback: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  return base || fallback;
}

function exportFilename(jd: JobDescription, extension: string): string {
  return sanitiseFilename(jd.job_title ?? 'Job_Description', 'Job_Description') + extension;
}

export function downloadMarkdown(jd: JobDescription): void {
  triggerDownload(exportFilename(jd, '.md'), formatJobDescriptionMarkdown(jd), 'text/markdown;charset=utf-8');
}

export function downloadText(jd: JobDescription): void {
  triggerDownload(exportFilename(jd, '.txt'), formatJobDescriptionPlainText(jd), 'text/plain;charset=utf-8');
}

/** Copies rich HTML where the browser allows it, so headings, bullets and bold survive a paste; plain text otherwise. */
export async function copyToClipboard(jd: JobDescription): Promise<void> {
  const text = formatJobDescriptionPlainText(jd);

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([formatJobDescriptionHtml(jd)], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ]);
      return;
    } catch {
      // Some browsers expose ClipboardItem but reject HTML; fall through to plain text
    }
  }

  await navigator.clipboard.writeText(text);
}

export async function downloadWord(jd: JobDescription, options: ExportOptions = {}): Promise<void> {
  // Loaded on demand so the docx library is not part of the initial page bundle
  const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');

  const runs = (segments: InlineSegment[]) => segments.map(({ text, bold }) => new TextRun({ text, bold }));
  const children: InstanceType<typeof Paragraph>[] = [];

  if (options.companyName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: options.companyName, color: '64748B', size: 18 })]
      })
    );
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: jd.job_title || 'Job Description', bold: true })]
    })
  );

  for (const { label, value } of getJobDescriptionMetadata(jd)) {
    children.push(new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)] }));
  }

  for (const { heading, content } of getJobDescriptionSections(jd)) {
    if (heading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240 },
          children: [new TextRun({ text: `${heading}:`, bold: true })]
        })
      );
    }
    if (Array.isArray(content)) {
      content.forEach((item) => children.push(new Paragraph({ bullet: { level: 0 }, children: runs(parseInline(item)) })));
    } else {
      children.push(new Paragraph({ spacing: { before: 160 }, children: runs(parseInline(content)) }));
    }
  }

  const document = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }]
  });
  const blob = await Packer.toBlob(document);
  triggerDownload(exportFilename(jd, '.docx'), blob);
}

const PDF_MARGIN = 56;
const PDF_BODY_SIZE = 11;
const PDF_LINE_HEIGHT = 15;

/** Shared vertical position, so every helper starts a new page the same way. */
type PdfCursor = { doc: jsPDF; y: number };

function ensureSpace(cursor: PdfCursor, needed: number): void {
  if (cursor.y + needed > cursor.doc.internal.pageSize.getHeight() - PDF_MARGIN) {
    cursor.doc.addPage();
    cursor.y = PDF_MARGIN;
  }
}

export async function downloadPdf(jd: JobDescription, options: ExportOptions = {}): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PDF_MARGIN * 2;
  const cursor: PdfCursor = { doc, y: 56 };

  if (options.companyName) {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(options.companyName, PDF_MARGIN, 26);
    cursor.y = 76;
  }
  doc.setTextColor(15, 23, 42);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(jd.job_title || 'Job Description', contentWidth);
  doc.text(titleLines, PDF_MARGIN, cursor.y);
  cursor.y += titleLines.length * 24 + 6;

  doc.setFontSize(PDF_BODY_SIZE);
  for (const { label, value } of getJobDescriptionMetadata(jd)) {
    drawRichText(cursor, [{ text: `${label}: `, bold: true }, { text: value, bold: false }], PDF_MARGIN, contentWidth);
  }
  cursor.y += 10;

  for (const { heading, content } of getJobDescriptionSections(jd)) {
    if (heading) {
      // Keep a heading together with at least the first lines of its section
      ensureSpace(cursor, PDF_LINE_HEIGHT * 3);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`${heading}:`, PDF_MARGIN, cursor.y);
      cursor.y += 18;
    }

    doc.setFontSize(PDF_BODY_SIZE);
    if (Array.isArray(content)) {
      for (const item of content) {
        ensureSpace(cursor, PDF_LINE_HEIGHT);
        doc.setFont('helvetica', 'normal');
        doc.text('•', PDF_MARGIN + 4, cursor.y);
        drawRichText(cursor, parseInline(item), PDF_MARGIN + 16, contentWidth - 16);
        cursor.y += 3;
      }
    } else {
      drawRichText(cursor, parseInline(content), PDF_MARGIN, contentWidth);
    }
    cursor.y += 10;
  }

  doc.save(exportFilename(jd, '.pdf'));
}

/** Word-wraps mixed bold/normal text, which jsPDF's splitTextToSize cannot do, and advances the cursor past it. */
function drawRichText(cursor: PdfCursor, segments: InlineSegment[], x: number, maxWidth: number): void {
  const { doc } = cursor;
  const setWeight = (bold: boolean) => doc.setFont('helvetica', bold ? 'bold' : 'normal');
  const words = segments.flatMap(({ text, bold }) =>
    text.split(/(\s+)/).filter(Boolean).map((word) => ({ text: word, bold }))
  );

  const lines: Array<typeof words> = [[]];
  let lineWidth = 0;
  for (const word of words) {
    const isSpace = !word.text.trim();
    const current = lines[lines.length - 1];
    if (isSpace && current.length === 0) {
      continue; // no leading spaces on a wrapped line
    }
    setWeight(word.bold);
    const width = doc.getTextWidth(word.text);
    if (!isSpace && current.length > 0 && lineWidth + width > maxWidth) {
      lines.push([word]);
      lineWidth = width;
    } else {
      current.push(word);
      lineWidth += width;
    }
  }

  for (const line of lines) {
    ensureSpace(cursor, PDF_LINE_HEIGHT);
    let left = x;
    for (const word of line) {
      setWeight(word.bold);
      doc.text(word.text, left, cursor.y);
      left += doc.getTextWidth(word.text);
    }
    cursor.y += PDF_LINE_HEIGHT;
  }
}

function triggerDownload(filename: string, content: string | Blob, mimeType = 'application/octet-stream'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
