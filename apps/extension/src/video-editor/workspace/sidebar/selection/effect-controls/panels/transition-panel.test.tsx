// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../../features/video/project/factories/creation';
import { createAudioClip } from '../../../../../../features/video/project/timeline/project-meta.test.helpers';
import { syncProjectTransitions } from '../../../../../../features/video/project/transition/project';
import { translate } from '../../../../../../platform/i18n';
import { InspectTransitionPanel } from './transition-panel';

it('offers audio timing and easing without visual templates or style controls', () => {
  const project = createEmptyVideoProject('Audio');
  project.clips = [
    createAudioClip({ id: 'a', trackId: project.tracks[0]!.id, startTime: 0, duration: 4 }),
    createAudioClip({ id: 'b', trackId: project.tracks[0]!.id, startTime: 3, duration: 4 }),
  ];
  const prepared = syncProjectTransitions(project);
  const update = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <InspectTransitionPanel
          project={prepared}
          selectedTransition={prepared.transitions![0]!}
          recentColors={[]}
          onRememberRecentColor={vi.fn()}
          onUpdateTransitionDuration={vi.fn()}
          onUpdateTransitionEasing={update}
          onUpdateTransitionTemplate={vi.fn()}
        />
      )
    );
    expect(container.textContent).toContain(translate('videoEditor.sidebar.transitionEasingLabel'));
    expect(container.textContent).not.toContain(
      translate('videoEditor.sidebar.transitionIntensityLabel')
    );
    expect(container.textContent).not.toContain(
      translate('videoEditor.sidebar.transitionDirectionLabel')
    );
    const buttons = [...container.querySelectorAll('button')];
    const eased = buttons.find(
      (button) => button.textContent === translate('videoEditor.sidebar.transitionEasingEaseInOut')
    );
    expect(eased).toBeDefined();
    act(() => eased!.click());
    expect(update).toHaveBeenCalledWith(prepared.transitions![0]!.id, 'EASE_IN_OUT');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
