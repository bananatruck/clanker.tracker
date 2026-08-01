/**
 * File → plain text.
 *
 * Both parsers load lazily: pdf.js is by far the largest dependency in the
 * bundle, and someone who only ever drops in a DOCX should never download it.
 *
 * The PDF path does one thing that is easy to get wrong and fatal if you do:
 * pdf.js returns positioned text runs, **not lines**. Joining them naively
 * produces one enormous line, and every heuristic downstream — headings, date
 * anchoring, bullets — silently collapses. So runs are grouped back into lines
 * by their y coordinate before anything else touches them.
 */

export type ResumeFileKind = 'pdf' | 'docx' | 'txt';

export function detectKind(fileName: string, mime?: string): ResumeFileKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || mime?.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.txt') || name.endsWith('.md') || mime?.startsWith('text/')) return 'txt';
  return null;
}

/** Vertical slack, in PDF points, within which runs count as the same line. */
const LINE_TOLERANCE = 2.5;

async function extractPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();

  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages: string[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    // Bucket runs by baseline y, then order each bucket left to right.
    const rows: Array<{ y: number; runs: Array<{ x: number; text: string }> }> = [];

    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;

      const row = rows.find((r) => Math.abs(r.y - y) <= LINE_TOLERANCE);
      if (row) row.runs.push({ x, text: item.str });
      else rows.push({ y, runs: [{ x, text: item.str }] });
    }

    rows.sort((a, b) => b.y - a.y); // PDF y grows upward; reading order is down
    pages.push(
      rows
        .map((r) =>
          r.runs
            .sort((a, b) => a.x - b.x)
            .map((run) => run.text)
            .join(' '),
        )
        .join('\n'),
    );

    page.cleanup();
  }

  // Tear down the worker, not just the document — otherwise every resume the
  // user re-parses leaks one.
  await task.destroy();
  return pages.join('\n\n');
}

async function extractDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: data });
  return value;
}

/**
 * Clean up the artefacts every extractor leaves behind.
 *
 * Ligatures and non-breaking spaces in particular will otherwise defeat exact
 * keyword matching in the ATS scan — "workflow" typed with an `ﬂ` ligature is
 * not the same string as the one in the job description.
 */
export function normalizeText(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .replace(/ﬀ/g, 'ff')
      .replace(/ﬁ/g, 'fi')
      .replace(/ﬂ/g, 'fl')
      .replace(/ﬃ/g, 'ffi')
      .replace(/ﬄ/g, 'ffl')
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐-―]/g, '-')
      // Words split across a line break by hyphenation.
      .replace(/(\w)-\n(\w)/g, '$1$2')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export interface ExtractedText {
  text: string;
  kind: ResumeFileKind;
  fileName: string;
  bytes: number;
}

/** Read a dropped file into normalised plain text. */
export async function extractText(file: File): Promise<ExtractedText> {
  const kind = detectKind(file.name, file.type);
  if (!kind) throw new Error(`Unsupported file type: ${file.name}`);

  const buffer = await file.arrayBuffer();
  const raw =
    kind === 'pdf'
      ? await extractPdf(buffer)
      : kind === 'docx'
        ? await extractDocx(buffer)
        : new TextDecoder().decode(buffer);

  return {
    text: normalizeText(raw),
    kind,
    fileName: file.name,
    bytes: file.size,
  };
}
