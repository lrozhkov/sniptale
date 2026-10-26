import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { createQuickActionAppearance } from '../../contracts/quick-action-appearance';
import {
  quickActionAppearanceGeometry,
  quickActionInformationLines,
  resolveQuickActionHeader,
} from './appearance';

describe('quick-action appearance resolution', () => {
  it('omits missing page values and preserves explicit static text', () => {
    const appearance = createQuickActionAppearance();
    appearance.header = { ...DEFAULT_WINDOW_HEADER, title: 'Static', url: 'example.com' };
    expect(resolveQuickActionHeader(appearance, { date: 'Today' })).toMatchObject({
      title: '',
      url: '',
    });
    appearance.titleSource = 'static';
    appearance.addressSource = 'static';
    expect(resolveQuickActionHeader(appearance, { date: 'Today' })).toMatchObject({
      title: 'Static',
      url: 'example.com',
    });
  });
  it('builds only selected available information and positions it outside source pixels', () => {
    const appearance = createQuickActionAppearance();
    appearance.information = {
      ...appearance.information,
      enabled: true,
      date: true,
      dimensions: true,
      text: 'Caption',
    };
    const source = { width: 1280, height: 560 };
    const lines = quickActionInformationLines(appearance, source, { date: 'Today' });
    expect(lines).toEqual(['Today', '1280 × 560', 'Caption']);
    const below = quickActionAppearanceGeometry(appearance, source, lines.length);
    expect(below.informationY).toBeGreaterThanOrEqual(source.height);
    appearance.information.position = 'above';
    expect(quickActionAppearanceGeometry(appearance, source, lines.length).sourceY).toBe(
      below.informationHeight
    );
  });
  it('refuses excessive dimensions and working sets before canvas allocation', () => {
    const appearance = createQuickActionAppearance();
    expect(() => quickActionAppearanceGeometry(appearance, { width: 32769, height: 1 }, 0)).toThrow(
      'limits'
    );
    expect(() =>
      quickActionAppearanceGeometry(appearance, { width: 10000, height: 10000 }, 0)
    ).toThrow('limits');
    expect(() =>
      quickActionAppearanceGeometry(appearance, { width: 1280, height: 560 }, 6)
    ).toThrow('limits');
  });
});

it('does not split a Unicode pair when bounding a page title for the header contract', () => {
  const appearance = createQuickActionAppearance();
  appearance.header = { ...DEFAULT_WINDOW_HEADER };
  expect(
    resolveQuickActionHeader(appearance, { date: 'Today', title: 'a'.repeat(511) + '😀' })?.title
  ).toBe('a'.repeat(511));
});
