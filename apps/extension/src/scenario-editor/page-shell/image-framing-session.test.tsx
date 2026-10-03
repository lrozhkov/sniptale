// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../features/scenario/project/public';
import { useGuideImageFramingSession } from './image-framing-session';
const image = createGuideImageBlock({
  id: 'image',
  assetId: 'asset',
  width: 800,
  height: 600,
  source: { kind: 'import', filename: 'image.png' },
});
let project = createGuideProject('Guide', 'guide');
let root: Root;
let host: HTMLDivElement;
let session: ReturnType<typeof useGuideImageFramingSession>;
const update = vi.fn();
function Harness() {
  session = useGuideImageFramingSession(project, update);
  return null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  project = createGuideProject('Guide', 'guide');
  const step = createGuideStep('Step', 'step');
  step.blocks = [image];
  project.items = [step];
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('commits a same-tick final draft once and makes repeated Done and no-op Done harmless', async () => {
  await act(async () => session.begin('step', image));
  await act(async () => {
    session.session!.change({ ...image, contentTransform: { x: 0.1, y: 0.2, scale: 2 } });
    session.commit();
    session.commit();
  });
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0]?.[0].items[0].blocks[0].contentTransform.scale).toBe(2);
  update.mockClear();
  await act(async () => session.begin('step', image));
  await act(async () => session.commit());
  expect(update).not.toHaveBeenCalled();
});
it('discards cancelled work and rejects an externally replaced image', async () => {
  await act(async () => session.begin('step', image));
  await act(async () =>
    session.session!.change({ ...image, contentTransform: { x: 0, y: 0, scale: 2 } })
  );
  await act(async () => {
    session.cancel();
    session.commit();
  });
  expect(update).not.toHaveBeenCalled();
  await act(async () => session.begin('step', image));
  const item = project.items[0]!;
  if (item.kind !== 'step') throw new Error('Missing step');
  project = { ...project, items: [{ ...item, blocks: [{ ...image, assetId: 'replacement' }] }] };
  await act(async () => root.render(<Harness />));
  expect(session.session).toBeNull();
  await act(async () => session.commit());
  expect(update).not.toHaveBeenCalled();
});
