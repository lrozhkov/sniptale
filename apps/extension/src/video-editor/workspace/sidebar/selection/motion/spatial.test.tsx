// @vitest-environment jsdom
import { act, useCallback, useState, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_CAMERA_PERSPECTIVE,
  DEFAULT_CAMERA_DEPTH,
} from '../../../../../features/video/project/motion/spatial';
import { translate } from '../../../../../platform/i18n';
import type { VideoEditorMotionPreview } from '../../../../contracts/workspace';
import { presentWorkspaceMotionPreview } from '../../../../runtime/controller/workspace-state';
import {
  MotionPerspectiveFields,
  MotionDepthFields,
  MotionSpatialReferenceFields,
} from './spatial';
import { createMotionPanelProps } from './test-support';

let root: Root;
let host: HTMLDivElement;
const commit = vi.fn();
const observe = vi.fn();
const label = (key: Parameters<typeof translate>[0]) => translate(key);
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  commit.mockReset();
  observe.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

type Fields = ComponentType<Parameters<typeof MotionPerspectiveFields>[0]>;
async function renderFields(
  Fields: Fields,
  props = createMotionPanelProps({
    perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateY: 20 },
  })
) {
  const accepted = props.project;
  function Harness() {
    const [preview, setPreview] = useState<VideoEditorMotionPreview | null>(null);
    const previewDraft = useCallback((draft: VideoEditorMotionPreview | null) => {
      observe(draft);
      setPreview(draft);
    }, []);
    const panel = {
      ...props,
      typingProject: accepted,
      project: presentWorkspaceMotionPreview(accepted, props.selection, preview),
      onPreviewMotion: previewDraft,
      onUpdateMotionRegion: commit,
    };
    return <Fields panel={panel} motionRegion={props.selectedMotionRegion!} />;
  }
  await act(async () => root.render(<Harness />));
  return props;
}
function range(index = 1) {
  return host.querySelectorAll<HTMLInputElement>('input[type="range"]')[index]!;
}
function key(type: string, value: string, index = 1) {
  act(() => range(index).dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true })));
}
it('previews a scalar against accepted data, cancels Escape, and commits the next gesture once', async () => {
  const props = await renderFields(MotionPerspectiveFields);
  key('keydown', 'ArrowRight');
  expect(observe.mock.lastCall?.[0]).toMatchObject({
    project: props.project,
    regionId: props.selectedMotionRegion!.id,
    edit: { kind: 'perspective', rotateY: 20.1 },
  });
  expect(props.project.motionRegions?.[0]?.perspective?.rotateY).toBe(20);
  expect(commit).not.toHaveBeenCalled();
  key('keydown', 'Escape');
  key('keyup', 'ArrowRight');
  expect(observe.mock.lastCall?.[0]).toBeNull();
  expect(commit).not.toHaveBeenCalled();
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(commit).toHaveBeenCalledExactlyOnceWith(props.selectedMotionRegion!.id, {
    spatialEdit: { kind: 'perspective', rotateY: 20.1 },
  });
});
it('clears an unaccepted draft when its fields unmount', async () => {
  await renderFields(MotionPerspectiveFields);
  key('keydown', 'ArrowRight');
  expect(observe.mock.lastCall?.[0]).not.toBeNull();
  await act(async () => root.render(<div />));
  expect(commit).not.toHaveBeenCalled();
  expect(observe.mock.lastCall?.[0]).toBeNull();
});
it('cancels pointer loss without applying a command', async () => {
  await renderFields(MotionPerspectiveFields);
  act(() => range().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  key('keydown', 'ArrowRight');
  act(() => range().dispatchEvent(new MouseEvent('pointercancel', { bubbles: true })));
  key('keyup', 'ArrowRight');
  expect(commit).not.toHaveBeenCalled();
  expect(observe.mock.lastCall?.[0]).toBeNull();
});
it('retains disabled perspective values with scalar enable and reset commands', async () => {
  const props = await renderFields(
    MotionPerspectiveFields,
    createMotionPanelProps({
      perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: false, rotateY: 35 },
    })
  );
  const values = [...host.querySelectorAll<HTMLInputElement>('input[type="text"]')];
  expect(values).toHaveLength(4);
  expect(values.every((input) => input.disabled)).toBe(true);
  expect(values[1]!.value).toBe('35');
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(commit).toHaveBeenLastCalledWith(props.selectedMotionRegion!.id, {
    spatialEdit: { kind: 'perspective', enabled: true },
  });
  const reset = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === label('gallery.videoReview.spatialReset')
  )!;
  act(() => reset.click());
  expect(commit).toHaveBeenLastCalledWith(props.selectedMotionRegion!.id, {
    spatialEdit: { kind: 'perspective', ...DEFAULT_CAMERA_PERSPECTIVE },
  });
});
it('uses a direct mode choice and scalar depth fields', async () => {
  const props = await renderFields(
    MotionDepthFields,
    createMotionPanelProps({ depthOfField: { ...DEFAULT_CAMERA_DEPTH, enabled: true } })
  );
  const area = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === label('gallery.videoReview.depthModeArea')
  )!;
  act(() => area.click());
  expect(commit).toHaveBeenLastCalledWith(props.selectedMotionRegion!.id, {
    spatialEdit: { kind: 'depth', mode: 'area' },
  });
  key('keydown', 'ArrowRight', 0);
  key('keyup', 'ArrowRight', 0);
  expect(commit).toHaveBeenLastCalledWith(props.selectedMotionRegion!.id, {
    spatialEdit: { kind: 'depth', strength: (DEFAULT_CAMERA_DEPTH.strength * 100 + 0.1) / 100 },
  });
});
it('constrains reference edges and resets only the independent spatial reference', async () => {
  const props = await renderFields(
    MotionSpatialReferenceFields,
    createMotionPanelProps({ spatialReference: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 } })
  );
  const inputs = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  expect(inputs.map((input) => Number(input.max))).toEqual([40, 30.000000000000004, 90, 80]);
  const reset = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === label('videoEditor.sidebar.spatialReferenceReset')
  )!;
  act(() => reset.click());
  expect(commit).toHaveBeenCalledExactlyOnceWith(props.selectedMotionRegion!.id, {
    spatialEdit: { kind: 'reference', reset: true },
  });
});
