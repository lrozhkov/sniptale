import { expect, it } from 'vitest';

import * as exportHarDebuggerEvents from './debugger-events';
import {
  handleExportHarForcedDetach as handleExportHarForcedDetachFromOwner,
  handleExportHarNavigationStart as handleExportHarNavigationStartFromOwner,
  startExportHarSession as startExportHarSessionFromOwner,
  stopExportHarSession as stopExportHarSessionFromOwner,
} from './session';
import {
  handleExportHarDebuggerEvent,
  handleExportHarForcedDetach,
  handleExportHarNavigationStart,
  startExportHarSession,
  stopExportHarSession,
} from './index';

it('re-exports the export-har collector entrypoints from the owner folder without wrapping them', () => {
  expect(startExportHarSession).toBe(startExportHarSessionFromOwner);
  expect(stopExportHarSession).toBe(stopExportHarSessionFromOwner);
  expect(handleExportHarForcedDetach).toBe(handleExportHarForcedDetachFromOwner);
  expect(handleExportHarNavigationStart).toBe(handleExportHarNavigationStartFromOwner);
  expect(handleExportHarDebuggerEvent).toBe(exportHarDebuggerEvents.handleExportHarDebuggerEvent);
});
