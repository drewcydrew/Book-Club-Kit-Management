export type SynopsisRun = { text: string; bold: boolean };
export type SynopsisParagraph = SynopsisRun[];

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return entities[name.toLowerCase()] ?? match;
  });
}

// Plain text for exports such as PDFs, with paragraphs separated by a space.
export function synopsisPlainText(value: string | null | undefined): string {
  return parseSynopsis(value).map((paragraph) => paragraph.map((run) => run.text).join('')).join(' ');
}

// Converts a stored synopsis (<p> paragraphs with <b> emphasis, escaped text) into paragraphs of runs.
// Values without <p> tags, such as older plain-text synopses, become a single paragraph.
export function parseSynopsis(value: string | null | undefined): SynopsisParagraph[] {
  if (!value) return [];
  const paragraphs: SynopsisParagraph[] = [];
  let current: SynopsisParagraph = [];
  let bold = false;
  const finish = () => {
    if (current.some((run) => run.text.trim())) paragraphs.push(current);
    current = [];
  };
  const tokens = /<\/?(p|b)>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(value)) !== null) {
    if (match.index > last) current.push({ text: decode(value.slice(last, match.index)), bold });
    const closing = match[0][1] === '/';
    const tag = match[1].toLowerCase();
    if (tag === 'p') finish();
    else bold = !closing;
    last = tokens.lastIndex;
  }
  if (last < value.length) current.push({ text: decode(value.slice(last)), bold });
  finish();
  return paragraphs;
}
