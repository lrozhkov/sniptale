// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { HighlighterPresetRowContent } from './preset-row-content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderRow(
  preset: React.ComponentProps<typeof HighlighterPresetRowContent>['preset']
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterPresetRowContent preset={preset} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('HighlighterPresetRowContent', () => {
  it('renders translated style and radius copy for every preset style summary', async () => {
    const cases = [
      { name: 'Solid', style: 'solid' as const, styleKey: 'highlighter.editor.styleSolid' },
      { name: 'Dashed', style: 'dashed' as const, styleKey: 'highlighter.editor.styleDashed' },
      { name: 'Dotted', style: 'dotted' as const, styleKey: 'highlighter.editor.styleDotted' },
    ];

    for (const item of cases) {
      await renderRow({
        id: `preset-${item.style}`,
        name: item.name,
        isSystemDefault: false,
        order: 0,
        width: 5,
        color: '#ff6600',
        style: item.style,
        radius: 9,
        padding: { top: 1, right: 2, bottom: 3, left: 4 },
        shadow: 30,
        opacity: 80,
        customCss: '',
        fillColor: '#00000000',
        fillOpacity: 0,
        inheritCustomCss: false,
        strokeOpacity: 100,
      });

      expect(container?.textContent).toContain(item.name);
      expect(container?.textContent).toContain(
        `5highlighter.section.unitPxSuffix, ${item.styleKey}, 9highlighter.section.unitPxSuffix`
      );
      expect(container?.textContent).toContain('highlighter.section.radiusSuffix');
    }
  });
});
