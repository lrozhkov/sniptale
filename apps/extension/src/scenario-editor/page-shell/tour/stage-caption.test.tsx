// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createTourDocument } from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { TourStage } from './stage';

it('places the Slides control last in the editor footer', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <TourStage
          tour={createTourDocument()}
          images={{}}
          selection={null}
          t={createTranslator('en')}
          onSelectObject={vi.fn()}
          onMoveObject={vi.fn()}
          onNavigateSelection={vi.fn()}
        />
      )
    );
    const shadow = host.querySelector('.tour-stage-host')!.shadowRoot!;
    expect(
      shadow.querySelector('.tour-controls')!.lastElementChild?.hasAttribute('data-tour-contents')
    ).toBe(true);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
