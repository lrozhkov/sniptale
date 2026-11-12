import { expect, it } from 'vitest';
import { parseEffectControlSet } from '@sniptale/runtime-contracts/effect-controls';
import {
  GL_TRANSITIONS,
  GL_TRANSITION_PRESET_MAX_BYTES,
  exportGlTransitionPreset,
  importGlTransitionPresetBytes,
  parseGlTransitionPresetJson,
  GL_TRANSITION_RESOURCES,
  createGlTransitionSelection,
  glTransitionControls,
  glTransitionParameters,
  glTransitionUniforms,
  resolveGlTransition,
} from './gl-catalog';

it('exposes all 214 pinned transitions with valid shared controls and complete independent uniform blocks', () => {
  expect(GL_TRANSITIONS).toHaveLength(214);
  expect(new Set(GL_TRANSITIONS.map((entry) => entry.name)).size).toBe(214);
  for (const entry of GL_TRANSITIONS) {
    const selection = createGlTransitionSelection(entry.name)!;
    expect(resolveGlTransition(selection), entry.name).toBe(entry);
    expect(parseEffectControlSet(glTransitionControls(entry)), entry.name).not.toBeNull();
    expect(glTransitionParameters(selection), entry.name).not.toBeNull();
    const a = glTransitionUniforms(selection, 0, 16 / 9),
      b = glTransitionUniforms(selection, 1, 16 / 9);
    expect(a, entry.name).not.toBeNull();
    expect(b, entry.name).not.toBeNull();
    expect(a).not.toBe(b);
    const uniform = entry.layout.uniforms.find((entry) => entry.name === 'progress')!;
    expect(new DataView(a!).getFloat32(uniform.offset, true)).toBe(0);
    expect(new DataView(b!).getFloat32(uniform.offset, true)).toBe(1);
    for (const texture of entry.textures)
      expect(GL_TRANSITION_RESOURCES.some((entry) => entry.name === texture)).toBe(true);
  }
});
it('refuses unknown identities, incompatible implementations and malformed settings without Fade substitution', () => {
  expect(createGlTransitionSelection('missing')).toBeNull();
  const selection = createGlTransitionSelection('Accordion')!;
  expect(resolveGlTransition({ ...selection, wgslSha256: '0'.repeat(64) })).toBeNull();
  expect(glTransitionParameters({ ...selection, values: {} })).toBeNull();
  expect(
    glTransitionParameters({ ...selection, values: { ...selection.values, unknown: 1 } })
  ).toBeNull();
  expect(
    glTransitionParameters({ ...selection, values: { ...selection.values, pleats: 1.5 } })
  ).toBeNull();
  expect(
    glTransitionParameters({ ...selection, values: { ...selection.values, shading: 100 } })
  ).toBeNull();
  expect(glTransitionUniforms(selection, NaN, 1)).toBeNull();
  expect(glTransitionUniforms(selection, 0.5, 0)).toBeNull();
});

it('refuses parameter values that overflow the actual GPU scalar representation', () => {
  const bowTie = createGlTransitionSelection('BowTie')!;
  expect(
    glTransitionParameters({ ...bowTie, values: { ...bowTie.values, adjust: 1e300 } })
  ).toBeNull();
  const doom = createGlTransitionSelection('DoomMelt')!;
  expect(glTransitionParameters({ ...doom, values: { ...doom.values, bars: 2 ** 31 } })).toBeNull();
  const blocks = createGlTransitionSelection('BlockSlide')!;
  expect(
    glTransitionParameters({ ...blocks, values: { ...blocks.values, 'grid.x': -(2 ** 31) - 1 } })
  ).toBeNull();
  expect(glTransitionUniforms(bowTie, 0.5, 1e300)).toBeNull();
});

