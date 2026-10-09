import { jsPDF } from 'jspdf';
import type { JobDescription } from '@/types/job-description';
import {
  formatJobDescriptionMarkdown,
  formatJobDescriptionPlainText,
  getJobDescriptionMetadata,
  getJobDescriptionSections
} from '@/lib/jd-formatters';

function sanitiseFilename(value: string, fallback: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  return base || fallback;
}

export function downloadMarkdown(jd: JobDescription): void {
  const text = formatJobDescriptionMarkdown(jd);
  const filename = sanitiseFilename(jd.job_title ?? 'Job_Description', 'Job_Description') + '.md';
  triggerDownload(filename, text, 'text/markdown;charset=utf-8');
}

export function downloadText(jd: JobDescription): void {
  const text = formatJobDescriptionPlainText(jd);
  const filename = sanitiseFilename(jd.job_title ?? 'Job_Description', 'Job_Description') + '.txt';
  triggerDownload(filename, text, 'text/plain;charset=utf-8');
}

export async function downloadPdf(jd: JobDescription): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56;
  const lineHeight = 18;
  let y = 56;

  doc.setDrawColor(15, 23, 42);
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('Academian', margin, 24);
  doc.setTextColor(15, 23, 42);

  const title = jd.job_title || 'Job Description';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(title, pageWidth - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 24 + 12;

  const meta = getJobDescriptionMetadata(jd);
  if (meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const wrappedMeta = doc.splitTextToSize(meta, pageWidth - margin * 2);
    doc.text(wrappedMeta, margin, y);
    y += wrappedMeta.length * 16 + 12;
  }

  for (const { heading, content } of getJobDescriptionSections(jd)) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = 56;
    }

    if (heading) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(heading, margin, y);
      y += 18;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    const textContent = Array.isArray(content)
      ? content.map((item) => `• ${item}`)
      : [content];

    const chunks: string[] = [];
    textContent.forEach((entry) => {
      chunks.push(...doc.splitTextToSize(entry, pageWidth - margin * 2));
      chunks.push('');
    });

    for (const chunk of chunks) {
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 56;
      }
      doc.text(chunk, margin, y);
      y += 14;
    }
    y += 8;
  }

  const filename = sanitiseFilename(title, 'Job_Description') + '.pdf';
  doc.save(filename);
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
