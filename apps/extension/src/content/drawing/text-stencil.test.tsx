// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DrawingTextBackgrounds } from './text-content';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(color = 'transparent') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const contentRef = useRef<HTMLSpanElement>(null);
    return (
      <div style={{ transform: 'rotate(10deg)' }}>
        <span ref={contentRef}>{'First\nNext'}</span>
        <DrawingTextBackgrounds
          color="#ff880080"
          rects={[
            { left: 0, top: 2, width: 100, height: 30 },
            { left: 0, top: 32, width: 60, height: 30 },
          ]}
          text={{ color, contentRef, value: 'First\nNext', fontFamily: 'sans', fontSize: 24 }}
        />
      </div>
    );
  }
  act(() => root.render(<Harness />));
  return { host, cleanup: () => act(() => root.unmount()) };
}

it('cuts transparent glyphs through only the background using a local SVG mask', () => {
  const fixture = setup();
  try {
    const mask = fixture.host.querySelector('mask');
    expect(mask).not.toBeNull();
    expect(mask?.querySelector('text')?.style.fontFamily).toContain('Sniptale Text');
    expect(mask?.querySelector('text')?.style.fontSize).toBe('24px');
    expect(
      fixture.host
        .querySelector('[data-ui="content.drawing.text-background"]')
        ?.getAttribute('mask')
    ).toBe(`url(#${mask?.id})`);
    expect(Array.from(mask!.querySelectorAll('text')).map((node) => node.textContent)).toEqual([
      'First',
      'Next',
    ]);
    expect(
      Array.from(mask!.querySelectorAll('text')).every(
        (node) => node.getAttribute('fill') === '#000000'
      )
    ).toBe(true);
    expect(fixture.host.firstElementChild?.getAttribute('style')).toContain('rotate(10deg)');
  } finally {
    fixture.cleanup();
  }
});

it.each(['#111111', '#11111180'])(
  'keeps normal text paint without a stencil mask for %s',
  (color) => {
    const fixture = setup(color);
    try {
      expect(fixture.host.querySelector('mask')).toBeNull();
    } finally {
      fixture.cleanup();
    }
  }
);

it('uses measured visual lines and gives each text object an independent mask', () => {
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = createRange();
    Object.assign(range, {
      getClientRects: () => [
        {
          top: range.startOffset < 3 ? 2 : 32,
          left: 6 + (range.startOffset % 3) * 10,
          height: 24,
        },
      ],
    });
    return range;
  });
  const first = setup();
  const second = setup();
  try {
    const mask = first.host.querySelector('mask')!;
    expect(Array.from(mask.querySelectorAll('text')).map((line) => line.textContent)).toEqual([
      'Fir',
      'stNext',
    ]);
    expect(mask.id).not.toBe(second.host.querySelector('mask')?.id);
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

it('uses the DOM baseline and removes its temporary measuring probe', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.style.fontSize === '0px' ? new DOMRect(0, 55.5, 0, 0) : new DOMRect(0, 30, 100, 60);
  });
  const fixture = setup();
  try {
    const lines = fixture.host.querySelectorAll('mask text');
    expect(lines[0]?.getAttribute('y')).toBe('25.5');
    expect(lines[1]?.getAttribute('y')).toBe('55.5');
    expect(fixture.host.querySelector('div > span')?.childNodes).toHaveLength(1);
  } finally {
    fixture.cleanup();
  }
});
