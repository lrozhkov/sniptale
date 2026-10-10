const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Full text wrapping; long tokens break only between graphemes, never with ellipsis. */
export function wrapReviewCaptionText(
  text: string,
  width: number,
  measure: (text: string) => number
): string[] {
  if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid caption width.');
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/gu, '\n').split('\n')) {
    let line = '';
    for (const piece of paragraph.split(/(\s+)/u).filter(Boolean)) {
      if (!line && !piece.trim()) continue;
      if (measure(line + piece) <= width) {
        line += piece;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      if (!piece.trim()) continue;
      const units = Array.from(graphemes.segment(piece), (entry) => entry.segment);
      let offset = 0;
      while (offset < units.length) {
        let low = 1;
        let high = units.length - offset;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (measure(units.slice(offset, offset + middle).join('')) <= width) low = middle;
          else high = middle - 1;
        }
        const part = units.slice(offset, offset + low).join('');
        offset += low;
        if (offset < units.length) lines.push(part);
        else line = part;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
