const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function fittingGraphemes(
  units: readonly string[],
  offset: number,
  width: number,
  measure: (text: string) => number
) {
  // Bound the search by the next line rather than measuring prefixes of the full suffix.
  let low = 1;
  let high = Math.min(2, units.length - offset);
  while (low < high && measure(units.slice(offset, offset + high).join('')) <= width) {
    low = high;
    high = Math.min(high * 2, units.length - offset);
  }
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (measure(units.slice(offset, offset + middle).join('')) <= width) low = middle;
    else high = middle;
  }
  return low;
}

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
        const count = fittingGraphemes(units, offset, width, measure);
        const part = units.slice(offset, offset + count).join('');
        offset += count;
        if (offset < units.length) lines.push(part);
        else line = part;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
