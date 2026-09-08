import { describe, expect, it } from 'vitest';

import { formatDuration, formatSize, getActionEventLabel } from './display';

describe('video editor chrome display formatters', () => {
  it('formats timeline durations and byte sizes for compact library metadata', () => {
    expect(formatDuration(65.2)).toBe('1:05.2');
    expect(formatSize(512)).toBe('1 KB');
  });
});

it('describes clicked controls instead of rendering an animation label', () => {
  const label = getActionEventLabel({
    kind: 'CLICK',
    label: 'CLICK_RIPPLE',
    data: { targetTag: 'button', targetName: 'Export', targetRole: 'button' },
  });
  expect(label).toContain('Export');
  expect(label).toContain('<button role="button">');
  expect(label).not.toContain('CLICK_RIPPLE');
  expect(getActionEventLabel({ kind: 'CLICK', label: 'CLICK_RIPPLE', data: {} })).not.toContain(
    'CLICK_RIPPLE'
  );
});
