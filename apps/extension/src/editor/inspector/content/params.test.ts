// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createContentProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { createEditorInspectorContentBodyProps } from './params';

it.each([true, false])(
  'keeps preview dispatch separate from optional accepted actions: %s',
  (present) => {
    const preview = vi.fn();
    const commit = vi.fn();
    const action = vi.fn();
    const props = {
      ...createContentProps({
        setFrameDraft: commit,
        previewFrameDraft: present ? preview : undefined,
        applyImagePatch: present ? action : undefined,
        previewImagePatch: present ? action : undefined,
        insertOrUpdateBrowserFrame: present ? action : undefined,
        resetFrameDraft: present ? action : undefined,
      }),
      lastFillModeRef: { current: 'color' as const },
      requestConfirm: vi.fn(async () => true),
    } as Parameters<typeof createEditorInspectorContentBodyProps>[0];
    const body = createEditorInspectorContentBodyProps(props);
    expect(body.previewFrameDraft).toBe(present ? preview : undefined);
    body.previewFrameDraft?.(DEFAULT_EDITOR_FRAME_SETTINGS);
    expect(preview).toHaveBeenCalledTimes(present ? 1 : 0);
    expect(commit).not.toHaveBeenCalled();
    for (const key of [
      'applyImagePatch',
      'previewImagePatch',
      'insertOrUpdateBrowserFrame',
      'resetFrameDraft',
    ]) {
      expect(Object.hasOwn(body, key)).toBe(present);
    }
  }
);
