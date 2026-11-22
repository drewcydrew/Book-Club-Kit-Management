import { Text } from 'react-native';
import { parseSynopsis } from '../domain/synopsis';
import { colors } from './design';

export function SynopsisText({ synopsis, numberOfLines }: { synopsis: string; numberOfLines?: number }) {
  const paragraphs = parseSynopsis(synopsis);
  return (
    <Text numberOfLines={numberOfLines} style={{ color: colors.ink, lineHeight: 22 }}>
      {paragraphs.map((paragraph, index) => (
        <Text key={index}>
          {index > 0 ? '\n\n' : ''}
          {paragraph.map((run, runIndex) => (
            <Text key={runIndex} style={run.bold ? { fontWeight: '700' } : undefined}>{run.text}</Text>
          ))}
        </Text>
      ))}
    </Text>
  );
}
