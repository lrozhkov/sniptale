// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { buildVideoEditorUrl } from '../app-model/utils';
import { replaceVideoEditorUrl } from './index';

beforeEach(() => {
  vi.restoreAllMocks();
});

it('replaces the editor browser url through the explicit owner seam', () => {
  const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});

  replaceVideoEditorUrl('project-1', 'recording-1');

  expect(replaceStateSpy).toHaveBeenCalledWith(
    {},
    '',
    buildVideoEditorUrl('project-1', 'recording-1')
  );
});
