// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { setup } from '../../../../project/state/insertion/material.test-support';
import { ClipOrderControls } from './clip-order';
import { translate } from '../../../../../platform/i18n';

it('exposes contextual neighbor actions and re-evaluates availability after the store transaction', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id, { start: 0, end: 4 });
  store.getState().appendMaterial(asset.id, { start: 4, end: 6 });
  const first = store.getState().project!.clips[0]!;
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = () =>
    root.render(
      <ClipOrderControls
        project={store.getState().project!}
        clipId={first.id}
        onSwapClip={store.getState().swapClip}
      />
    );
  try {
    await act(async () => render());
    const [left, right] = [...container.querySelectorAll('button')];
    expect(left?.disabled).toBe(true);
    expect(right?.disabled).toBe(false);
    expect(right?.parentElement?.title).toContain(asset.name);
    const description = right?.getAttribute('aria-describedby');
    expect(description).toBeTruthy();
    expect(container.querySelector(`[id="${description}"]`)?.textContent).toContain(asset.name);
    const blockedDescription = left?.getAttribute('aria-describedby');
    expect(blockedDescription).toBeTruthy();
    expect(container.querySelector(`[id="${blockedDescription}"]`)?.textContent).toContain(
      translate('videoEditor.app.clipSwapNoNeighbor')
    );
    act(() => right!.click());
    await act(async () => render());
    expect(store.getState().project!.clips[0]?.startTime).toBe(2);
    expect(container.querySelectorAll('button')[0]?.disabled).toBe(false);
    expect(container.querySelectorAll('button')[1]?.disabled).toBe(true);
    const project = store.getState().project!;
    store.setState({
      project: { ...project, tracks: project.tracks.map((track) => ({ ...track, locked: true })) },
    });
    await act(async () => render());
    expect([...container.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    expect(container.textContent).toContain(translate('videoEditor.app.clipSwapLocked'));
    const history = store.getState().projectHistory;
    act(() => container.querySelectorAll('button')[0]!.click());
    expect(store.getState().projectHistory).toBe(history);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
