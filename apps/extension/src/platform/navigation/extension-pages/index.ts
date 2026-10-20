import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserAction } from '@sniptale/platform/browser/action';
import { browserWindows } from '@sniptale/platform/browser/windows';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { buildEditorUrl } from './editor';
import { EDITOR_EMBED_SESSION_QUERY_PARAM } from '../../../features/editor/contracts/embed';
import { buildScenarioEditorUrl } from './scenario-editor';
import {
  buildSettingsRouteUrl,
  resolveSettingsRoute,
  type LegacySettingsSection,
  type SettingsRoute,
} from './settings-route/codec';

export const SETTINGS_MEDIA_ACCESS_QUERY_PARAM = 'requestMediaAccess';

export function buildSettingsPageUrl(route?: SettingsRoute): string {
  const url = new URL(runtimeInfo.getURL('apps/extension/src/settings/index.html'));
  return route ? buildSettingsRouteUrl(url, route).toString() : url.toString();
}

function buildLegacySettingsPageUrl(section: LegacySettingsSection): string {
  const url = new URL(buildSettingsPageUrl());
  url.searchParams.set('section', section);
  return resolveSettingsRoute(url).normalizedUrl.toString();
}

export function isOwnedSettingsPage(senderUrl: string | undefined): boolean {
  if (!senderUrl) {
    return false;
  }

  try {
    const expectedUrl = new URL(buildSettingsPageUrl());
    const candidateUrl = new URL(senderUrl);
    return (
      candidateUrl.protocol === expectedUrl.protocol &&
      candidateUrl.host === expectedUrl.host &&
      candidateUrl.pathname === expectedUrl.pathname
    );
  } catch {
    return false;
  }
}

function buildVideoEditorPageUrl(): string {
  return runtimeInfo.getURL('apps/extension/src/video-editor/index.html');
}

function buildCameraRecorderPageUrl(params: { launchToken: string; recordingId: string }): string {
  const url = new URL(runtimeInfo.getURL('apps/extension/src/camera-recorder/index.html'));
  url.searchParams.set('recordingId', params.recordingId);
  url.searchParams.set('launchToken', params.launchToken);
  return url.toString();
}

function buildVideoEditorProjectUrl(
  projectId?: string | null,
  recordingId?: string | null
): string {
  const url = new URL(buildVideoEditorPageUrl());

  if (projectId) {
    url.searchParams.set('project', projectId);
  }

  if (recordingId) {
    url.searchParams.set('id', recordingId);
  }

  return url.toString();
}

function buildGalleryPageUrl(options: {
  folder?: string | null;
  mediaId?: string | null;
  recordingId?: string | null;
  quickEdit?: boolean;
  scope?: 'library' | 'temporary';
}) {
  const url = new URL(runtimeInfo.getURL('apps/extension/src/gallery/index.html'));
  if (options.mediaId) {
    url.searchParams.set('mediaId', options.mediaId);
    if (options.quickEdit) url.searchParams.set('mode', 'edit');
  } else if (options.recordingId) {
    url.searchParams.set('recordingId', options.recordingId);
    if (options.quickEdit) url.searchParams.set('mode', 'edit');
  } else {
    if (options.folder) url.searchParams.set('folder', options.folder);
    if (options.scope) url.searchParams.set('scope', options.scope);
  }
  return url.toString();
}

export function buildWebSnapshotViewerUrl(snapshotId: string): string {
  const url = new URL(runtimeInfo.getURL('apps/extension/src/web-snapshot-viewer/index.html'));
  url.searchParams.set('snapshotId', snapshotId);
  return url.toString();
}

function buildImageEditorPageUrl(): string {
  return buildEditorUrl();
}

function buildScenarioEditorPageUrl(projectId?: string | null, stepId?: string | null): string {
  return buildScenarioEditorUrl({
    ...(projectId === undefined ? {} : { projectId }),
    ...(stepId === undefined ? {} : { stepId }),
  });
}

