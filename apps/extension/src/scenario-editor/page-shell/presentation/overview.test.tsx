// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createScenarioSlide } from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import { ScenarioOverviewSurface } from './overview';

it('renders fallback transition badges in the overview', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const slide = {
    ...createScenarioSlide({ title: 'Overview' }),
    backgroundTransition: null,
    transition: null,
  };
  const detailedSlide = createScenarioSlide({ notes: 'Notes', title: 'Detailed' });

  act(() => {
    root.render(
      <ScenarioOverviewSurface
        onExit={vi.fn()}
        onSelectSlide={vi.fn()}
        selectedSlideId={slide.id}
        slides={[slide, detailedSlide]}
      />
    );
  });

  const transitionNone = translate('scenario.editor.transitionNone');
  expect(host.textContent?.split(transitionNone)).toHaveLength(3);
  expect(host.textContent).toContain('Notes');

  act(() => {
    root.render(
      <ScenarioOverviewSurface
        assets={new Map()}
        onExit={vi.fn()}
        onSelectSlide={vi.fn()}
        selectedSlideId={detailedSlide.id}
        slides={[slide, detailedSlide]}
      />
    );
  });

  act(() => root.unmount());
});
