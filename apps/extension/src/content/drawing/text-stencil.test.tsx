// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DrawingTextBackgrounds } from './text-content';
import { measureContentDrawingTextLayout } from './text-measurement';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function setup(color = 'transparent') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const layout = measureContentDrawingTextLayout({
    text: 'First\nNext',
    fontFamily: 'sans',
    fontSize: 24,
    wrapWidth: 160,
  });
  act(() =>
    root.render(
      <div style={{ transform: 'rotate(10deg)' }}>
        <DrawingTextBackgrounds
          color="#ff880080"
          rects={layout.backgrounds}
          text={{ color, layout, fontFamily: 'sans', fontSize: 24 }}
        />
      </div>
    )
  );
  return { host, layout, cleanup: () => act(() => root.unmount()) };
}
it('cuts glyphs through only their own background on the shared baseline grid', () => {
  const fixture = setup();
  try {
    const mask = fixture.host.querySelector('mask')!;
    expect(mask).not.toBeNull();
    const lines = Array.from(mask.querySelectorAll('text'));
    expect(lines.map((line) => line.textContent)).toEqual(fixture.layout.lines);
    expect(lines[0]?.getAttribute('x')).toBe(String(fixture.layout.originX));
    expect(lines[0]?.getAttribute('y')).toBe(String(fixture.layout.firstBaseline));
    expect(lines[1]?.getAttribute('y')).toBe(
      String(fixture.layout.firstBaseline + fixture.layout.lineHeight)
    );
    expect(
      fixture.host
        .querySelector('[data-ui="content.drawing.text-background"]')
        ?.getAttribute('mask')
    ).toBe(`url(#${mask.id})`);
    expect(lines.every((line) => line.getAttribute('fill') === '#000000')).toBe(true);
    expect(fixture.host.firstElementChild?.getAttribute('style')).toContain('rotate(10deg)');
  } finally {
    fixture.cleanup();
  }
});
it.each(['#111111', '#11111180'])('keeps normal text paint without a cutout for %s', (color) => {
  const fixture = setup(color);
  try {
    expect(fixture.host.querySelector('mask')).toBeNull();
  } finally {
    fixture.cleanup();
  }
});
it('keeps independent masks for separate objects', () => {
  const first = setup();
  const second = setup();
  try {
    expect(first.host.querySelector('mask')?.id).not.toBe(second.host.querySelector('mask')?.id);
  } finally {
    first.cleanup();
    second.cleanup();
  }
});
