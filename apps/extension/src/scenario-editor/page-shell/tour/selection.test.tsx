// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { useTourSelection } from './selection';

let root: Root;
let host: HTMLDivElement;
let selection: ReturnType<typeof useTourSelection> | null = null;
const changed = vi.fn<(project: GuideProject, group?: string | null) => void>();
function Probe({
  project,
  disabled,
  initialSlideId,
}: {
  project: GuideProject;
  disabled: boolean;
  initialSlideId?: string;
}) {
  selection = useTourSelection(project, disabled, changed, initialSlideId);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  changed.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  selection = null;
  vi.unstubAllGlobals();
});
function render(project: GuideProject, disabled = false) {
  act(() => root.render(<Probe project={project} disabled={disabled} />));
}
function state() {
  if (!selection) throw new Error('Missing selection');
  return selection;
}

it('adds an independent tour through one project change and keeps the guide intact', () => {
  const project = createGuideProject('Project');
  project.items = [createGuideStep('Keep this')];
  render(project);
  expect(changed).not.toHaveBeenCalled();
  act(() => state().add('image'));
  const next = changed.mock.calls[0]?.[0];
  expect(next?.items).toEqual(project.items);
  expect(project.tour).toBeUndefined();
  expect(next?.tour?.slides).toHaveLength(1);
  if (!next) throw new Error('Missing result');
  render(next);
  expect(state().slide?.id).toBe(next.tour?.slides[0]?.id);
  render(project);
  expect(state().slide).toBeNull();
});

it('keeps end selection distinct from an authored slide whose id is end', () => {
  const project = createGuideProject('Project');
  project.tour = createTourDocument();
  project.tour.slides = [createTourImageSlide('end')];
  render(project);
  act(() => state().select({ kind: 'slide', slideId: 'end', objectId: null }));
  expect(state().slide?.id).toBe('end');
  act(() => state().select({ kind: 'end' }));
  expect(state().slide).toBeNull();
  expect(state().selection?.kind).toBe('end');
  expect(changed).not.toHaveBeenCalled();
});

it('rejects edits while locked and media identities outside the accepted tour', () => {
  const project = createGuideProject('Project');
  project.tour = createTourDocument();
  project.tour.slides = [createTourImageSlide('first')];
  render(project, true);
  act(() => state().add('navigation'));
  expect(changed).not.toHaveBeenCalled();
  render(project);
  const slide = createTourImageSlide('first');
  slide.image = {
    assetId: 'foreign',
    galleryAssetId: null,
    editDocumentId: null,
    width: 10,
    height: 10,
    alt: '',
    source: { kind: 'import', filename: 'foreign.png' },
  };
  act(() => {
    expect(state().changeSlide(slide)).toBe(false);
  });
  expect(changed).not.toHaveBeenCalled();
  expect(state().failed).toBe(true);
});

it('returns to slide settings when the selected object is removed', () => {
  const project = createGuideProject('Project');
  const slide = createTourImageSlide('first');
  slide.annotations = [{ id: 'note', text: 'Note', anchor: null, appearance: null }];
  project.tour = createTourDocument();
  project.tour.slides = [slide];
  render(project);
  act(() => state().select({ kind: 'slide', slideId: slide.id, objectId: 'note' }));
  expect(state().selection).toEqual({ kind: 'slide', slideId: slide.id, objectId: 'note' });
  render({ ...project, tour: { ...project.tour, slides: [{ ...slide, annotations: [] }] } });
  expect(state().selection).toEqual({ kind: 'slide', slideId: slide.id, objectId: null });
  expect(changed).not.toHaveBeenCalled();
});

it('restores the edited slide once and falls back safely if it was removed', () => {
  const project = createGuideProject('Project');
  project.tour = createTourDocument();
  project.tour.slides = [createTourImageSlide('first'), createTourImageSlide('edited')];
  act(() => root.render(<Probe project={project} disabled={false} initialSlideId="edited" />));
  expect(state().slide?.id).toBe('edited');
  act(() => state().select({ kind: 'slide', slideId: 'first', objectId: null }));
  act(() => root.render(<Probe project={project} disabled={false} initialSlideId="edited" />));
  expect(state().slide?.id).toBe('first');
  expect(changed).not.toHaveBeenCalled();
});
