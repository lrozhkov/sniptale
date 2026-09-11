// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideAppearanceTemplate,
} from '../../features/scenario/project/public';
import { MAX_GUIDE_TEMPLATE_BYTES } from '@sniptale/runtime-contracts/scenario/types/guide';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({ download: vi.fn(), change: vi.fn() }));
vi.mock('../platform/browser-driver', () => ({ downloadScenarioEditorBlob: io.download }));
import { GuideTemplateFiles } from './template-files';

let host: HTMLDivElement;
let root: Root;
let project = createGuideProject('Private guide');
const step = createGuideStep('Private title', 'step');
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  project = createGuideProject('Private guide');
  project.items = [step];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <GuideTemplateFiles
        project={project}
        step={step}
        disabled={false}
        onChange={io.change}
        t={createTranslator('en')}
      />
    )
  );
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
async function open(file: File) {
  const input = host.querySelector('input[type="file"]');
  if (!input) throw new Error('Missing picker');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
function templateFile(read: () => Promise<string>, size = 1) {
  const file = new File([new Uint8Array(size)], 'template.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: read });
  return file;
}
function serialized() {
  return JSON.stringify(createGuideAppearanceTemplate(project, step, 'Reusable'));
}
it('requests a local appearance-only download and exposes browser failures without changing content', async () => {
  await render();
  await click('Download template');
  const blob = io.download.mock.calls[0]?.[0] as Blob;
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  expect(text).not.toContain('Private');
  expect(JSON.parse(text)).toMatchObject({
    format: 'sniptale-guide-template',
    name: 'My template',
  });
  expect(host.textContent).toContain('Template download requested');
  io.download.mockImplementationOnce(() => {
    throw new Error('blocked');
  });
  await click('Download template');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(io.change).not.toHaveBeenCalled();
});
it('applies only validated appearance and rejects oversized files before reading bytes', async () => {
  await render();
  await open(templateFile(async () => serialized()));
  expect(io.change.mock.calls[0]?.[0].items[0].blocks).toBe(step.blocks);
  io.change.mockClear();
  const read = vi.fn(async () => serialized());
  await open(templateFile(read, MAX_GUIDE_TEMPLATE_BYTES + 1));
  expect(read).not.toHaveBeenCalled();
  expect(io.change).not.toHaveBeenCalled();
  await open(templateFile(async () => '{bad'));
  expect(io.change).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it('rejects a pending read after the edit buffer changes', async () => {
  let finish: (text: string) => void = () => undefined;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  await render();
  await open(templateFile(() => pending));
  project = { ...project, name: 'New unsaved work' };
  await render();
  await act(async () => finish(serialized()));
  expect(io.change).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('guide changed');
});
it('does not apply a file after leaving the template panel', async () => {
  let finish: (text: string) => void = () => undefined;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  await render();
  await open(templateFile(() => pending));
  await act(async () => root.render(null));
  await act(async () => finish(serialized()));
  expect(io.change).not.toHaveBeenCalled();
});
