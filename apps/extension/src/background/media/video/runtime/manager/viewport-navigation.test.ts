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

vi.mock('./viewport-navigation/freeze', () => ({
  handleViewportRecordingDebuggerDetach: handleViewportRecordingDebuggerDetachFromOwner,
  handleViewportRecordingNavigationStart: handleViewportRecordingNavigationStartFromOwner,
}));

vi.mock('./viewport-navigation/refresh', () => ({
  handleViewportRecordingTabUpdate: handleViewportRecordingTabUpdateFromOwner,
}));

import {
  handleViewportRecordingDebuggerDetach,
  handleViewportRecordingNavigationStart,
  handleViewportRecordingTabUpdate,
} from './viewport-navigation';

it('re-exports viewport-navigation seams without wrapping', () => {
  expect(handleViewportRecordingDebuggerDetach).toBe(
    handleViewportRecordingDebuggerDetachFromOwner
  );
  expect(handleViewportRecordingNavigationStart).toBe(
    handleViewportRecordingNavigationStartFromOwner
  );
  expect(handleViewportRecordingTabUpdate).toBe(handleViewportRecordingTabUpdateFromOwner);
});
