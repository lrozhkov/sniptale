// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  resolveGuideStyle,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideAppearance } from './appearance';

let host: HTMLDivElement;
let root: Root;
let project = createGuideProject('Guide');
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  project = createGuideProject('Guide');
  project.items.push(createGuideStep('Step', 'step'));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Harness() {
  const [value, setValue] = useState(project);
  return (
    <GuideAppearance
      project={value}
      selectedId="step"
      disabled={false}
      t={createTranslator('en')}
      onChange={(next) => {
        project = next;
        setValue(next);
      }}
    />
  );
}
async function click(label: string, scope: ParentNode = host) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent)?.trim() === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
async function choose(label: string, value: string) {
  await click(label);
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (node) => node.textContent?.trim() === value
  );
  if (!option) throw new Error(`Missing option ${value}`);
  await act(async () => option.click());
}
it('changes layout without replacing content and resets local appearance to current project values', async () => {
  await act(async () => root.render(<Harness />));
  await click('Appearance');
  const blocks = project.items[0]?.kind === 'step' ? project.items[0].blocks : null;
  await choose('Step layout', 'Comparison');
  expect(project.items[0]).toMatchObject({ layout: 'comparison', blocks });
  await click('Customize this step');
  await choose('Font', 'Serif');
  await click('Whole guide');
  await choose('Paper theme', 'Graphite');
  await click('This step');
  const local = project.items[0];
  if (local?.kind !== 'step') throw new Error('Missing step');
  expect(resolveGuideStyle(project.style, local.styleOverrides)).toMatchObject({
    theme: 'paper',
    font: 'serif',
  });
  await click('Use guide appearance');
  expect(project.items[0]).toMatchObject({ styleOverrides: {}, layout: 'comparison', blocks });
  expect(project.style.theme).toBe('graphite');
});
it('allows project appearance when the selected item is a section', async () => {
  project.items = [{ kind: 'section', id: 'section', title: 'Start', paragraphs: [] }];
  const change = vi.fn();
  await act(async () =>
    root.render(
      <GuideAppearance
        project={project}
        selectedId="section"
        disabled={false}
        onChange={change}
        t={createTranslator('en')}
      />
    )
  );
  await click('Appearance');
  await choose('Spacing', 'Compact');
  expect(change.mock.calls[0]?.[0].style.density).toBe('compact');
  expect(host.querySelector('[aria-label="Step layout"]')).toBeNull();
});
