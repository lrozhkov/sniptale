const SECTION = /^\[([a-z]+)\]$/u;

type Section = { name: string; lines: string[] };

function parseSections(value: string): Section[] | null {
  const sections: Section[] = [{ name: 'card', lines: [] }];
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    const match = SECTION.exec(trimmed);
    if (match) {
      sections.push({ name: match[1]!, lines: [] });
      continue;
    }
    if (trimmed.startsWith('[') || trimmed.includes('{') || trimmed.includes('}')) return null;
    sections.at(-1)!.lines.push(line);
  }
  return sections;
}

export function extractCalloutCardCss(value: string): string | null {
  const sections = parseSections(value);
  if (!sections) return null;
  return sections
    .filter((section) => section.name === 'card')
    .flatMap((section) => section.lines)
    .join('\n')
    .trim();
}

export function replaceCalloutCardCss(value: string, cardCss: string): string | null {
  const sections = parseSections(value);
  if (!sections) return null;
  const other = sections.filter((section) => section.name !== 'card');
  const output: string[] = [];
  if (cardCss.trim()) output.push('[card]', cardCss.trim());
  for (const section of other) {
    const body = section.lines.join('\n').trim();
    output.push(`[${section.name}]`);
    if (body) output.push(body);
  }
  return output.join('\n').trim();
}
