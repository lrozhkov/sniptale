// @vitest-environment jsdom
import { useGlTransitionCatalog } from '../../../../../../composition/gl-transition-presets/catalog';
import {
  createGlCatalogFixture,
  createImportedGlCatalogFixture,
} from '../../../../../../composition/gl-transition-presets/catalog.test-support';
import {
  GL_TRANSITIONS,
  createGlTransitionSelection,
} from '../../../../../../features/video/project/transition/gl-catalog';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../../features/video/project/factories/creation';
import {
  createAudioClip,
  createVideoClip,
} from '../../../../../../features/video/project/timeline/project-meta.test.helpers';
import { syncProjectTransitions } from '../../../../../../features/video/project/transition/project';
import { translate } from '../../../../../../platform/i18n';
import { glTransitionLabel } from '../../../../../../ui/gl-transition-labels';
import { InspectTransitionPanel } from './transition-panel';

it('offers audio timing and easing without visual templates or style controls', () => {
  const project = createEmptyVideoProject('Audio');
  project.clips = [
    createAudioClip({ id: 'a', trackId: project.tracks[0]!.id, startTime: 0, duration: 4 }),
    createAudioClip({ id: 'b', trackId: project.tracks[0]!.id, startTime: 3, duration: 4 }),
  ];
  const prepared = syncProjectTransitions(project);
  const update = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <InspectTransitionPanel
          project={prepared}
          selectedTransition={prepared.transitions![0]!}
          onUpdateTransitionDuration={vi.fn()}
          onUpdateTransitionEasing={update}
          onUpdateTransitionTemplate={vi.fn()}
        />
      )
    );
    expect(container.textContent).toContain(translate('videoEditor.sidebar.transitionEasingLabel'));
    expect(container.textContent).not.toContain(
      translate('videoEditor.sidebar.transitionIntensityLabel')
    );
    expect(container.textContent).not.toContain(
      translate('videoEditor.sidebar.transitionDirectionLabel')
    );
    const buttons = [...container.querySelectorAll('button')];
    const eased = buttons.find(
      (button) => button.textContent === translate('videoEditor.sidebar.transitionEasingEaseInOut')
    );
    expect(eased).toBeDefined();
    act(() => eased!.click());
    expect(update).toHaveBeenCalledWith(prepared.transitions![0]!.id, 'EASE_IN_OUT');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('disables every fallback easing choice when either transition track is locked', () => {
  const project = createEmptyVideoProject('Locked transition');
  project.tracks[0]!.locked = true;
  project.clips = [
    createAudioClip({ id: 'a', trackId: project.tracks[0]!.id, startTime: 0, duration: 4 }),
    createAudioClip({ id: 'b', trackId: project.tracks[0]!.id, startTime: 3, duration: 4 }),
  ];
  const prepared = syncProjectTransitions(project);
  const update = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <InspectTransitionPanel
          project={prepared}
          selectedTransition={prepared.transitions![0]!}
          onUpdateTransitionDuration={vi.fn()}
          onUpdateTransitionEasing={update}
          onUpdateTransitionTemplate={vi.fn()}
        />
      )
    );
    const labels = [
      translate('videoEditor.sidebar.transitionEasingLinear'),
      translate('videoEditor.sidebar.transitionEasingEaseInOut'),
    ];
    const choices = [
      ...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'),
    ].filter((button) => labels.includes(button.textContent ?? ''));
    expect(choices).toHaveLength(2);
    expect(choices.every((choice) => choice.disabled)).toBe(true);
    act(() => choices[0]!.click());
    expect(update).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});

