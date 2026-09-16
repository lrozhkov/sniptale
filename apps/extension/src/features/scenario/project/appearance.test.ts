import { expect, it } from 'vitest';
import { createGuideProject, createGuideStep, createGuideImageBlock } from './factories';
import { resolveGuideStyle, resolveGuideTextStyle, applyGuideDefaultStyle } from './appearance';

it('inherits absent values and honors an explicit default accent without mutating its source', () => {
  const project = createGuideProject('Private name');
  project.style.accentColor = '#123456';
  expect(resolveGuideStyle(project.style, { font: 'serif', accentColor: null })).toEqual({
    ...project.style,
    font: 'serif',
    accentColor: null,
  });
  expect(resolveGuideStyle(project.style, {})).toEqual(project.style);
  expect(project.style.accentColor).toBe('#123456');
});

it('changes defaults independently or resets overrides while preserving content, layout and numbering', () => {
  const project = createGuideProject('Private project');
  const step = createGuideStep('Private title');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 300,
      height: 200,
      source: { kind: 'import', filename: 'private.png' },
    })
  );
  step.layout = 'comparison';
  step.numbering = { restartAt: 7, label: 'A' };
  step.styleOverrides = { font: 'serif' };
  project.items = [step, { kind: 'section', id: 'section', title: '', paragraphs: [] }];
  const style = { ...project.style, theme: 'warm' as const };
  const defaults = applyGuideDefaultStyle(project, style, false);
  expect(defaults.items).toBe(project.items);
  expect(defaults.style).toEqual(style);
  expect(defaults.style).not.toBe(style);
  const all = applyGuideDefaultStyle(project, style, true);
  expect(all.items[0]).toEqual({ ...step, styleOverrides: {} });
  expect(all.items[1]).toBe(project.items[1]);
  expect(step.styleOverrides).toEqual({ font: 'serif' });
  expect(project.style.theme).toBe('paper');
});

it('resolves closed text sizes and alignment independently of application theme', () => {
  expect(resolveGuideTextStyle()).toEqual({ scale: 1, alignment: 'start' });
  expect(resolveGuideTextStyle({ size: 'small', alignment: 'center' })).toEqual({
    scale: 0.875,
    alignment: 'center',
  });
  expect(resolveGuideTextStyle({ size: 'large', alignment: 'end' })).toEqual({
    scale: 1.25,
    alignment: 'end',
  });
});
