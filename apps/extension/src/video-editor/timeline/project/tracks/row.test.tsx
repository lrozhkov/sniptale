// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { buildTimelineTrackLayoutModel } from './layout';
import { ProjectTimelineTrackRow } from './row';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

it('blurs track state icon buttons after pointer activation', () => {
  const project = createEmptyVideoProject('Track row');
  const trackLayout = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: {},
    tracks: project.tracks,
  }).layoutByTrackId.get(project.tracks[0]!.id);

  act(() => {
    root?.render(
      <ProjectTimelineTrackRow
        compactRows={false}
        isSelected={false}
        track={project.tracks[0]!}
        trackLabel="O1"
        trackLayout={trackLayout}
        onSelectTrack={vi.fn()}
        onToggleTrackLock={vi.fn()}
        onToggleTrackVisibility={vi.fn()}
      />
    );
  });

  const buttons = container?.querySelectorAll<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.icon-button"]'
  );
  const button = buttons?.[0];

  expect(buttons).toHaveLength(2);
  expect(buttons?.[0]?.className).toContain('!h-6');
  expect(buttons?.[0]?.getAttribute('data-active')).toBe('true');
  expect(buttons?.[1]?.getAttribute('data-active')).toBe('false');
  expect(
    container?.querySelector('[data-ui="video-editor.timeline.track-select"]')?.textContent
  ).toContain('O1');

  button?.focus();
  expect(document.activeElement).toBe(button);

  act(() => {
    button?.click();
  });

  expect(document.activeElement).not.toBe(button);
});
