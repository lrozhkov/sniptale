import { expect, it, vi } from 'vitest';
import { CaptureSurfaceError } from '../../../capture-surface';
import {
  classifyCaptureSurfaceStartFailure,
  classifyTabCaptureFailure,
  ensureCurrentRecordingDocument,
} from './start-failure';

const getAllFrames = vi.hoisted(() => vi.fn());
vi.mock('@sniptale/platform/browser/web-navigation', () => ({
  browserWebNavigation: { getAllFrames },
}));

it('distinguishes a selected window that does not fit from failed verification', () => {
  expect(classifyCaptureSurfaceStartFailure(new CaptureSurfaceError('window-too-large'))).toBe(
    'viewport-too-large'
  );
  expect(classifyCaptureSurfaceStartFailure(new CaptureSurfaceError('verification-failed'))).toBe(
    'viewport-verification-failed'
  );
});

it('does not classify unrelated errors as a verified capture-surface failure', () => {
  expect(classifyCaptureSurfaceStartFailure(new Error('verification-failed'))).toBeUndefined();
  expect(classifyCaptureSurfaceStartFailure(new CaptureSurfaceError('permission-denied'))).toBe(
    'permission-required'
  );
  expect(classifyCaptureSurfaceStartFailure(new CaptureSurfaceError('surface-busy'))).toBe(
    'already-active'
  );
  expect(
    classifyCaptureSurfaceStartFailure(new CaptureSurfaceError('platform-rejected'))
  ).toBeUndefined();
});

it('classifies browser tab-capture denial without retaining browser error details', () => {
  expect(
    classifyTabCaptureFailure(new Error('Extension has not been invoked for the current page'))
  ).toBe('permission-required');
  expect(classifyTabCaptureFailure(new Error('Cannot capture this tab'))).toBe('invalid-source');
  expect(classifyTabCaptureFailure(new Error('No tab capture stream id'))).toBe('invalid-source');
  expect(classifyTabCaptureFailure(new Error('unexpected browser message'))).toBe('internal-error');
});

it('accepts only the current top-frame document for a recording start', async () => {
  getAllFrames.mockResolvedValueOnce([{ frameId: 0, documentId: 'current' }]);
  await expect(ensureCurrentRecordingDocument(7, 'current')).resolves.toBeUndefined();
  getAllFrames.mockResolvedValueOnce([{ frameId: 0, documentId: 'new' }]);
  await expect(ensureCurrentRecordingDocument(7, 'current')).rejects.toMatchObject({
    code: 'stale-context',
  });
});
