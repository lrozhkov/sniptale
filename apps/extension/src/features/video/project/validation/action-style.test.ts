import { expect, it } from 'vitest';
import { getActionClickStyle, getActionKeyStyle } from '../action-style';
import { isVideoProjectActionPresentationOverride } from './interaction';

it('validates visual styles at the persistence boundary', () => {
  const clickStyle = getActionClickStyle();
  const keyStyle = getActionKeyStyle();
  expect(
    isVideoProjectActionPresentationOverride({ clickStyle, keyStyle, easing: 'EASE_OUT' })
  ).toBe(true);
  for (const patch of [
    { size: NaN },
    { size: 0 },
    { opacity: 2 },
    { strokeWidth: -1 },
    { color: 'not a color' },
  ]) {
    expect(
      isVideoProjectActionPresentationOverride({ clickStyle: { ...clickStyle, ...patch } })
    ).toBe(false);
  }
  for (const patch of [
    { fontSize: Infinity },
    { fontFamily: 'url(bad)' },
    { position: 'anywhere' },
    { entrance: 'bounce' },
    { margin: -1 },
    { background: 'var(--host)' },
  ]) {
    expect(isVideoProjectActionPresentationOverride({ keyStyle: { ...keyStyle, ...patch } })).toBe(
      false
    );
  }
});
