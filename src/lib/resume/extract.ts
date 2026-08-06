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

/** One positioned text run, as pdf.js reports it. */
export interface PositionedRun {
  x: number;
  y: number;
  text: string;
}

/**
 * Regroup positioned runs back into reading-order lines.
 *
 * Kept pure and exported because this is the one piece of the PDF path with
 * real logic in it, and it is untestable through pdf.js without shipping a
 * binary fixture. Everything around it is plumbing.
 */
export function groupRunsIntoLines(
  runs: readonly PositionedRun[],
  tolerance = LINE_TOLERANCE,
): string {
  const rows: Array<{ y: number; runs: PositionedRun[] }> = [];

  for (const run of runs) {
    const row = rows.find((r) => Math.abs(r.y - run.y) <= tolerance);
    if (row) row.runs.push(run);
    else rows.push({ y: run.y, runs: [run] });
  }

  return rows
    .sort((a, b) => b.y - a.y) // PDF y grows upward; reading order is down
    .map((r) =>
      r.runs
        .sort((a, b) => a.x - b.x)
        .map((run) => run.text)
        .join(' '),
    )
    .join('\n');
}

async function extractPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();

  const task = pdfjs.getDocument({
    data,
    // We only ever want the text, and both of these otherwise reach for font
    // assets over the network — which the extension CSP blocks, and which
    // would sit badly with "parsed on your machine, nothing is uploaded".
    useSystemFonts: false,
    disableFontFace: true,
  });
  const doc = await task.promise;
  const pages: string[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    const runs: PositionedRun[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      runs.push({
        x: item.transform[4] as number,
        y: item.transform[5] as number,
        text: item.str,
      });
    }

    pages.push(groupRunsIntoLines(runs));
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

/**
 * Below this many characters there is nothing a parser could work with, and
 * every downstream heuristic would report "not found" for every field — which
 * looks exactly like a broken extension rather than an unreadable file.
 */
const MIN_USEFUL_CHARS = 40;

/** Read a dropped file into normalised plain text. */
export async function extractText(file: File): Promise<ExtractedText> {
  const kind = detectKind(file.name, file.type);
  if (!kind) {
    throw new Error(
      `${file.name} is not a PDF, DOCX, or text file. Paste the text instead.`,
    );
  }

  const buffer = await file.arrayBuffer();
  const raw =
    kind === 'pdf'
      ? await extractPdf(buffer)
      : kind === 'docx'
        ? await extractDocx(buffer)
        : new TextDecoder().decode(buffer);

  const text = normalizeText(raw);

  // A scanned or image-only PDF parses without error and yields nothing. Say
  // so plainly — silently handing back an empty profile is the worse failure.
  if (text.length < MIN_USEFUL_CHARS) {
    throw new Error(
      kind === 'pdf'
        ? 'No text in that PDF — it is probably a scan or an image. Paste the text instead.'
        : 'That file had almost no text in it. Paste the text instead.',
    );
  }

  return { text, kind, fileName: file.name, bytes: file.size };
}

/** Take resume text the user pasted by hand. The fallback that always works. */
export function fromPastedText(text: string, fileName = 'pasted resume'): ExtractedText {
  const normalized = normalizeText(text);
  if (normalized.length < MIN_USEFUL_CHARS) {
    throw new Error('That is too short to parse. Paste the whole resume.');
  }
  return {
    text: normalized,
    kind: 'txt',
    fileName,
    bytes: new Blob([normalized]).size,
  };
}
