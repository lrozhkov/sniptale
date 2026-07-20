import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWindows } from '@sniptale/platform/browser/windows';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { createSecureRandomUuid as createEditorSessionId } from '@sniptale/platform/security/secure-random-id';
import { buildEditorUrl } from './editor';
import { buildScenarioEditorUrl } from './scenario-editor';

function buildSettingsPageUrl(section?: string): string {
  const url = new URL(runtimeInfo.getURL('apps/extension/src/settings/index.html'));
  if (section) {
    url.searchParams.set('section', section);
  }
  return url.toString();
}

export function isOwnedSettingsPage(senderUrl: string | undefined): boolean {
  if (!senderUrl) {
    return false;
  }

  try {
    const expectedUrl = new URL(buildSettingsPageUrl());
    const candidateUrl = new URL(senderUrl);
    return (
      candidateUrl.origin === expectedUrl.origin && candidateUrl.pathname === expectedUrl.pathname
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
  openStorageManager?: boolean;
  recordingId?: string | null;
}) {
  const url = new URL(runtimeInfo.getURL('apps/extension/src/gallery/index.html'));
  if (options.folder) {
    url.searchParams.set('folder', options.folder);
  }
  if (options.recordingId) {
    url.searchParams.set('folder', 'recording');
    url.searchParams.set('recordingId', options.recordingId);
  }
  if (options.openStorageManager) {
    url.searchParams.set('storageManager', '1');
  }

  return url.toString();
}

export function buildWebSnapshotViewerUrl(snapshotId: string): string {
  const url = new URL(runtimeInfo.getURL('apps/extension/src/web-snapshot-viewer/index.html'));
  url.searchParams.set('snapshotId', snapshotId);
  return url.toString();
}

function buildImageEditorPageUrl(): string {
  return buildEditorUrl({
    sessionId: createEditorSessionId(),
  });
}

function buildScenarioEditorPageUrl(projectId?: string | null, stepId?: string | null): string {
  return buildScenarioEditorUrl({
    ...(projectId === undefined ? {} : { projectId }),
    ...(stepId === undefined ? {} : { stepId }),
  });
}

function buildScenarioAudiencePageUrl(projectId: string, presentationSessionId: string): string {
  return buildScenarioEditorUrl({
    presentationSessionId,
    presentationView: 'audience',
    projectId,
  });
}

export async function openSettingsPage(options: { section?: string } = {}): Promise<void> {
  const url = buildSettingsPageUrl(options.section);
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
  options: { openStorageManager?: boolean; recordingId?: string | null } = {}
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

export async function openScenarioAudiencePage(
  projectId: string,
  presentationSessionId: string
): Promise<void> {
  const url = buildScenarioAudiencePageUrl(projectId, presentationSessionId);

  try {
    await browserWindows.create({
      state: 'maximized',
      type: 'popup',
      url,
    });
  } catch {
    await browserTabs.create({ url });
  }
}