it('selects every bundled GL family through the Native inspector and commits shared shader controls', async () => {
  const project = createEmptyVideoProject('GL inspector');
  project.clips = [
    createVideoClip({ id: 'A', trackId: project.tracks[0]!.id, startTime: 0, duration: 4 }),
    createVideoClip({ id: 'B', trackId: project.tracks[0]!.id, startTime: 3, duration: 4 }),
  ];
  const prepared = syncProjectTransitions(project),
    transition = prepared.transitions![0]!;
  if (transition.kind !== 'gl') throw new Error('Expected GL transition');
  const original = structuredClone(prepared),
    change = vi.fn(),
    easing = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (selection = transition.selection) =>
    root.render(
      <InspectTransitionPanel
        project={prepared}
        selectedTransition={{ ...transition, selection }}
        onUpdateTransitionDuration={vi.fn()}
        onUpdateTransitionEasing={easing}
        onUpdateTransitionTemplate={change}
      />
    );
  try {
    await act(async () => render());
    const trigger = [
      ...container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]'),
    ].find((button) => button.textContent?.includes('Fade'));
    expect(trigger).toBeDefined();
    await act(async () => trigger!.click());
    const choices = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(choices).toHaveLength(214);
    const names = new Set(choices.map((choice) => choice.textContent));
    for (const entry of GL_TRANSITIONS) {
      expect(names).toContain(glTransitionLabel(createGlTransitionSelection(entry.name)!));
    }
    const crossZoom = choices.find(
      (choice) =>
        choice.textContent === glTransitionLabel(createGlTransitionSelection('CrossZoom')!)
    )!;
    await act(async () => crossZoom.click());
    const selection = createGlTransitionSelection('CrossZoom')!;
    expect(change).toHaveBeenLastCalledWith(transition.id, { selection, presetId: null });
    await act(async () => render(selection));
    const strength = container.querySelector<HTMLInputElement>(
      '[data-effect-control-id="strength"] input[type="text"]'
    )!;
    expect(strength).not.toBeNull();
    act(() => strength.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        strength,
        '0.6'
      );
      strength.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      strength.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(change).toHaveBeenLastCalledWith(transition.id, {
      selection: { ...selection, values: { ...selection.values, strength: 0.6 } },
      presetId: null,
    });
    expect(prepared).toEqual(original);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

async function importPresetFile(
  parent: ParentNode,
  selection: ReturnType<typeof createGlTransitionSelection>,
  name = 'Imported'
) {
  if (!selection) throw new Error('Missing preset selection');
  const source = JSON.stringify({
    format: 'sniptale-gl-preset',
    version: 1,
    name,
    transition: selection,
  });
  const file = new File([source], 'imported.sniptale-gl-preset.json');
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(source).buffer,
  });
  const input = parent.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing preset file input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('imports a GL preset for the current Native junction without changing timing, easing or locked tracks', async () => {
  const project = createEmptyVideoProject('Preset target');
  project.clips = [
    createVideoClip({ id: 'A', trackId: project.tracks[0]!.id, startTime: 0, duration: 4 }),
    createVideoClip({ id: 'B', trackId: project.tracks[0]!.id, startTime: 3, duration: 4 }),
  ];
  const prepared = syncProjectTransitions(project),
    transition = prepared.transitions![0]!;
  if (transition.kind !== 'gl') throw new Error('Missing visual junction');
  const change = vi.fn(),
    duration = vi.fn(),
    easing = vi.fn(),
    before = structuredClone(prepared);
  const host = document.createElement('div'),
    root = createRoot(host);
  document.body.append(host);
  const render = () =>
    root.render(
      <InspectTransitionPanel
        project={prepared}
        selectedTransition={transition}
        onUpdateTransitionDuration={duration}
        onUpdateTransitionEasing={easing}
        onUpdateTransitionTemplate={change}
      />
    );
  try {
    await act(async () => render());
    const selection = createGlTransitionSelection('CrossZoom')!;
    expect(host.querySelector('[data-gl-preset-owner]')?.getAttribute('data-gl-preset-owner')).toBe(
      `${prepared.id}:${transition.id}`
    );
    await importPresetFile(host, selection);
    expect(change).toHaveBeenCalledExactlyOnceWith(transition.id, { selection, presetId: null });
    expect(duration).not.toHaveBeenCalled();
    expect(easing).not.toHaveBeenCalled();
    expect(prepared).toEqual(before);
    prepared.tracks[0]!.locked = true;
    await act(async () => render());
    expect(host.querySelector<HTMLInputElement>('input[type=file]')!.disabled).toBe(true);
    await importPresetFile(host, selection);
    expect(change).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

vi.mock('../../../../../../composition/gl-transition-presets/catalog', async () => {
  const { createGlCatalogFixture } =
    await import('../../../../../../composition/gl-transition-presets/catalog.test-support');
  return { useGlTransitionCatalog: vi.fn(createGlCatalogFixture) };
});

it('applies a saved catalogue selection through the Native clip transition command', async () => {
  const { catalog, selection } = createImportedGlCatalogFixture();
  vi.mocked(useGlTransitionCatalog).mockReturnValue(catalog);
  const project = createEmptyVideoProject('Saved GL');
  project.clips = [
    createVideoClip({ id: 'a', trackId: project.tracks[0]!.id, startTime: 0, duration: 4 }),
    createVideoClip({ id: 'b', trackId: project.tracks[0]!.id, startTime: 3, duration: 4 }),
  ];
  const prepared = syncProjectTransitions(project),
    transition = prepared.transitions![0]!,
    change = vi.fn(),
    host = document.createElement('div'),
    root = createRoot(host);
  document.body.append(host);
  try {
    await act(async () =>
      root.render(
        <InspectTransitionPanel
          project={prepared}
          selectedTransition={transition}
          onUpdateTransitionDuration={vi.fn()}
          onUpdateTransitionEasing={vi.fn()}
          onUpdateTransitionTemplate={change}
        />
      )
    );
    const trigger = [
      ...host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]'),
    ].find((button) => button.textContent?.includes('Fade'))!;
    await act(async () => {
      trigger.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role=option]')].find(
      (button) => button.textContent === 'Saved zoom'
    );
    expect(option).toBeDefined();
    await act(async () => option!.click());
    expect(change).toHaveBeenCalledExactlyOnceWith(transition.id, { selection, presetId: null });
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.mocked(useGlTransitionCatalog).mockImplementation(createGlCatalogFixture);
  }
});
