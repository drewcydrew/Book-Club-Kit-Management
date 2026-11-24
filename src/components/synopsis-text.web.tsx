import { parseSynopsis } from '../domain/synopsis';
import { colors } from './design';

// Plain HTML elements do not get React Native Web's font, so the browser default serif applied without this.
const synopsisFontFamily = "Inter, 'Segoe UI', Roboto, system-ui, -apple-system, sans-serif";

export function SynopsisText({ synopsis, numberOfLines }: { synopsis: string; numberOfLines?: number }) {
  const paragraphs = parseSynopsis(synopsis);
  const clamp = numberOfLines ? { display: '-webkit-box', WebkitLineClamp: numberOfLines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : undefined;
  return (
    <div style={{ color: colors.ink, fontFamily: synopsisFontFamily, lineHeight: 1.6, ...clamp }}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} style={{ margin: index > 0 ? '12px 0 0' : 0 }}>
          {paragraph.map((run, runIndex) => (run.bold ? <b key={runIndex}>{run.text}</b> : <span key={runIndex}>{run.text}</span>))}
        </p>
      ))}
    </div>
  );
}
