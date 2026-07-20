import { buildScenarioEditorUrl } from '../../../platform/navigation/extension-pages/scenario-editor';
import {
  readScenarioEditorPresentationSessionId,
  readScenarioEditorPresentationView,
} from '@sniptale/runtime-contracts/scenario-editor/session';
import type { ScenarioEditorBrowserDriverPort } from '../../application/ports/browser-driver';

const OBJECT_URL_REVOKE_DELAY_MS = 1500;

/**
 * Owns browser-history mutation for scenario editor selection changes.
 */
export function replaceScenarioEditorSelectionInUrl(args: {
  projectId: string | null;
  stepId?: string | null;
}): void {
  window.history.replaceState(
    {},
    '',
    buildScenarioEditorUrl({
      presentationSessionId: readScenarioEditorPresentationSessionId(window.location.search),
      presentationView: readScenarioEditorPresentationView(window.location.search),
      projectId: args.projectId,
      ...(args.stepId === undefined ? {} : { stepId: args.stepId }),
    })
  );
}

/**
 * Owns best-effort blob download DOM automation for scenario exports.
 */
export function downloadScenarioEditorBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
}

export const scenarioEditorBrowserDriver: ScenarioEditorBrowserDriverPort = {
  downloadBlob: downloadScenarioEditorBlob,
  replaceSelectionInUrl: replaceScenarioEditorSelectionInUrl,
};
