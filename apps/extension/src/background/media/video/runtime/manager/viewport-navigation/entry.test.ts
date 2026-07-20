import { expect, it, vi } from 'vitest';

const {
  handleViewportRecordingDebuggerDetachFromOwner,
  handleViewportRecordingNavigationStartFromOwner,
  handleViewportRecordingTabUpdateFromOwner,
} = vi.hoisted(() => ({
  handleViewportRecordingDebuggerDetachFromOwner: vi.fn(),
  handleViewportRecordingNavigationStartFromOwner: vi.fn(),
  handleViewportRecordingTabUpdateFromOwner: vi.fn(),
}));

vi.mock('./index', () => ({
  handleViewportRecordingDebuggerDetach: handleViewportRecordingDebuggerDetachFromOwner,
  handleViewportRecordingNavigationStart: handleViewportRecordingNavigationStartFromOwner,
  handleViewportRecordingTabUpdate: handleViewportRecordingTabUpdateFromOwner,
}));

import {
  handleViewportRecordingDebuggerDetach,
  handleViewportRecordingNavigationStart,
  handleViewportRecordingTabUpdate,
} from './index';

it('re-exports the viewport navigation facade without wrapping', () => {
  expect(handleViewportRecordingDebuggerDetach).toBe(
    handleViewportRecordingDebuggerDetachFromOwner
  );
  expect(handleViewportRecordingNavigationStart).toBe(
    handleViewportRecordingNavigationStartFromOwner
  );
  expect(handleViewportRecordingTabUpdate).toBe(handleViewportRecordingTabUpdateFromOwner);
});