async function openSettingsUrl(url: string): Promise<void> {
  const [existing] = await browserTabs.query({ url: `${buildSettingsPageUrl()}*` });
  if (typeof existing?.id === 'number') {
    await browserTabs.update(existing.id, { active: true, url });
    if (typeof existing.windowId === 'number') {
      await browserWindows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await browserTabs.create({ url });
}

export async function openSettingsPage(
  options: { route?: SettingsRoute; requestMediaAccess?: 'microphone' | 'camera' } = {}
): Promise<void> {
  const route = options.requestMediaAccess
    ? ({ section: 'access-data', view: 'permissions' } as const)
    : options.route;
  const url = new URL(buildSettingsPageUrl(route));
  if (options.requestMediaAccess) {
    url.searchParams.set(SETTINGS_MEDIA_ACCESS_QUERY_PARAM, options.requestMediaAccess);
  }
  if (!options.requestMediaAccess) {
    await openSettingsUrl(url.toString());
    return;
  }

  const [source] = await browserTabs.query({ active: true, currentWindow: true });
  if (typeof source?.id !== 'number' || typeof source.windowId !== 'number') {
    await browserTabs.create({ url: url.toString() });
    return;
  }

  const existingTabs = await browserTabs.query({
    url: `${buildSettingsPageUrl()}*`,
    windowId: source.windowId,
  });
  const existing = existingTabs.find(
    (tab) => tab.windowId === source.windowId && tab.id !== source.id
  );
  const opener = { openerTabId: source.id };
  if (typeof existing?.id === 'number') {
    await browserTabs.update(existing.id, { active: true, url: url.toString(), ...opener });
    await browserWindows.update(source.windowId, { focused: true });
    return;
  }
  await browserTabs.create({ url: url.toString(), windowId: source.windowId, ...opener });
}

/** Restores the browser-owned source tab and opens the action popup while Settings stays open. */
export async function returnToMediaRecordingPopup(): Promise<void> {
  const [settings] = await browserTabs.query({ active: true, currentWindow: true });
  if (
    !isOwnedSettingsPage(settings?.url) ||
    typeof settings?.id !== 'number' ||
    typeof settings.windowId !== 'number' ||
    typeof settings.openerTabId !== 'number' ||
    settings.openerTabId === settings.id
  ) {
    throw new Error('Recording source tab is unavailable');
  }

  const source = await browserTabs.get(settings.openerTabId);
  if (source.id !== settings.openerTabId || source.windowId !== settings.windowId) {
    throw new Error('Recording source tab is unavailable');
  }
  const previousPopup = await browserAction.getPopup({ tabId: source.id });
  const popupUrl = new URL(runtimeInfo.getURL('apps/extension/src/popup/index.html'));
  popupUrl.searchParams.set('recordingSetup', '1');
  await browserTabs.update(source.id, { active: true });
  await browserWindows.update(settings.windowId, { focused: true });
  await browserAction.setPopup({ tabId: source.id, popup: popupUrl.toString() });
  try {
    await browserAction.openPopup({ windowId: settings.windowId });
  } finally {
    await browserAction.setPopup({ tabId: source.id, popup: previousPopup });
  }
}

export async function openExtensionShortcutsPage(): Promise<void> {
  await browserTabs.create({ url: 'chrome://extensions/shortcuts' });
}

export async function openExtensionDetailsPage(): Promise<void> {
  const extensionId = new URL(runtimeInfo.getURL('')).host;
  await browserTabs.create({ url: `chrome://extensions/?id=${encodeURIComponent(extensionId)}` });
}

/** Opens the fixed browser settings surface for a blocked recording device permission. */
export async function openMediaPermissionSettingsPage(
  permission: 'microphone' | 'camera'
): Promise<void> {
  const url =
    permission === 'microphone'
      ? 'chrome://settings/content/microphone'
      : 'chrome://settings/content/camera';
  await browserTabs.create({ url });
}

export async function openLegacySettingsPage(section: LegacySettingsSection): Promise<void> {
  await openSettingsUrl(buildLegacySettingsPageUrl(section));
}

export async function openVideoEditorPage(
  projectId?: string | null,
  recordingId?: string | null
): Promise<void> {
  await browserTabs.create({ url: buildVideoEditorProjectUrl(projectId, recordingId) });
}

export async function openCameraRecorderPage(params: {
  launchToken: string;
  recordingId: string;
}): Promise<void> {
  const url = buildCameraRecorderPageUrl(params);
  try {
    await browserWindows.create({
      height: 720,
      type: 'popup',
      url,
      width: 960,
    });
  } catch {
    await browserTabs.create({ url });
  }
}

export async function openGalleryPage(
  options: {
    folder?: 'screenshot' | 'recording';
    mediaId?: string | null;
    recordingId?: string | null;
    quickEdit?: boolean;
    scope?: 'library' | 'temporary';
  } = {}
): Promise<void> {
  await browserTabs.create({ url: buildGalleryPageUrl(options) });
}

export async function openGalleryWebSnapshotsPage(): Promise<void> {
  await browserTabs.create({ url: buildGalleryPageUrl({ folder: 'web-snapshot' }) });
}

export async function openWebSnapshotViewerPage(snapshotId: string): Promise<void> {
  await browserTabs.create({ url: buildWebSnapshotViewerUrl(snapshotId) });
}

export async function openImageEditorPage(): Promise<void> {
  await browserTabs.create({ url: buildImageEditorPageUrl() });
}

export async function openScenarioEditorPage(
  projectId?: string | null,
  stepId?: string | null
): Promise<void> {
  await browserTabs.create({ url: buildScenarioEditorPageUrl(projectId, stepId) });
}

/** Builds the fixed same-extension iframe endpoint for one disposable guide image session. */
export function buildScenarioImageEditorUrl(sessionId: string): string {
  const url = new URL(buildEditorUrl({ embedMode: 'scenario' }));
  url.searchParams.set(EDITOR_EMBED_SESSION_QUERY_PARAM, sessionId);
  return url.toString();
}
