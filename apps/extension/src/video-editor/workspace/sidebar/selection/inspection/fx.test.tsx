// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { InspectFxPanel } from './fx';
import { createProjectWithEffects } from '../../../../project/state/effects.effect-instance.test-support';
import { useVideoEditorStore } from '../../../../state/store';
import { translate } from '../../../../../platform/i18n';

it.each(['scene-a', 'scene-b'] as const)(
  'offers instance enable and actions for the selected scene annotation %s',
  (instanceId) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const initial = useVideoEditorStore.getState();
    const project = createProjectWithEffects();
    const fx = project.effectInstances!.find((item) => item.id === instanceId)!;
    const snapshot = project.effectSnapshots![0]!;
    const source = JSON.stringify({
      format: 'sniptale-animation',
      version: 1,
      id: snapshot.documentId,
      label: { en: 'Inspector proof' },
      resources: [],
      controls: [{ id: 'accent', kind: 'number', min: 0, max: 2, defaultValue: 1 }],
      bindings: [],
      animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 0, op: 60, layers: [], assets: [] },
    });
    snapshot.source = source;
    snapshot.sha256 = createHash('sha256').update(source).digest('hex');
    snapshot.retainedByteLength = new TextEncoder().encode(source).byteLength;
    useVideoEditorStore.getState().setProject(project);
    const element = document.createElement('div');
    const root = createRoot(element);
    try {
      act(() => root.render(<InspectFxPanel project={project} instanceId={fx.id} />));
      expect(element.querySelector('[role="alert"]')).toBeNull();
      const control = element.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('videoEditor.effectsLibrary.controlEnabled')}"]`
      );
      expect(control).not.toBeNull();
      expect(control!.getAttribute('aria-pressed')).toBe('true');
      for (const key of ['duplicateInstance', 'exportInstance'] as const)
        expect(
          element.querySelector(`[aria-label="${translate(`videoEditor.effectsLibrary.${key}`)}"]`)
        ).not.toBeNull();
      expect(
        element.querySelector(
          `[aria-label="${translate('videoEditor.effectsLibrary.bypassOwner')}"]`
        )
      ).toBeNull();
      act(() => control!.click());
      const changed = useVideoEditorStore.getState().project!;
      expect(changed.effectInstances!.find((item) => item.id === fx.id)!.enabled).toBe(false);
      expect(changed.effectInstances!.find((item) => item.id !== fx.id)!.enabled).toBe(true);
      act(() => root.render(<InspectFxPanel project={project} instanceId="missing" />));
      expect(element.textContent).toBe('');
    } finally {
      act(() => root.unmount());
      useVideoEditorStore.setState(initial, true);
      vi.unstubAllGlobals();
    }
  }
);
