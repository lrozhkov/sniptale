// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideWorkspace } from './workspace';
import { useGuidePanels } from './panel-layout';
import { GuideBlockInspector } from './block-inspector';
import { GuideStyleFields } from './style-controls';
let host: HTMLDivElement;
let root: Root;
const t = createTranslator('en');
const project = createGuideProject('Guide');
const step = createGuideStep('Step', 'step');
project.items = [step];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Workspace() {
  const panels = useGuidePanels();
  const [block, setBlock] = useState(false);
  return (
    <GuideWorkspace
      panels={panels}
      project={project}
      selectedId="step"
      images={{}}
      header={
        <>
          <button onClick={() => panels.openRight('document')}>Document entry</button>
          <button
            onClick={() => {
              panels.openRight('selection');
              setBlock(false);
            }}
          >
            Select step
          </button>
          <button
            onClick={() => {
              panels.openRight('selection');
              setBlock(true);
            }}
          >
            Select block
          </button>
        </>
      }
      onUploadFile={async () => false}
      disabled={false}
      onSelect={() => {}}
      onAddStep={() => {}}
      itemActions={
        <GuideStyleFields
          key={block ? 'block' : 'step'}
          style={project.style}
          disabled={false}
          onChange={() => {}}
          t={t}
        />
      }
      t={t}
      inspectedBlockKind={block ? 'text' : undefined}
    >
      {null}
    </GuideWorkspace>
  );
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
it('keeps document entry separate and only shows presentation controls for the step', async () => {
  await act(async () => root.render(<Workspace />));
  expect(host.querySelector('.guide-inspector-scope')).toBeNull();
  await click('Select step');
  const panel = host.querySelector('#guide-inspector-panel')!;
  expect(panel.querySelector('h2')?.textContent).toBe('Step');
  expect(panel.querySelector('[aria-label="Show all settings"]')).not.toBeNull();
  await click('Show all settings');
  expect(
    panel.querySelector('[aria-label="Show settings sections"]')?.getAttribute('aria-pressed')
  ).toBeNull();
  await click('Select block');
  expect(panel.querySelector('h2')?.textContent).toBe('Text');
  expect(panel.querySelector('[aria-label="Show settings sections"]')).toBeNull();
  await click('Document entry');
  expect(panel.querySelector('h2')?.textContent).toBe(t('scenario.editor.guideEntireDocument'));
  expect(panel.querySelector('[aria-label="Show all settings"]')).toBeNull();
  await click('Select step');
  expect(panel.querySelector('[aria-label="Show settings sections"]')).not.toBeNull();
});
it('labels text reset separately and restores inherited formatting without altering content', async () => {
  const block = {
    id: 'text',
    kind: 'text' as const,
    paragraphs: [],
    textStyle: { size: 'large' as const, alignment: 'center' as const },
  };
  const change = vi.fn();
  await act(async () =>
    root.render(
      <GuideBlockInspector
        item={step}
        block={block}
        disabled={false}
        onChange={change}
        onClose={() => {}}
        t={t}
      />
    )
  );
  const reset = host.querySelector('.guide-inspector-reset button');
  expect(reset?.textContent).toBe('Reset text appearance');
  expect(host.querySelector('nav')).toBeNull();
  await click('Reset text appearance');
  expect(change).toHaveBeenCalledWith({ id: 'text', kind: 'text', paragraphs: [] }, null);
});
it('disables the shared color picker and reset while edits are locked', async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <GuideStyleFields
        style={{ ...project.style, accentColor: '#123456' }}
        disabled={true}
        onChange={change}
        t={t}
      />
    )
  );
  const color = host.querySelector('.guide-style-accent')!;
  for (const button of color.querySelectorAll('button')) {
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
  }
  expect(change).not.toHaveBeenCalled();
});

it.each(['ru', 'en'] as const)(
  'collapses groups without losing drafts or activating their actions in %s',
  async (locale) => {
    const translate = createTranslator(locale);
    const { GuideInspectorGroup } = await import('./inspector');
    const { Type } = await import('lucide-react');
    const action = vi.fn();
    const label = translate('scenario.editor.guideStyleGroup');
    await act(async () =>
      root.render(
        <GuideInspectorGroup
          id="inspector-consistency"
          title={label}
          icon={Type}
          action={<button onClick={action}>Reset</button>}
        >
          <input aria-label="Draft" defaultValue="Unsaved text" />
        </GuideInspectorGroup>
      )
    );
    const draft = host.querySelector('input')!;
    draft.value = 'Edited draft';
    const toggle = host.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    const body = host.querySelector<HTMLElement>('.guide-inspector-group-body')!;
    expect(toggle.textContent).toBe(label);
    expect(toggle.getAttribute('aria-controls')).toBe(body.id);
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBe(true);
    expect(host.querySelector('input')).toBe(draft);
    await click('Reset');
    expect(action).toHaveBeenCalledOnce();
    expect(body.hidden).toBe(true);
    await act(async () => toggle.click());
    expect(body.hidden).toBe(false);
    expect(draft.value).toBe('Edited draft');
  }
);

it('remembers disclosure choices by element type after another selection', async () => {
  await act(async () => root.render(<Workspace />));
  await click('Select step');
  const toggle = () => host.querySelector<HTMLButtonElement>('.guide-inspector-disclosure')!;
  await act(async () => toggle().click());
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
  await click('Select block');
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
  await click('Select step');
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
});
