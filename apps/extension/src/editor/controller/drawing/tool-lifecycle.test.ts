import { expect, it } from 'vitest';
import {
  isEditorDrawSessionLifecycleClick,
  resolveEditorDrawSessionLifecycleCommit,
} from './tool-lifecycle';

it('uses the shared canvas lifecycle decision for image editor box tools', () => {
  const clickSession = {
    lastPoint: { x: 36, y: 10 },
    object: {},
    objectId: 'shape',
    start: { x: 10, y: 10 },
    tool: 'rectangle' as const,
  };
  const dragSession = {
    ...clickSession,
    lastPoint: { x: 36, y: 32 },
  };

  expect(resolveEditorDrawSessionLifecycleCommit(clickSession as never, 8)).toMatchObject({
    commitKind: 'click',
    frame: { height: 0, width: 26, x: 10, y: 10 },
  });
  expect(isEditorDrawSessionLifecycleClick(dragSession as never, 8)).toBe(false);
});

it('keeps line and arrow draw sessions on either-axis activation', () => {
  const lineSession = {
    lastPoint: { x: 36, y: 10 },
    object: {},
    objectId: 'line',
    start: { x: 10, y: 10 },
    tool: 'line',
  } as never;

  expect(resolveEditorDrawSessionLifecycleCommit(lineSession, 8)).toMatchObject({
    commitKind: 'drag',
  });
});
