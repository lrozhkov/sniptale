// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { useVideoEditorStore } from '../../../state/store';
import { InspectorNumericHistoryProvider } from '../selection/shared/numeric-history';
import { GridSettingsPanel } from '.';

it('keeps Grid preferences outside the project transaction', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    const project = createEmptyVideoProject('Grid');
    useVideoEditorStore.getState().setProject(project);
    const before = useVideoEditorStore.getState().project;
    const begin = vi.fn(useVideoEditorStore.getState().beginProjectHistoryTransaction);
    useVideoEditorStore.setState({ beginProjectHistoryTransaction: begin });
    const size = vi.fn();
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <GridSettingsPanel
            grid={{
              enabled: true,
              snapEnabled: true,
              size: 40,
              color: '#ffffff',
              onSetSize: size,
              onSetColor: vi.fn(),
              onSetEnabled: vi.fn(),
              onSetSnapEnabled: vi.fn(),
            }}
            recentColors={[]}
            onRememberRecentColor={async () => undefined}
          />
        </InspectorNumericHistoryProvider>
      )
    );
    const button = host.querySelector<HTMLButtonElement>('[aria-label$=" increase"]')!;
    act(() =>
      button.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
      )
    );
    for (const elapsed of [220, 70, 70])
      await act(async () => vi.advanceTimersByTimeAsync(elapsed));
    act(() => button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })));
    expect(size).toHaveBeenCalled();
    expect(begin).not.toHaveBeenCalled();
    expect(useVideoEditorStore.getState().project).toBe(before);
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  } finally {
    act(() => root.unmount());
    host.remove();
    useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
