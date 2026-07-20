export function determineCellTypeFromDOM(
  cell: HTMLElement
): 'string' | 'link' | 'number' | 'boolean' | 'image' | 'status' {
  if (cell.querySelector('.colorCircle, .stateColWithTitleView, .catItemCircleAndTitle')) {
    return 'status';
  }

  const img = cell.querySelector('img');
  if (img) {
    const text = cell.textContent?.trim() || '';
    if (!text || text.length < 2) {
      return 'image';
    }
  }

  if (cell.querySelector('a') || cell.tagName === 'A') {
    return 'link';
  }

  const text = cell.textContent?.trim() || '';
  if (/^\d+$/.test(text)) {
    return 'number';
  }

  if (/^(да|нет|true|false|вкл|выкл)$/i.test(text)) {
    return 'boolean';
  }

  return 'string';
}

export function isTechnicalCell(cell: HTMLElement): { isTechnical: boolean; type: string } {
  const checkbox = cell.querySelector('input[type="checkbox"]');
  if (checkbox) {
    return { isTechnical: true, type: 'select-box' };
  }

  const img = cell.querySelector('img');
  if (img) {
    const text = cell.textContent?.trim() || '';
    if (text.length < 3) {
      return { isTechnical: true, type: 'icon' };
    }
  }

  const text = cell.textContent?.trim() || '';
  if (!text && !cell.querySelector('a')) {
    return { isTechnical: true, type: 'empty' };
  }

  return { isTechnical: false, type: 'data' };
}
