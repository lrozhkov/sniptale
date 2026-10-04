// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  applyTourCommands,
  getTourImages,
} from '../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { createTranslator } from '../../../platform/i18n';
import { TourMusicSettings } from './music-settings';
import { TourInspector } from './inspector';
let root: Root;
let host: HTMLDivElement;
let project: GuideProject;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  project = createGuideProject('Project');
  project.tour = createTourDocument();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function draw() {
  act(() =>
    root.render(
      <TourInspector
        presentation="sections"
        music={
          <TourMusicSettings
            tour={project.tour!}
            disabled={false}
            importDisabled={false}
            onChange={(tour) => accept({ kind: 'replace-tour', tour })}
            onImport={vi.fn()}
            t={createTranslator('en')}
          />
        }
        tour={project.tour!}
        slide={null}
        selection={null}
        scope="document"
        disabled={false}
        t={createTranslator('en')}
        onChangeTour={(tour) => accept({ kind: 'replace-tour', tour })}
        onChangeSlide={vi.fn()}
        onSelectObject={vi.fn()}
      />
    )
  );
}
function accept(command: Parameters<typeof applyTourCommands>[1][number]) {
  try {
    project = applyTourCommands(project, [command], {
      images: getTourImages(project.tour!),
      audio: project.tour!.audioResources ?? [],
    });
    draw();
    return true;
  } catch {
    return false;
  }
}
async function click(label: string) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
  const button =
    buttons.find((n) => n.getAttribute('aria-label') === label) ??
    buttons.find((n) => n.title === label || n.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button ${label}: ${host.textContent}`);
  await act(async () => button.click());
}
async function fill(label: string, value: string) {
  const field = [
    ...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea'),
  ].find((n) => n.getAttribute('aria-label') === label);
  if (!field) throw new Error(`Missing field ${label}`);
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
}
it('edits one global music binding, preserves balances on replacement and removes only binding', async () => {
  project.tour!.audioResources = [
    { assetId: 'one', duration: 5, name: 'One.wav' },
    { assetId: 'two', duration: 8, name: 'Two.wav' },
  ];
  draw();
  await click('Music');
  expect(host.textContent).not.toContain('Record');
  await click('From resources');
  await act(async () => host.querySelectorAll<HTMLButtonElement>('.tour-audio-name')[0]!.click());
  expect(project.tour!.backgroundMusic).toEqual({
    assetId: 'one',
    duration: 5,
    volume: 0.3,
    loop: true,
    ducking: { enabled: true, level: 0.25 },
  });
  await fill('Volume', '45');
  await fill('Volume during narration', '15');
  await click('Loop');
  await click('Lower during narration');
  expect(host.querySelector('input[aria-label="Volume during narration"]')).toBeNull();
  await click('From resources');
  await act(async () => host.querySelectorAll<HTMLButtonElement>('.tour-audio-name')[1]!.click());
  expect(project.tour!.backgroundMusic).toEqual({
    assetId: 'two',
    duration: 8,
    volume: 0.45,
    loop: false,
    ducking: { enabled: false, level: 0.15 },
  });
  await click('Remove music');
  expect(project.tour!.backgroundMusic).toBeNull();
  expect(project.tour!.audioResources).toHaveLength(2);
});
