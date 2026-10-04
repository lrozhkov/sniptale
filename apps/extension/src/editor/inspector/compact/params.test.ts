import { expect, it, vi } from 'vitest';
import { createContentProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import type { EditorInspectorCompactCommandContext } from './command-types';
import {
  createEditorInspectorCompactCommandGroupsParams,
  flattenEditorInspectorCompactCommandGroupsParams,
} from './params';

it('preserves frame fill mode and present optional actions through compact groups', () => {
  const lastFillModeRef = { current: 'gradient' as const };
  const applyImagePatch = vi.fn();
  const previewImagePatch = vi.fn();
  const insertOrUpdateBrowserFrame = vi.fn(async () => undefined);
  const context = {
    ...createContentProps(),
    lastFillModeRef,
    applyImagePatch,
    previewImagePatch,
    insertOrUpdateBrowserFrame,
    copyRenderedImageDisabledReason: 'Copy unavailable',
  } as unknown as EditorInspectorCompactCommandContext;

  const groups = createEditorInspectorCompactCommandGroupsParams(context);

  expect(groups.frame.lastFillModeRef).toBe(lastFillModeRef);
  expect(groups.editorActions.applyImagePatch).toBe(applyImagePatch);
  expect(groups.editorActions.previewImagePatch).toBe(previewImagePatch);
  expect(groups.editorActions.insertOrUpdateBrowserFrame).toBe(insertOrUpdateBrowserFrame);
  expect(groups.document.copyRenderedImageDisabledReason).toBe('Copy unavailable');
  expect(flattenEditorInspectorCompactCommandGroupsParams(groups)).toMatchObject({
    lastFillModeRef,
    applyImagePatch,
    previewImagePatch,
    insertOrUpdateBrowserFrame,
    copyRenderedImageDisabledReason: 'Copy unavailable',
  });
});

it('omits optional actions and disabled reason when their values are undefined', () => {
  const context = {
    ...createContentProps(),
    lastFillModeRef: { current: 'color' as const },
    applyImagePatch: undefined,
    previewImagePatch: undefined,
    insertOrUpdateBrowserFrame: undefined,
    copyRenderedImageDisabledReason: undefined,
  } as unknown as EditorInspectorCompactCommandContext;

  const groups = createEditorInspectorCompactCommandGroupsParams(context);
  const flat = flattenEditorInspectorCompactCommandGroupsParams(groups);

  for (const key of ['applyImagePatch', 'previewImagePatch', 'insertOrUpdateBrowserFrame']) {
    expect(groups.editorActions).not.toHaveProperty(key);
    expect(flat).not.toHaveProperty(key);
  }
  expect(groups.document).not.toHaveProperty('copyRenderedImageDisabledReason');
  expect(flat).not.toHaveProperty('copyRenderedImageDisabledReason');
  expect(flat.lastFillModeRef).toBe(context.lastFillModeRef);
});
