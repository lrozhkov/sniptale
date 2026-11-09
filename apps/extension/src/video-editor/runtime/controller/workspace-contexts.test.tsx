// @vitest-environment jsdom
import { act, createContext, memo, useContext, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorWorkspaceState, type VideoEditorWorkspaceState } from './workspace-state';
import { useVideoEditorPlaybackPort } from './store';
import { useVideoEditorStore } from '../../state/store';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES } from '../../../composition/persistence/video-editor-preview-preferences';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('../../../composition/persistence/video-editor-preview-preferences', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/video-editor-preview-preferences')
  >()),
  loadVideoEditorPreviewPreferences: mocks.load,
  saveVideoEditorPreviewPreferences: mocks.save,
}));
vi.mock('../../../composition/persistence/recent-colors', () => ({
  loadRecentColors: async () => [],
  pushRecentColor: async (color: string) => [color],
}));

const Grid = createContext<VideoEditorWorkspaceState['grid'] | null>(null);
const Preview = createContext<VideoEditorWorkspaceState['preview'] | null>(null);
const GridConsumer = memo(function GridConsumer() {
  const grid = useContext(Grid);
  const renders = useRef(0);
  renders.current++;
  if (!grid) throw new Error('Missing grid context');
  return (
    <div>
      <output data-grid data-renders={renders.current}>
        {`${grid.magnetEnabled}:${grid.gridPopoverOpen}:${grid.workspacePopoverOpen}`}
      </output>
      <button data-magnet onClick={grid.toggleMagnet} />
    </div>
  );
});
const PreviewConsumer = memo(function PreviewConsumer() {
  const preview = useContext(Preview);
  const renders = useRef(0);
  renders.current++;
  if (!preview) throw new Error('Missing preview context');
  return (
    <div>
      <output data-preview data-renders={renders.current}>
        {String(preview.preferences.preferences.showFrameRate)}
      </output>
      <button
        data-preference
        onClick={() =>
          preview.preferences.updatePreferences({
            showFrameRate: !preview.preferences.preferences.showFrameRate,
          })
        }
      />
    </div>
  );
});
let latest: VideoEditorWorkspaceState;
function ClockOwner() {
  const currentTime = useVideoEditorPlaybackPort((port) => port.currentTime);
  const state = useVideoEditorWorkspaceState();
  latest = state;
  return (
    <div ref={state.preview.workspaceSplitRef}>
      <output data-clock>{currentTime}</output>
      <Grid.Provider value={state.grid}>
        <Preview.Provider value={state.preview}>
          <GridConsumer />
          <PreviewConsumer />
        </Preview.Provider>
      </Grid.Provider>
    </div>
  );
}
let container: HTMLDivElement;
let root: Root;
function renders(selector: string) {
  const node = container.querySelector(selector);
  if (!node) throw new Error('Missing context consumer');
  return Number(node.getAttribute('data-renders'));
}
function click(selector: string) {
  const node = container.querySelector<HTMLButtonElement>(selector);
  if (!node) throw new Error('Missing context control');
  node.click();
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.load.mockResolvedValue({
    invalidFieldCount: 0,
    preferences: DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES,
  });
  mocks.save.mockResolvedValue(undefined);
  useVideoEditorStore.setState({
    currentTime: 0,
    project: createVideoProjectFromRecording({
      recordingId: 'context-clock-source',
      filename: 'Context clock',
      width: 160,
      height: 90,
      duration: 2,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: false,
    }),
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('keeps actual workspace context consumers idle across playback clock updates', async () => {
  await act(async () => root.render(<ClockOwner />));
  const grid = renders('[data-grid]');
  const preview = renders('[data-preview]');
  for (let frame = 1; frame <= 8; frame++) {
    act(() => useVideoEditorStore.getState().setCurrentTime(frame / 30));
  }
  expect(container.querySelector('[data-clock]')?.textContent).toBe(String(8 / 30));
  expect(renders('[data-grid]')).toBe(grid);
  expect(renders('[data-preview]')).toBe(preview);
});

it('publishes real grid and preview changes without waking the other context', async () => {
  await act(async () => root.render(<ClockOwner />));
  const grid = renders('[data-grid]');
  const preview = renders('[data-preview]');
  act(() => click('[data-magnet]'));
  expect(container.querySelector('[data-grid]')?.textContent).toBe('false:false:false');
  expect(renders('[data-grid]')).toBe(grid + 1);
  expect(renders('[data-preview]')).toBe(preview);
  const changedGrid = renders('[data-grid]');
  await act(async () => click('[data-preference]'));
  expect(container.querySelector('[data-preview]')?.textContent).toBe(
    String(!DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES.showFrameRate)
  );
  expect(renders('[data-preview]')).toBe(preview + 1);
  expect(renders('[data-grid]')).toBe(changedGrid);
  act(() => latest.grid.toggleWorkspacePopover());
  act(() => latest.grid.toggleGridPopover());
  expect(container.querySelector('[data-grid]')?.textContent).toBe('false:true:false');
});
