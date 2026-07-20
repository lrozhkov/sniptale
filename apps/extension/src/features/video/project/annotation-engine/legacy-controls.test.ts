import { expect, it } from 'vitest';
import { createLegacyAnnotationControls } from './legacy-controls';

it('creates family defaults while preserving the caller-owned accent node', () => {
  expect(createLegacyAnnotationControls({ accentNodeId: 'dot', family: 'technical' })).toEqual([
    expect.objectContaining({ defaultValue: 'System state', id: 'headline' }),
    expect.objectContaining({
      binding: expect.objectContaining({ nodeId: 'dot' }),
      defaultValue: '#2563eb',
      id: 'accent',
    }),
  ]);
  expect(createLegacyAnnotationControls({ accentNodeId: 'accent', family: 'editorial' })).toEqual([
    expect.objectContaining({ defaultValue: 'Key moment', id: 'headline' }),
    expect.objectContaining({ defaultValue: '#d97706', id: 'accent' }),
  ]);
});
