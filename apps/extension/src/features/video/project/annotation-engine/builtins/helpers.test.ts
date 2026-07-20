import { expect, it, vi } from 'vitest';

import { createEmptyVideoAnnotationTemplateGroups } from '../parser';
import {
  createBuiltInContentTemplateFactory,
  createPack,
  group,
  localized,
  rectNode,
  textNode,
} from './helpers';

const catalog = {
  accent: '#111111',
  background: '#222222',
  defaultDescription: 'Default description',
  defaultHeadline: 'Default headline',
  defaultSubline: 'Default subline',
  easing: 'linear' as const,
  headlineColor: '#ffffff',
  radius: 12,
  sublineColor: '#eeeeee',
};

it('builds a content template from the owner catalog and resolved defaults', () => {
  const resolveDefaults = vi.fn(() => ({
    description: 'Resolved description',
    headline: 'Resolved headline',
    label: 'Resolved label',
    subline: 'Resolved subline',
  }));
  const template = createBuiltInContentTemplateFactory({
    catalog,
    defaultTracks: () => [],
    resolveDefaults,
    resolveElementKind: () => 'callout',
  })('owner-template', 'owner-kind', group([]), 1_500, 'none');

  expect(resolveDefaults).toHaveBeenCalledWith('owner-template');
  expect(template).toMatchObject({
    description: { fallback: 'Resolved description' },
    elementKind: 'callout',
    id: 'owner-template',
    label: { fallback: 'Resolved label' },
    target: { kind: 'none', required: false },
  });
  expect(template.timeline).toMatchObject({
    durationMs: 1_500,
    tracks: [{ id: 'root-opacity' }],
  });
});

it('uses catalog fallbacks, explicit tracks, and the primitive node builders', () => {
  const explicitTrack = {
    id: 'position-track',
    keyframes: [{ offsetMs: 0, value: 0 }],
    property: 'x',
    targetNodeId: 'label',
  };
  const frame = { height: 20, width: 100, x: 10, y: 15 };
  const child = textNode('label', 'Label', frame, { color: '#ffffff' });
  const tree = group([rectNode('panel', frame, { opacity: 1 }, [child], { role: 'panel' })]);
  const template = createBuiltInContentTemplateFactory({
    catalog,
    defaultTracks: () => [],
    resolveDefaults: () => undefined,
    resolveElementKind: () => 'focus',
  })('fallback-template', 'focus-kind', tree, 2_000, 'point', [explicitTrack]);

  expect(template).toMatchObject({
    description: { fallback: 'Default description' },
    label: { fallback: 'fallback-template' },
    renderTree: tree,
    target: { kind: 'point', required: true },
    timeline: { tracks: [{ id: 'root-opacity' }, explicitTrack] },
  });
  expect(localized('key', 'Fallback')).toEqual({
    fallback: 'Fallback',
    key: 'videoEditor.sidebar.annotationTemplates.key',
  });
});

it('creates a schema-versioned annotation pack', () => {
  const templates = createEmptyVideoAnnotationTemplateGroups();
  const pack = createPack({
    description: localized('packDescription', 'Pack description'),
    label: localized('packLabel', 'Pack label'),
    packId: 'owner-pack',
    templates,
    theme: {
      defaults: { accent: '#111111' },
      tokens: [{ id: 'accent', type: 'color', value: '#111111' }],
    },
  });

  expect(pack).toMatchObject({ packId: 'owner-pack', schemaVersion: 1, templates });
});
