import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import {
  createEditorInspectorCompactCommandGroupsParams,
  flattenEditorInspectorCompactCommandGroupsParams,
} from './params';

it('round-trips compact command params without dropping optional line/browser handlers', () => {
  const source = createInspectorCommandParams() as ReturnType<
    typeof createInspectorCommandParams
  > & {
    applyLinePatch: () => void;
    applyImagePatch: () => void;
    insertOrUpdateBrowserFrame: () => Promise<void>;
    previewLinePatch: () => void;
    previewImagePatch: () => void;
    richShapeSelection: unknown;
  };
  source.applyLinePatch = vi.fn();
  source.applyImagePatch = vi.fn();
  source.insertOrUpdateBrowserFrame = vi.fn(async () => undefined);
  source.previewLinePatch = vi.fn();
  source.previewImagePatch = vi.fn();
  source.toolPresetHeader = { templates: [] } as never;
  const grouped = createEditorInspectorCompactCommandGroupsParams(source as never);
  const flattened = flattenEditorInspectorCompactCommandGroupsParams(grouped);

  expect(grouped.selection.richShapeSelection).toBe(source.richShapeSelection);
  expect(grouped.selection.toolPresetHeader).toBe(source.toolPresetHeader);
  expect(grouped.editorActions.applyLinePatch).toBe(source.applyLinePatch);
  expect(grouped.editorActions.applyImagePatch).toBe(source.applyImagePatch);
  expect(grouped.editorActions.previewLinePatch).toBe(source.previewLinePatch);
  expect(grouped.editorActions.previewImagePatch).toBe(source.previewImagePatch);
  expect(grouped.editorActions.insertOrUpdateBrowserFrame).toBe(source.insertOrUpdateBrowserFrame);
  expect(flattened.applyLinePatch).toBe(source.applyLinePatch);
  expect(flattened.applyImagePatch).toBe(source.applyImagePatch);
  expect(flattened.insertOrUpdateBrowserFrame).toBe(source.insertOrUpdateBrowserFrame);
  expect(flattened.previewImagePatch).toBe(source.previewImagePatch);
  expect(flattened.toolPresetHeader).toBe(source.toolPresetHeader);
});

it('omits optional compact command handlers for legacy-shaped params', () => {
  const source = createInspectorCommandParams() as ReturnType<
    typeof createInspectorCommandParams
  > & {
    applyLinePatch?: () => void;
    applyImagePatch?: () => void;
    insertOrUpdateBrowserFrame?: () => Promise<void>;
    previewLinePatch?: () => void;
    previewImagePatch?: () => void;
  };
  Reflect.deleteProperty(source, 'applyLinePatch');
  Reflect.deleteProperty(source, 'applyImagePatch');
  Reflect.deleteProperty(source, 'insertOrUpdateBrowserFrame');
  Reflect.deleteProperty(source, 'previewLinePatch');
  Reflect.deleteProperty(source, 'previewImagePatch');

  const flattened = flattenEditorInspectorCompactCommandGroupsParams(
    createEditorInspectorCompactCommandGroupsParams(source as never)
  );

  expect(flattened).not.toHaveProperty('applyLinePatch');
  expect(flattened).not.toHaveProperty('applyImagePatch');
  expect(flattened).not.toHaveProperty('previewLinePatch');
  expect(flattened).not.toHaveProperty('previewImagePatch');
  expect(flattened).not.toHaveProperty('insertOrUpdateBrowserFrame');
});
