import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const entrypoint = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('./spacing-compatibility.css', import.meta.url), 'utf8');

it('loads the video editor spacing compatibility owner after shared styles', () => {
  const sharedStylesIndex = entrypoint.lastIndexOf("import '@sniptale/ui/styles/overlays';");
  const compatibilityStylesIndex = entrypoint.indexOf(
    "import './styles/spacing-compatibility.css';"
  );

  expect(sharedStylesIndex).toBeGreaterThanOrEqual(0);
  expect(compatibilityStylesIndex).toBeGreaterThan(sharedStylesIndex);
});

it('restores the Tailwind v3 sibling-spacing side for every video editor stack size', () => {
  for (const [className, multiplier] of [
    ['space-y-1\\.5', '1.5'],
    ['space-y-2', '2'],
    ['space-y-2\\.5', '2.5'],
    ['space-y-3', '3'],
    ['space-y-4', '4'],
  ]) {
    expect(stylesheet).toContain(`.${className} {`);
    expect(stylesheet).toContain(
      `--sniptale-video-stack-space: calc(var(--spacing) * ${multiplier});`
    );
  }

  expect(stylesheet).toContain('> :not(:last-child) {');
  expect(stylesheet).toContain('margin-block-end: 0;');
  expect(stylesheet).toMatch(/>\s*:not\(\[hidden\]\)\s*~\s*:not\(\[hidden\]\)\s*\{/s);
  expect(stylesheet).toContain(
    'var(--sniptale-video-stack-space) * calc(1 - var(--tw-space-y-reverse))'
  );
});
