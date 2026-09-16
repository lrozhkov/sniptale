// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
  type TourGenerationProposal,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
const prepare = vi.hoisted(() => vi.fn());
vi.mock('../../../workflows/scenario-capture-edit/tour-materials', () => ({
  prepareTourFromGuide: prepare,
}));
import { TourGeneration } from './generation';
let root: Root;
let host: HTMLDivElement;
let resolveProposal: (proposal: TourGenerationProposal) => void;
const changed = vi.fn();
const closed = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  changed.mockClear();
  closed.mockClear();
  prepare.mockReset();
  prepare.mockImplementation(
    () =>
      new Promise<TourGenerationProposal>((resolve) => {
        resolveProposal = resolve;
      })
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function render(project: GuideProject, disabled = false) {
  act(() =>
    root.render(
      <TourGeneration
        project={project}
        disabled={disabled}
        onChange={changed}
        onClose={closed}
        t={createTranslator('en')}
      />
    )
  );
}
function proposal(): TourGenerationProposal {
  const tour = createTourDocument();
  tour.slides = [createTourImageSlide('generated')];
  return { tour, issues: [] };
}
function button(name: string) {
  const found = [...host.querySelectorAll('button')].find((entry) => entry.textContent === name);
  if (!found) throw new Error(`Missing button ${name}`);
  return found;
}
it('rejects a proposal after an authored source change and aborts its resolver on unmount', async () => {
  const project = createGuideProject('Original');
  render(project);
  const signal = prepare.mock.calls[0]?.[0].signal as AbortSignal;
  render({ ...project, name: 'Changed' });
  await act(async () => resolveProposal(proposal()));
  expect(button('From guide').disabled).toBe(true);
  act(() => button('From guide').click());
  expect(changed).not.toHaveBeenCalled();
  act(() => root.render(null));
  expect(signal.aborted).toBe(true);
});
it('allows autosave timestamp changes and publishes once without changing guide content', async () => {
  const project = createGuideProject('Original');
  render(project);
  render({ ...project, updatedAt: project.updatedAt + 1 });
  await act(async () => resolveProposal(proposal()));
  act(() => button('From guide').click());
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0]?.[0].items).toEqual(project.items);
  expect(changed.mock.calls[0]?.[0].tour.slides[0].id).toBe('generated');
  expect(closed).toHaveBeenCalledTimes(1);
});
it('does not publish a late result after cancellation', async () => {
  render(createGuideProject('Original'));
  act(() => root.render(null));
  await act(async () => resolveProposal(proposal()));
  expect(changed).not.toHaveBeenCalled();
  expect(host.textContent).toBe('');
});

it('retains a ready proposal while an import locks editing, then allows acceptance after unlocking', async () => {
  const project = createGuideProject('Original');
  render(project);
  await act(async () => resolveProposal(proposal()));
  render(project, true);
  expect(button('From guide').disabled).toBe(true);
  act(() => button('From guide').click());
  expect(changed).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
  render(project, false);
  expect(button('From guide').disabled).toBe(false);
  act(() => button('From guide').click());
  expect(changed).toHaveBeenCalledTimes(1);
  expect(closed).toHaveBeenCalledTimes(1);
});
