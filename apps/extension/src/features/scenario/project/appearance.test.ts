import { expect, it } from 'vitest';
import { createGuideProject, createGuideStep, createGuideImageBlock } from './factories';
import {
  resolveGuideStyle,
  createGuideAppearanceTemplate,
  applyGuideAppearanceTemplate,
} from './appearance';

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

it('exports only appearance and applies it without replacing content or resource identity', () => {
  const project = createGuideProject('Private project');
  const step = createGuideStep('Private title');
  step.blocks.push(
    createGuideImageBlock({
      id: 'private-image',
      assetId: 'private-asset',
      width: 300,
      height: 200,
      source: { kind: 'import', filename: 'private.png' },
    })
  );
  step.styleOverrides = { font: 'serif' };
  const template = createGuideAppearanceTemplate(project, step, 'Reusable');
  expect(template).not.toBeNull();
  expect(JSON.stringify(template)).not.toContain('Private');
  expect(JSON.stringify(template)).not.toContain('private');
  if (!template) throw new Error('Missing template');
  const changed = applyGuideAppearanceTemplate(step, {
    ...template,
    layout: 'comparison',
    showNumber: false,
  });
  expect(changed.blocks).toBe(step.blocks);
  expect(changed.id).toBe(step.id);
  expect(changed.title).toBe(step.title);
  expect(changed.layout).toBe('comparison');
  expect(changed.showNumber).toBe(false);
  expect(changed.styleOverrides.font).toBe('serif');
  expect(createGuideAppearanceTemplate(project, step, ' ')).toBeNull();
});
