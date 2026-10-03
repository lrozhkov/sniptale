// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { useGuidePanels } from '../panel-layout';
import { useTourSelection } from './selection';
import { TourLibraryPanel } from './library';

let host: HTMLDivElement;
let root: Root;
let current: GuideProject;
const upload = vi.fn();
const narration = vi.fn();
const generate = vi.fn();
const select = vi.fn();
const t = createTranslator('en');

function fixture() {
  const project = createGuideProject('Resources');
  project.items = [createGuideStep('Guide step')];
  project.tour = createTourDocument();
  const slide = createTourImageSlide('first');
  slide.title = 'First';
  slide.image = {
    assetId: 'image',
    width: 100,
    height: 100,
    alt: '',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'image.png' },
  };
  project.tour.slides = [slide];
  project.tour.audioResources = [{ assetId: 'audio', duration: 2, name: 'Voice.wav' }];
  return project;
}
function Probe({ importer = true }: { importer?: boolean }) {
  const [project, setProject] = useState(fixture);
  current = project;
  const panels = useGuidePanels();
  const state = useTourSelection(project, false, setProject);
  return (
    <TourLibraryPanel
      project={project}
      images={{ image: 'data:image/png;base64,aA==' }}
      panels={panels}
      state={state}
      disabled={false}
      t={t}
      onSelect={select}
      onUpload={upload}
      onGenerate={generate}
      {...(importer ? { onImportNarration: narration } : {})}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1600);
  upload.mockReset().mockResolvedValue(true);
  narration.mockReset().mockResolvedValue(true);
  generate.mockReset();
  select.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(title: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  if (!button) throw new Error(`Missing ${title}`);
  await act(async () => button.click());
}
async function choose(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('groups acquisition with media and preserves exact usage, attachment and import destinations', async () => {
  await act(async () => root.render(<Probe />));
  await click('Resources');
  expect(host.querySelector('.guide-resource-footer')).toBeNull();
  const images = host.querySelector('.guide-image-resources')!;
  expect(images.querySelector('h3')?.textContent).toBe('Images');
  expect(images.querySelector('.guide-image-upload-compact')?.nextElementSibling?.className).toBe(
    'tour-resource-list'
  );
  await click('Used in slides: 1');
  expect(select).toHaveBeenCalledWith('first');
  await click('Attach to selection');
  expect(current.tour?.slides[0]?.narration?.assetId).toBe('audio');
  expect(host.querySelector('[title="Bindings: 1"]')).not.toBeNull();
  const audio = host.querySelector('.tour-audio-resources')!;
  expect(audio.querySelector('h3')?.nextElementSibling?.className).toBe('tour-audio-acquisition');
  await choose(
    audio.querySelector('input')!,
    new File(['audio'], 'audio.wav', { type: 'audio/wav' })
  );
  expect(narration).toHaveBeenCalledWith(
    expect.objectContaining({ slideId: null, objectId: null, expectedNarration: null })
  );
  await choose(
    images.querySelector('input')!,
    new File(['image'], 'image.png', { type: 'image/png' })
  );
  expect(upload).toHaveBeenCalledOnce();
  await click('Slides');
  expect(host.querySelector('.guide-resource-footer')).not.toBeNull();
  expect(host.querySelector('.tour-audio-acquisition')).toBeNull();
});

it('keeps structure commands available and omits unsupported audio acquisition', async () => {
  await act(async () => root.render(<Probe importer={false} />));
  await click('Image slide');
  await click('Navigation slide');
  expect(current.tour?.slides.map((slide) => slide.kind)).toEqual(['image', 'image', 'navigation']);
  await click('From guide');
  expect(generate).toHaveBeenCalledOnce();
  await click('Resources');
  expect(host.querySelector('.tour-audio-resource')).not.toBeNull();
  expect(host.querySelector('.tour-audio-acquisition')).toBeNull();
});

it('offers acquisition from plus menus and previews images outside the library panel', async () => {
  await act(async () => root.render(<Probe />));
  await click('Resources');
  const audioMenu = host.querySelector<HTMLButtonElement>(
    '.tour-audio-acquisition .guide-action-menu-anchor > button'
  )!;
  const input = host.querySelector<HTMLInputElement>('.tour-audio-acquisition input')!;
  const pick = vi.spyOn(input, 'click').mockImplementation(() => {});
  await act(async () => audioMenu.click());
  const uploadButton = [
    ...document.querySelectorAll<HTMLButtonElement>('.guide-action-menu button'),
  ].find((button) => button.textContent?.includes('Upload audio'))!;
  expect(uploadButton).toBeDefined();
  await act(async () => uploadButton.click());
  expect(pick).toHaveBeenCalledOnce();
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  const actions = host.querySelector('.tour-resource-list .guide-resource-actions')!;
  expect(actions.querySelector('button:first-child .lucide-expand')).not.toBeNull();
  expect(actions.querySelector('button:last-child .lucide-arrow-right')).not.toBeNull();
  await click('View image');
  expect(select).not.toHaveBeenCalled();
  expect(host.querySelector('#tour-resource-preview')).toBeNull();
  expect(document.querySelector('#tour-resource-preview img')?.getAttribute('src')).toBe(
    'data:image/png;base64,aA=='
  );
});