it('round-trips portable presets for every bundled transition without source or project data', async () => {
  for (const entry of GL_TRANSITIONS) {
    const selection = createGlTransitionSelection(entry.name)!;
    const before = JSON.stringify(selection);
    const exported = exportGlTransitionPreset(selection, 'Мой переход');
    const bytes = new Uint8Array(await exported.blob.arrayBuffer());
    expect(importGlTransitionPresetBytes(bytes), entry.name).toEqual({
      ok: true,
      preset: {
        format: 'sniptale-gl-preset',
        version: 1,
        name: 'Мой переход',
        transition: selection,
      },
    });
    expect(JSON.stringify(selection)).toBe(before);
    expect(exported.blob.type).toBe('application/json');
    expect(exported.filename).toBe('sniptale-transition-Мой-переход.sniptale-gl-preset.json');
  }
});

it('preserves unsupported implementation references and refuses executable or malformed preset input', async () => {
  const selection = createGlTransitionSelection('BowTie')!;
  const preset = JSON.parse(await exportGlTransitionPreset(selection, 'Custom').blob.text());
  for (const change of [
    { version: 'future' },
    { adapter: 2 },
    { name: 'missing' },
    { wgslSha256: '0'.repeat(64) },
    { glsl3Sha256: '0'.repeat(64) },
  ]) {
    const transition = { ...preset.transition, ...change };
    const source = JSON.stringify({ ...preset, transition });
    expect(parseGlTransitionPresetJson(source)).toEqual({
      ok: false,
      code: 'unsupported',
      source,
      name: 'Custom',
      transitionName: transition.name,
    });
  }
  for (const value of [
    { ...preset, script: 'alert(1)' },
    { ...preset, transition: { ...selection, shader: 'https://example.test/x' } },
    { ...preset, transition: { ...selection, values: { ...selection.values, adjust: 1e300 } } },
    { ...preset, transition: { ...selection, values: {} } },
    { ...preset, name: ' ' },
    { ...preset, version: 2 },
  ])
    expect(parseGlTransitionPresetJson(JSON.stringify(value))).toEqual({
      ok: false,
      code: 'invalid',
    });
  for (const value of [null, {}, '', '{', ' '.repeat(GL_TRANSITION_PRESET_MAX_BYTES + 1)])
    expect(parseGlTransitionPresetJson(value)).toEqual({ ok: false, code: 'invalid' });
  expect(importGlTransitionPresetBytes(new Uint8Array([0xc3, 0x28]))).toEqual({
    ok: false,
    code: 'invalid',
  });
  expect(importGlTransitionPresetBytes(new Uint8Array())).toEqual({ ok: false, code: 'invalid' });
});

it('exports changed effective settings with safe filenames and refuses unavailable selections', async () => {
  const original = createGlTransitionSelection('BowTie')!;
  const selection = { ...original, values: { ...original.values, adjust: 0.25 } };
  const file = exportGlTransitionPreset(selection, '../../Мой / переход');
  expect(file.filename).toBe('sniptale-transition-Мой-переход.sniptale-gl-preset.json');
  const imported = importGlTransitionPresetBytes(new Uint8Array(await file.blob.arrayBuffer()));
  expect(imported.ok && imported.preset.transition.values['adjust']).toBe(0.25);
  expect(original.values['adjust']).not.toBe(0.25);
  expect(() =>
    exportGlTransitionPreset({ ...selection, wgslSha256: '0'.repeat(64) }, 'x')
  ).toThrow();
});

it('owns compact uniform labels while preserving upstream descriptions and defaults', () => {
  const crossZoom = GL_TRANSITIONS.find((entry) => entry.name === 'CrossZoom')!;
  expect(
    glTransitionControls(crossZoom).controls.find((control) => control.id === 'strength')
  ).toMatchObject({
    label: { en: 'Strength' },
    defaultValue: crossZoom.params['strength']!.default,
  });
  expect(crossZoom.params['strength']!.description).toBe('Blur strength');
  const blockSlide = GL_TRANSITIONS.find((entry) => entry.name === 'BlockSlide')!;
  const controls = glTransitionControls(blockSlide).controls;
  expect(controls.find((control) => control.id === 'grid.x')?.label).toEqual({ en: 'Grid · X' });
  expect(controls.find((control) => control.id === 'grid.y')?.label).toEqual({ en: 'Grid · Y' });
});
