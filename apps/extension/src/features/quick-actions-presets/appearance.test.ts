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

it('keeps multiple information fields in one row inside the framed image width', () => {
  const appearance = createQuickActionAppearance();
  appearance.background.kind = 'paint';
  appearance.information.enabled = true;
  const source = { width: 1280, height: 560 };
  const single = quickActionAppearanceGeometry(appearance, source, 1);
  const multiple = quickActionAppearanceGeometry(appearance, source, 5);
  expect(multiple.informationHeight).toBe(single.informationHeight);
  expect(multiple.height).toBe(single.height);
});

it('keeps the full caption line box within the rounded card at the maximum radius', () => {
  const appearance = createQuickActionAppearance();
  appearance.background.kind = 'paint';
  appearance.background.radius = 256;
  appearance.information.enabled = true;
  const layout = quickActionAppearanceGeometry(appearance, { width: 1280, height: 560 }, 5);
  expect(layout.informationInset).toBe(193);
  for (const y of [layout.informationY, layout.informationY + layout.lineHeight]) {
    const bottom = layout.padding + layout.frameHeight;
    const circleY = bottom - layout.frameRadius;
    const boundary = layout.frameRadius - Math.sqrt(layout.frameRadius ** 2 - (y - circleY) ** 2);
    expect(layout.informationInset).toBeGreaterThan(boundary);
  }
});
