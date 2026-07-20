import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TablerColorIcon, TypeOutlineColorIcon } from './color-icon';

it('renders color status as a bottom underline under the neutral glyph', () => {
  const palette = renderToStaticMarkup(
    <TablerColorIcon color="#ff6600" icon="tabler:palette" opacity={0.4} />
  );
  const bucket = renderToStaticMarkup(
    <TablerColorIcon color="#00aa55" icon="tabler:bucket-off" opacity={0} />
  );
  const text = renderToStaticMarkup(<TypeOutlineColorIcon color="#3355ff" opacity={0.8} />);

  expect(palette).toContain('data-color-icon-underline=""');
  expect(palette).toContain('top-[calc(100%+2px)]');
  expect(palette).toContain('--editor-tabler-color-icon-color:#ff6600');
  expect(palette).toContain('opacity:0.4');
  expect(palette).not.toContain('tabler:circle-filled');
  expect(palette).not.toContain('--editor-tabler-color-icon-glyph-color');
  expect(bucket).not.toContain('data-color-icon-underline=""');
  expect(text).toContain('data-color-icon-underline=""');
  expect(text).toContain('stroke-width="2"');
});

it('keeps the glyph neutral for gray colors and hides the underline when requested', () => {
  const gray = renderToStaticMarkup(<TablerColorIcon color="#d1d5db" icon="tabler:palette" />);
  const hidden = renderToStaticMarkup(
    <TypeOutlineColorIcon color="#374151" showUnderline={false} />
  );

  expect(gray).toContain('text-[color:var(--sniptale-color-text-secondary)]');
  expect(gray).not.toContain('--editor-tabler-color-icon-glyph-color');
  expect(hidden).not.toContain('data-color-icon-underline=""');
});

it('shows the underline for white black and gray but hides transparent colors', () => {
  const white = renderToStaticMarkup(<TablerColorIcon color="#ffffff" icon="tabler:bucket" />);
  const black = renderToStaticMarkup(<TablerColorIcon color="#000000" icon="tabler:palette" />);
  const gray = renderToStaticMarkup(<TypeOutlineColorIcon color="#6b7280" />);
  const transparent = renderToStaticMarkup(
    <TablerColorIcon color="transparent" icon="tabler:bucket-off" />
  );

  expect(white).toContain('--editor-tabler-color-icon-color:#ffffff');
  expect(white).toContain('data-color-icon-underline=""');
  expect(black).toContain('--editor-tabler-color-icon-color:#000000');
  expect(black).toContain('data-color-icon-underline=""');
  expect(gray).toContain('--editor-tabler-color-icon-color:#6b7280');
  expect(gray).toContain('data-color-icon-underline=""');
  expect(transparent).not.toContain('data-color-icon-underline=""');
});
