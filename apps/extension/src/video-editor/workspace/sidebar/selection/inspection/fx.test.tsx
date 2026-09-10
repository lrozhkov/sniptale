// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { InspectFxPanel } from './fx';
import { createProjectWithEffects } from '../../../../project/state/effects.effect-instance.test-support';
import { useVideoEditorStore } from '../../../../state/store';
import { translate } from '../../../../../platform/i18n';

it.each(['track', 'video-group'] as const)(
  'offers %s range and bypass in the selected FX inspector',
  (kind) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const initial = useVideoEditorStore.getState();
    const project = createProjectWithEffects();
    const fx = project.effectInstances!.find((item) => item.id === 'clip')!;
    fx.rangeMode = 'owner';
    fx.target = kind === 'track' ? { kind, trackId: project.tracks[0]!.id } : { kind };
    useVideoEditorStore.getState().setProject(project);
    const element = document.createElement('div');
    const root = createRoot(element);
    try {
      act(() => root.render(<InspectFxPanel project={project} instanceId={fx.id} />));
      expect(element.textContent).toContain(translate('videoEditor.effectsLibrary.fxScope'));
      expect(element.textContent).toContain(
        translate(
          kind === 'track'
            ? 'videoEditor.effectsLibrary.wholeTrack'
            : 'videoEditor.effectsLibrary.wholeVideo'
        )
      );
      const control = element.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('videoEditor.effectsLibrary.bypassOwner')}"]`
      );
      expect(control).not.toBeNull();
      act(() => control!.click());
      const changed = useVideoEditorStore.getState().project!;
      expect(
        kind === 'track' ? changed.tracks[0]!.effectsBypassed : changed.videoEffectsBypassed
      ).toBe(true);
      act(() => root.render(<InspectFxPanel project={project} instanceId="missing" />));
      expect(element.textContent).toBe('');
    } finally {
      act(() => root.unmount());
      useVideoEditorStore.setState(initial, true);
      vi.unstubAllGlobals();
    }
  }
);
