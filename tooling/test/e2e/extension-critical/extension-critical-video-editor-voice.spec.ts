import type { VideoProject } from '../../../../apps/extension/src/features/video/project/types/model';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readNativeVideoProject as readProject } from '../support/native-video-project';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { installSpeechPortFixture, syntheticSpeechWav } from '../support/voiceover-speech-fixture';
import { textModelResponse } from '../support/text-rewrite-fixture';
import { chooseInspectorValue, checkInspectorPaintedFont } from '../support/inspector-utilities';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

async function operate(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
  await button.click();
}
async function verifyOriginalSourceTextFit(
  page: Page,
  owner: Locator,
  capture: (name: string) => string
) {
  const filename = owner.locator('label span.block').first();
  const initial = await filename.evaluate((node) => ({
    text: node.textContent,
    style: node.getAttribute('style'),
  }));
  const rail = page.locator('[data-ui="video-editor.inspector.sections"] nav').first();
  const railBefore = await rail.boundingBox();
  try {
    await filename.evaluate((node) => {
      if (!(node instanceof HTMLElement)) throw new Error('Expected source name');
      node.textContent =
        'Long original filename. Привет Łukasz 中文 ' + 'recording-source-'.repeat(10) + '.webm';
      node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) * 2}px`;
      node.style.lineHeight = '1.3';
    });
    await filename.scrollIntoViewIfNeeded();
    const fit = await filename.evaluate((node) => ({
      fits: node.scrollWidth <= node.clientWidth + 1,
      height: node.getBoundingClientRect().height,
      line: parseFloat(getComputedStyle(node).lineHeight),
    }));
    expect(fit.fits).toBe(true);
    expect(fit.height).toBeGreaterThan(fit.line);
    const railAfter = await rail.boundingBox();
    expect(railAfter?.x).toBe(railBefore?.x);
    expect(railAfter?.y).toBe(railBefore?.y);
    await page.screenshot({ path: capture('original-audio-long-source.png'), fullPage: false });
  } finally {
    await filename.evaluate((node, state) => {
      node.textContent = state.text;
      if (state.style === null) node.removeAttribute('style');
      else node.setAttribute('style', state.style);
    }, initial);
  }
}

async function configureOriginalAudio(
  page: Page,
  voice: Locator,
  project: VideoProject,
  label: (key: Parameters<typeof translate>[0]) => string,
  volume: number,
  capture: (name: string) => string
) {
  const owner = voice.locator('[data-ui="video-editor.original-audio.placement"]');
  await chooseInspectorValue(
    page,
    owner,
    label('videoEditor.sidebar.originalAudio'),
    label(
      volume === 0
        ? 'videoEditor.sidebar.originalAudioMute'
        : 'videoEditor.sidebar.originalAudioAttenuate'
    )
  );
  const sources = owner.getByRole('group', {
    name: label('videoEditor.sidebar.originalAudioSources'),
    exact: true,
  });
  const checkbox = sources.getByRole('checkbox').first();
  await expect(checkbox).not.toBeChecked();
  await operate(checkbox);
  await expect(checkbox).toBeChecked();
  const source = project.clips.find(
    (clip) =>
      (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
      (clip.type !== 'VIDEO' || !clip.muted) &&
      project.assets.find((asset) => asset.id === clip.assetId)?.metadata.hasAudio
  );
  if (!source || (source.type !== 'AUDIO' && source.type !== 'VIDEO'))
    throw new Error('Missing original sound source');
  if (volume > 0) {
    const level = owner.getByRole('textbox', {
      name: label('videoEditor.sidebar.originalAudioLevel'),
      exact: true,
    });
    await level.fill(String(volume * 100));
    await level.press('Tab');
    await checkInspectorPaintedFont(page, level, 'original-audio-level');
  }
  await checkInspectorPaintedFont(
    page,
    sources.locator('label span.block').first(),
    'original-audio-source'
  );
  await owner.scrollIntoViewIfNeeded();
  await page.screenshot({ path: capture('original-audio-placement.png'), fullPage: false });
  if (page.viewportSize()?.width === 1280 && volume > 0)
    await verifyOriginalSourceTextFit(page, owner, capture);
  return {
    volume,
    targets: [{ assetId: source.assetId, sourceInstanceId: source.sourceInstanceId ?? source.id }],
  };
}

async function verifyOriginalAudioRestore(
  page: Page,
  take: Extract<VideoProject['clips'][number], { type: 'AUDIO' }>,
  label: (key: Parameters<typeof translate>[0]) => string,
  capture: (name: string) => string
) {
  await operate(
    page.getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
  );
  await operate(page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]'));
  const target = page.locator(`[data-project-timeline-clip="${take.id}"]`);
  await target.scrollIntoViewIfNeeded();
  await target.click({ modifiers: ['Control'] });
  const summary = page.locator('summary').filter({
    has: page.getByRole('heading', {
      name: label('videoEditor.sidebar.originalAudio'),
      exact: true,
    }),
  });
  if ((await summary.locator('..').getAttribute('open')) === null) await operate(summary);
  const owner = page.locator('[data-ui="video-editor.original-audio.existing"]');
  const level = owner.getByRole('textbox', {
    name: label('videoEditor.sidebar.originalAudioLevel'),
    exact: true,
  });
  await level.fill('45');
  await level.press('Tab');
  await expect
    .poll(async () => {
      const clip = (await readProject(page))?.clips.find((clip) => clip.id === take.id);
      return clip?.type === 'AUDIO' ? clip.originalAudioMute?.volume : undefined;
    })
    .toBe(0.45);
  await owner.scrollIntoViewIfNeeded();
  await page.screenshot({ path: capture('original-audio-existing.png'), fullPage: false });
  const { originalAudioMute: _mute, ...manual } = take;
  await operate(
    owner.getByRole('button', {
      name: label('videoEditor.sidebar.originalAudioRestore'),
      exact: true,
    })
  );
  const volume = page
    .locator('[data-section="audio"]')
    .getByRole('textbox', { name: label('videoEditor.sidebar.volumeLabel'), exact: true });
  await expect(volume).toBeFocused();
  await expect
    .poll(async () => (await readProject(page))?.clips.find((clip) => clip.id === take.id))
    .toEqual(manual);
  await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
  await expect
    .poll(async () => {
      const clip = (await readProject(page))?.clips.find((clip) => clip.id === take.id);
      return clip?.type === 'AUDIO' ? clip.originalAudioMute?.volume : undefined;
    })
    .toBe(0.45);
  await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
  await expect
    .poll(async () => (await readProject(page))?.clips.find((clip) => clip.id === take.id))
    .toEqual(manual);
  await page.reload();
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  expect((await readProject(page))?.clips.find((clip) => clip.id === take.id)).toEqual(manual);
}

async function verifyTrackAudioMaster(
  page: Page,
  trackId: string,
  label: (key: Parameters<typeof translate>[0]) => string,
  capture: (name: string) => string
) {
  const before = await readProject(page);
  const track = before?.tracks.find((track) => track.id === trackId);
  if (!before || !track) throw new Error('Missing AUDIO track');
  const select = page
    .locator('[data-ui="video-editor.timeline.track-select"]')
    .filter({ hasText: track.name })
    .first();
  await operate(select);
  const sections = page.locator('[data-ui="video-editor.inspector.sections"]');
  await operate(
    sections
      .locator('nav')
      .getByRole('button', { name: label('videoEditor.sidebar.inspectorGroupAudio'), exact: true })
  );
  const owner = page.locator('[data-ui="video-editor.inspector.track-audio"]');
  const level = owner.getByRole('textbox', {
    name: label('videoEditor.sidebar.trackVolumeLabel'),
    exact: true,
  });
  for (const percent of [0, 150, 200]) {
    await level.fill(String(percent));
    await level.press('Tab');
    await expect
      .poll(
        async () =>
          (await readProject(page))?.tracks.find((track) => track.id === trackId)?.audioVolume
      )
      .toBe(percent / 100);
  }
  await checkInspectorPaintedFont(page, level, 'track-master');
  expect((await readProject(page))?.clips).toEqual(before.clips);
  const row = select.locator('..');
  await operate(
    row.getByRole('button', { name: label('videoEditor.timeline.trackEditable'), exact: true })
  );
  await expect(level).toBeDisabled();
  await operate(
    row.getByRole('button', { name: label('videoEditor.timeline.trackLocked'), exact: true })
  );
  await expect(level).toBeEnabled();
  for (let index = 0; index < 3; index++)
    await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
  await expect
    .poll(
      async () =>
        (await readProject(page))?.tracks.find((track) => track.id === trackId)?.audioVolume
    )
    .toBe(1.5);
  await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
  await expect(level).toHaveValue('200');
  await level.fill('100');
  await level.press('Tab');
  await expect
    .poll(
      async () =>
        (await readProject(page))?.tracks.find((track) => track.id === trackId)?.audioVolume
    )
    .toBe(1);
  await level.fill('200');
  await level.press('Tab');
  await expect
    .poll(
      async () =>
        (await readProject(page))?.tracks.find((track) => track.id === trackId)?.audioVolume
    )
    .toBe(2);
  const materialsClose = page.locator('[data-ui="video-editor.materials.close"]');
  if (await materialsClose.isVisible()) await operate(materialsClose);
  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
  const original = (await inspector.boundingBox())!.width;
  for (const width of [359, 360, 361, original]) {
    const box = (await handle.boundingBox())!;
    const current = (await inspector.boundingBox())!.width;
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await inspector.boundingBox())!.width))
      .toBe(Math.round(width));
    const fits = await owner.evaluate((node) => {
      const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
      if (!(body instanceof HTMLElement)) throw new Error('Missing inspector scroll owner');
      const bounds = body.getBoundingClientRect();
      return (
        body.scrollWidth <= body.clientWidth + 1 &&
        [...node.querySelectorAll('input,button')].every((control) => {
          const rect = control.getBoundingClientRect();
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        })
      );
    });
    expect(fits).toBe(true);
    await page.screenshot({ path: capture(`track-master-${width}.png`), fullPage: false });
  }
  await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
  await expect(level).toHaveValue('200');
  await page.screenshot({ path: capture('track-master-all-sections.png'), fullPage: false });
  await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
  await page.reload();
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  const reopened = await readProject(page);
  expect(reopened?.version).toBe(7);
  expect(reopened?.tracks.find((track) => track.id === trackId)?.audioVolume).toBe(2);
  expect(reopened?.clips).toEqual(before.clips);
}

async function refuseTakeSave(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let refused = true;
    Object.assign(window, {
      allowVoiceSave: () => {
        refused = false;
      },
    });
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (
        refused &&
        this.name === 'video_projects' &&
        JSON.stringify(value).includes('"textSnapshot"')
      )
        throw new DOMException('Fixture take save refusal', 'QuotaExceededError');
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
}
async function countRequests(page: Page) {
  return page.evaluate(() => {
    const values: unknown = Reflect.get(window, 'speechFixtureRequests');
    return Array.isArray(values) ? values.length : 0;
  });
}
async function verifyVoiceLayout(page: Page, voice: Locator, outputPath: (name: string) => string) {
  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
  const original = (await inspector.boundingBox())!.width;
  for (const width of [359, 360, 361, original]) {
    const box = (await handle.boundingBox())!;
    const current = (await inspector.boundingBox())!.width;
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await inspector.boundingBox())!.width))
      .toBe(Math.round(width));
    expect(await voice.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: outputPath(`voice-inspector-${width}.png`), fullPage: false });
  }
  const toggle = page.locator('[data-ui="video-editor.inspector.presentation-toggle"]');
  await operate(toggle);
  await expect(voice.locator('audio')).toHaveCount(1);
  await voice.getByRole('button').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: outputPath('voice-all-sections.png'), fullPage: false });
  await operate(toggle);
}

async function seedVoiceLibrary(page: Page, body: Buffer) {
  await page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
    const root = await navigator.storage.getDirectory();
    const assets = await root.getDirectoryHandle('sniptale-assets', { create: true });
    const objects = await assets.getDirectoryHandle('objects', { create: true });
    const writer = await (
      await objects.getFileHandle('voice-library', { create: true })
    ).createWritable();
    await writer.write(bytes);
    await writer.close();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['media_library', 'asset_refs', 'asset_owners'], 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    tx.objectStore('asset_refs').put({
      assetId: 'voice-library',
      createdAt: 1,
      mimeType: 'audio/wav',
      size: bytes.length,
      sha256: null,
      location: { kind: 'opfs', objectKey: 'objects/voice-library' },
    });
    tx.objectStore('media_library').put({
      id: 'voice-library',
      source: { kind: 'stored-asset', assetId: 'voice-library' },
      kind: 'audio',
      filename: 'Library narration.wav',
      originalFilename: 'Library narration.wav',
      createdAt: 1,
      updatedAt: 1,
      mimeType: 'audio/wav',
      size: bytes.length,
      duration: 12,
      width: null,
      height: null,
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
      tags: ['voice'],
      workspaceRevision: 0,
    });
    tx.objectStore('asset_owners').put({
      ownerKind: 'media-library',
      ownerId: 'voice-library',
      role: 'source',
      assetId: 'voice-library',
    });
    await done;
    db.close();
  }, body.toString('base64'));
}

async function prepareMicrophoneTake({
  page,
  voice,
  textCategory,
  back,
  label,
  outputPath,
  before,
  interrupted,
}: {
  page: Page;
  voice: Locator;
  textCategory: Locator;
  back: Locator;
  label: (key: Parameters<typeof translate>[0]) => string;
  outputPath: (name: string) => string;
  before: Awaited<ReturnType<typeof readProject>>;
  interrupted: boolean;
}) {
  await operate(
    voice.getByRole('button', {
      name: label('gallery.videoReview.textVoiceMicrophone'),
      exact: true,
    })
  );
  const recording = voice.locator('[data-ui="video-editor.text-voice.recording"]');
  const command = (key: Parameters<typeof translate>[0]) =>
    recording.getByRole('button', {
      name: label(key),
      exact: true,
    });
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        throw new DOMException('Fixture refusal', 'NotAllowedError');
      },
    });
  });
  await operate(command('videoEditor.app.recordAudioStart'));
  await expect(recording.getByRole('alert')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const output = context.createMediaStreamDestination();
        oscillator.connect(output);
        oscillator.start();
        Reflect.set(window, 'voiceFixtureInput', output.stream);
        return output.stream;
      },
    });
  });
  await back.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: outputPath('voice-microphone-setup.png'),
    fullPage: false,
  });
  const playVideo = recording.getByRole('switch', {
    name: label('videoEditor.app.recordAudioPlayVideo'),
    exact: true,
  });
  await expect(playVideo).toBeChecked();
  await playVideo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: outputPath('voice-microphone-options.png'), fullPage: false });
  const counter = page.locator('[data-playback-counter] > span:last-child');
  const initialTime = await counter.textContent();
  await operate(command('videoEditor.app.recordAudioStart'));
  await expect(command('videoEditor.app.recordAudioPause')).toBeVisible();
  await expect.poll(() => counter.textContent()).not.toBe(initialTime);
  await expect(playVideo).toBeDisabled();
  await command('videoEditor.app.recordAudioPause').scrollIntoViewIfNeeded();
  await page.screenshot({ path: outputPath('voice-microphone-monitor.png'), fullPage: false });
  const preview = page.locator('[data-ui="video-editor.workspace.viewer"]');
  expect(
    await preview
      .locator('video')
      .evaluateAll((nodes) => nodes.length > 0 && nodes.every((video) => video.muted))
  ).toBe(true);
  expect(
    await preview.locator('audio').evaluateAll((nodes) => nodes.every((audio) => audio.paused))
  ).toBe(true);
  await operate(
    page.getByRole('button', {
      name: label('videoEditor.sidebar.inspectorGroupCanvas'),
      exact: true,
    })
  );
  await operate(textCategory);
  await expect(command('videoEditor.app.recordAudioResume')).toBeVisible();
  const pausedTime = await counter.textContent();
  await operate(back);
  const discard = page.getByRole('alertdialog');
  await expect(discard).toBeVisible();
  await operate(
    discard.getByRole('button', {
      name: label('videoEditor.app.recordAudioKeep'),
      exact: true,
    })
  );
  await command('videoEditor.app.recordAudioResume').scrollIntoViewIfNeeded();
  const meterBounds = await page.locator('[data-ui="audio-recording.level"]').evaluate((meter) => {
    const bounds = meter.getBoundingClientRect();
    return [...meter.children].every((child) => {
      const rect = child.getBoundingClientRect();
      return (
        rect.left >= bounds.left &&
        rect.right <= bounds.right &&
        child.scrollWidth <= child.clientWidth
      );
    });
  });
  expect(meterBounds).toBe(true);
  await page.screenshot({
    path: outputPath('voice-microphone-paused.png'),
    fullPage: false,
  });
  await expect(counter).toHaveText(pausedTime!);
  await operate(command('videoEditor.app.recordAudioResume'));
  await expect.poll(() => counter.textContent()).not.toBe(pausedTime);
  // Native MediaRecorder requires elapsed media time, rather than a synthetic clock.
  await page.waitForTimeout(1200);
  if (interrupted) {
    await page.evaluate(() => {
      const stream: unknown = Reflect.get(window, 'voiceFixtureInput');
      if (!(stream instanceof MediaStream)) throw new Error('Missing microphone stream fixture');
      stream.getTracks().forEach((track) => track.stop());
    });
  } else {
    await operate(command('videoEditor.app.recordAudioStop'));
  }
  await expect(command('videoEditor.sidebar.textVoiceRecordingNext')).toBeEnabled();
  await expect
    .poll(() =>
      preview.locator('video').evaluateAll((nodes) => nodes.every((video) => video.paused))
    )
    .toBe(true);
  if (interrupted) {
    await command('videoEditor.sidebar.textVoiceRecordingNext').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: outputPath('voice-microphone-interrupted.png'),
      fullPage: false,
    });
  }
  const rawUrl = await recording.locator('audio').getAttribute('src');
  await operate(page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]'));
  await operate(
    page.getByRole('button', {
      name: label('videoEditor.app.newProjectAction'),
      exact: true,
    })
  );
  const projectDialog = page.locator('[data-ui="video-editor.project-name-dialog"]');
  await projectDialog.getByRole('textbox').fill('Discard guard fixture');
  await operate(
    projectDialog.getByRole('button', {
      name: label('videoEditor.app.newProjectAction'),
      exact: true,
    })
  );
  await expect(discard).toBeVisible();
  await discard.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
    await document.fonts.ready;
  });
  await page.screenshot({
    path: outputPath('voice-microphone-navigation-confirmation.png'),
    fullPage: false,
  });

  await operate(
    discard.getByRole('button', {
      name: label('videoEditor.app.recordAudioKeep'),
      exact: true,
    })
  );
  await expect(projectDialog).toHaveCount(0);
  await expect(recording.locator('audio')).toHaveAttribute('src', rawUrl!);
  expect((await readProject(page))?.id).toBe(before?.id);
  await command('videoEditor.sidebar.textVoiceRecordingNext').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: outputPath('voice-microphone-trim.png'),
    fullPage: false,
  });
  const downloaded = page.waitForEvent('download');
  await operate(command('videoEditor.app.recordAudioDownloadOriginal'));
  expect((await downloaded).suggestedFilename()).toMatch(/^audio-.*\.webm$/);
  await operate(command('videoEditor.sidebar.textVoiceRecordingNext'));
  await expect(recording).toHaveCount(0);
  await expect(voice.locator('audio')).toHaveCount(1);
  await expect
    .poll(async () =>
      voice
        .locator('audio')
        .evaluate((node: HTMLAudioElement) => Number.isFinite(node.duration) && node.duration > 0)
    )
    .toBe(true);
  const expectedDuration = await voice
    .locator('audio')
    .evaluate((node: HTMLAudioElement) => node.duration);
  expect((await readProject(page))?.clips).toEqual(before?.clips);
  expect(await countRequests(page)).toBe(0);
  return expectedDuration;
}

for (const input of ['ai', 'file', 'library', 'microphone', 'microphone-interrupted'] as const) {
  const microphone = input === 'microphone' || input === 'microphone-interrupted';
  for (const variant of [
    { size: PRIMARY_BROWSER_VIEWPORTS[0].size, locale: 'en', theme: 'dark' },
    { size: PRIMARY_BROWSER_VIEWPORTS[1].size, locale: 'ru', theme: 'light' },
  ] as const) {
    test(`Montage voice take acceptance ${variant.size.width} ${variant.locale} ${input}`, async ({
      page,
    }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ ...variant.size });
      await page.emulateMedia({ colorScheme: variant.theme });
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: {
            'sniptale-locale-preference': variant.locale,
            'sniptale-theme-preference': variant.theme,
          },
          runtimeResponses: {
            AI_SETTINGS_QUERY:
              input === 'ai'
                ? textModelResponse
                : {
                    ...textModelResponse,
                    modelSelection: {
                      ...textModelResponse.modelSelection,
                      providers: [],
                      models: [],
                    },
                  },
          },
        });
        await page.addInitScript(
          (locale) => localStorage.setItem('sniptale-locale-preference', locale),
          variant.locale
        );
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await seedReviewVideo(page, 'review-vp8-opus.webm', {
          width: 160,
          height: 90,
          duration: 12,
        });
        await page.goto(
          `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?id=beta-v1-recording&theme=${variant.theme}`
        );
        await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
        if (input === 'ai') await installSpeechPortFixture(page);
        await expect
          .poll(async () => (await readProject(page))?.clips.length ?? 0)
          .toBeGreaterThan(0);
        const scene = page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        });
        await operate(scene);
        const textCategory = page.getByRole('button', {
          name: label('videoEditor.sidebar.textDocuments'),
          exact: true,
        });
        await operate(textCategory);
        const text = page.locator('[data-ui="video-editor.text.panel"]');
        await operate(
          text.getByRole('button', {
            name: label('videoEditor.sidebar.newProjectText'),
            exact: true,
          })
        );
        const phrase = 'Historical voice overflow. Привет, мир! Łukasz 中文';
        const editor = text.getByRole('textbox', {
          name: label('gallery.videoReview.speechText'),
          exact: true,
        });
        await editor.fill(phrase);
        await editor.press('Tab');
        await expect
          .poll(
            async () => (await readProject(page))?.textDocuments?.[0]?.document.fragments[0]?.text
          )
          .toBe(phrase);
        const before = await readProject(page);
        await operate(text.locator('[data-project-text-voice]').first());
        const voice = page.locator('[data-ui="video-editor.text-voice.panel"]');
        await expect(voice).toBeVisible();
        const back = voice.getByRole('button', {
          name: label('gallery.videoReview.textVoiceBack'),
          exact: true,
        });
        await expect(back).toBeFocused();
        const requests = input === 'ai' ? 1 : 0;
        let expectedDuration = input === 'ai' ? 3 : 12;
        if (input === 'ai') {
          await voice.locator('.sniptale-ai-model-selector-trigger').click();
          await page.getByRole('button', { name: 'Fixture speech', exact: true }).click();
          await chooseInspectorValue(page, voice, label('gallery.videoReview.speechFormat'), 'WAV');
          await page.evaluate(() => document.fonts.ready);
          expect(await voice.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
          expect(
            await voice
              .locator('input')
              .first()
              .evaluate((node) => getComputedStyle(node).fontFamily)
          ).toContain('Sniptale Text');
          await checkInspectorPaintedFont(page, voice.locator('input').first(), 'input');
          await page.screenshot({ path: info.outputPath('voice-settings.png'), fullPage: false });
          await back.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: info.outputPath('voice-settings-top.png'),
            fullPage: false,
          });
          await operate(
            voice.getByRole('button', {
              name: label('gallery.videoReview.speechGenerate'),
              exact: true,
            })
          );
          await expect(voice.locator('[data-ui="video-editor.text-voice.consent"]')).toContainText(
            'Local speech fixture'
          );
          expect(await countRequests(page)).toBe(0);
          await page.screenshot({ path: info.outputPath('voice-consent.png'), fullPage: false });
          await operate(
            voice.getByRole('button', {
              name: label('gallery.videoReview.speechConsentContinue'),
              exact: true,
            })
          );
        } else if (microphone) {
          expectedDuration = await prepareMicrophoneTake({
            page,
            voice,
            textCategory,
            back,
            label,
            before,
            interrupted: input === 'microphone-interrupted',
            outputPath: (name) => info.outputPath(name),
          });
        } else {
          const body = syntheticSpeechWav(12);
          if (input === 'library') await seedVoiceLibrary(page, body);
          await operate(
            voice.getByRole('button', {
              name: label('gallery.videoReview.textVoiceGallery'),
              exact: true,
            })
          );
          await expect(voice.locator('.sniptale-ai-model-selector-trigger')).toHaveCount(0);
          await operate(
            voice.getByRole('button', {
              name: label('gallery.videoReview.textVoiceChooseAudio'),
              exact: true,
            })
          );
          const picker = page.getByRole('dialog', {
            name: label('gallery.videoReview.textVoiceAudioGallery'),
            exact: true,
          });
          await expect(picker).toBeVisible();
          await picker.evaluate(async (element) => {
            await Promise.all(
              element
                .getAnimations({ subtree: true })
                .filter(
                  (animation) => animation.effect?.getComputedTiming().iterations !== Infinity
                )
                .map((animation) => animation.finished.catch(() => undefined))
            );
            await document.fonts.ready;
          });
          const query = picker.getByRole('searchbox');
          await query.fill('Narration Привет');
          await checkInspectorPaintedFont(page, query, 'input');
          await query.fill('');
          await query.press('Enter');
          await page.screenshot({
            path: info.outputPath('voice-audio-library.png'),
            fullPage: false,
          });
          if (input === 'library') {
            const search = picker.getByRole('searchbox');
            await search.fill('Library narration');
            await search.press('Enter');
            await operate(
              picker.getByRole('button', {
                name: `${label('gallery.videoReview.musicPlay')}: Library narration.wav`,
                exact: true,
              })
            );
            await expect(
              picker.getByRole('button', {
                name: `${label('gallery.videoReview.musicStop')}: Library narration.wav`,
                exact: true,
              })
            ).toBeVisible();
            await operate(
              picker.getByRole('button', {
                name: `${label('gallery.videoReview.musicAdd')}: Library narration.wav`,
                exact: true,
              })
            );
          } else {
            await picker.locator('input[type="file"]').setInputFiles({
              name: 'Computer narration.wav',
              mimeType: 'audio/wav',
              buffer: body,
            });
          }
          await expect(picker).toHaveCount(0);
          await expect(
            voice.getByRole('button', {
              name: label('gallery.videoReview.speechPreview'),
              exact: true,
            })
          ).toBeFocused();
          expect((await readProject(page))?.clips).toEqual(before?.clips);
          expect(await countRequests(page)).toBe(0);
          await page.screenshot({
            path: info.outputPath('voice-local-ready.png'),
            fullPage: false,
          });
        }
        await expect(voice.locator('audio')).toHaveCount(1);
        expect(await countRequests(page)).toBe(requests);
        await operate(
          voice.getByRole('button', {
            name: label('gallery.videoReview.speechPreview'),
            exact: true,
          })
        );
        await expect(
          voice.getByRole('button', {
            name: label('videoEditor.sidebar.textVoiceStop'),
            exact: true,
          })
        ).toBeVisible();
        await expect
          .poll(async () =>
            voice.locator('audio').evaluate((node: HTMLAudioElement) => node.currentTime)
          )
          .toBeGreaterThan(0);
        await operate(
          voice.getByRole('button', {
            name: label('videoEditor.sidebar.textVoiceStop'),
            exact: true,
          })
        );
        expect(
          await voice
            .locator('audio')
            .evaluate((node: HTMLAudioElement) => node.paused && node.currentTime === 0)
        ).toBe(true);
        const originalAudioMute =
          input === 'ai' || input === 'file'
            ? await configureOriginalAudio(
                page,
                voice,
                before!,
                label,
                input === 'ai' ? 0.3 : 0,
                (name) => info.outputPath(name)
              )
            : undefined;
        if (variant.locale === 'ru')
          await verifyVoiceLayout(page, voice, (name) => info.outputPath(name));
        const position = voice.getByRole('textbox', {
          name: label('videoEditor.sidebar.textVoicePosition'),
          exact: true,
        });
        const existingTrack =
          variant.locale === 'ru'
            ? before?.tracks.find((track) => track.kind === 'AUDIO' && !track.locked)
            : undefined;
        const start = existingTrack ? 20 : 6;
        if (existingTrack)
          await chooseInspectorValue(
            page,
            voice,
            label('videoEditor.sidebar.textVoiceTrack'),
            existingTrack.name
          );
        await position.fill(String(start));
        await position.press('Tab');
        // Category navigation unmounts the view, but the mounted session retains its take.
        await operate(
          page.getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupCanvas'),
            exact: true,
          })
        );
        await operate(textCategory);
        await expect(voice.locator('audio')).toHaveCount(1);
        await expect(position).toHaveValue(String(start));
        await page.screenshot({
          path: info.outputPath('voice-audition-placement.png'),
          fullPage: false,
        });
        if (variant.locale === 'en') await refuseTakeSave(page);
        await operate(
          voice.getByRole('button', { name: label('gallery.videoReview.speechApply'), exact: true })
        );
        if (variant.locale === 'en') {
          const retry = voice.getByRole('button', {
            name: label('gallery.videoReview.speechRetrySave'),
            exact: true,
          });
          await expect(retry).toBeEnabled();
          await expect(position).toBeDisabled();
          await page.keyboard.press('Escape');
          await retry.scrollIntoViewIfNeeded();
          await page.screenshot({ path: info.outputPath('voice-save-retry.png'), fullPage: false });
          if (microphone) {
            const download = page.waitForEvent('download');
            await operate(
              voice.getByRole('button', {
                name: label('videoEditor.app.recordAudioDownloadOriginal'),
                exact: true,
              })
            );
            expect((await download).suggestedFilename()).toMatch(/^audio-.*\.webm$/);
          }
          await page.evaluate(() => {
            const allow: unknown = Reflect.get(window, 'allowVoiceSave');
            if (typeof allow !== 'function') throw new Error('Missing Save fixture');
            allow();
          });
          await operate(retry);
        }
        await expect(voice).toContainText(label('videoEditor.sidebar.textVoiceSaved'));
        expect(await countRequests(page)).toBe(requests);
        const accepted = await readProject(page);
        const take = accepted?.clips.find((clip) => clip.type === 'AUDIO' && clip.textSnapshot);
        expect(take).toMatchObject({
          startTime: start,
          duration: expect.closeTo(expectedDuration, 3),
          sourceDuration: expect.closeTo(expectedDuration, 3),
          playbackRate: 1,
          textSnapshot: {
            text: {
              text: phrase,
              kind: input === 'ai' ? 'ai' : microphone ? 'microphone' : 'gallery',
            },
          },
        });
        expect(take?.type === 'AUDIO' ? take.originalAudioMute : undefined).toEqual(
          originalAudioMute
            ? { ...originalAudioMute, volume: expect.closeTo(originalAudioMute.volume, 12) }
            : undefined
        );
        expect(accepted?.clips.filter((clip) => clip.id !== take?.id)).toEqual(before?.clips);
        expect(accepted?.tracks).toHaveLength(
          (before?.tracks.length ?? 0) + (existingTrack ? 0 : 1)
        );
        await page.screenshot({ path: info.outputPath('voice-accepted.png'), fullPage: false });
        await operate(back);
        await expect(text.locator('[data-project-text-voice]').first()).toBeFocused();
        await operate(
          text.locator('article').first().getByRole('button', { expanded: false }).first()
        );
        await editor.fill('Edited after generation');
        await editor.press('Tab');
        await expect
          .poll(
            async () => (await readProject(page))?.textDocuments?.[0]?.document.fragments[0]?.text
          )
          .toBe('Edited after generation');
        expect((await readProject(page))?.clips.find((clip) => clip.id === take?.id)).toEqual(take);
        if (variant.locale === 'en') {
          await page.setViewportSize({ width: 1200, height: 560 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
          ).toBe(true);
          const workspace = page.locator('[data-ui="video-editor.workspace.root"]');
          expect(await workspace.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(
            true
          );
          await workspace.evaluate((node) => {
            node.scrollLeft = node.scrollWidth;
          });
          expect(await workspace.evaluate((node) => node.scrollLeft > 0)).toBe(true);
          await page.screenshot({
            path: info.outputPath('voice-text-edited-narrow.png'),
            fullPage: false,
          });
        }
        await page.reload();
        await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
        const reopened = await readProject(page);
        expect(reopened?.clips.find((clip) => clip.id === take?.id)).toEqual(take);
        await page.setViewportSize({ ...variant.size });
        if (originalAudioMute && take?.type === 'AUDIO')
          await verifyOriginalAudioRestore(page, take, label, (name) => info.outputPath(name));
        if (input === 'ai' && take?.type === 'AUDIO')
          await verifyTrackAudioMaster(page, take.trackId, label, (name) => info.outputPath(name));
        expect(errors).toEqual([]);
      } finally {
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

async function holdSecondBatchRequest(page: Page) {
  await page.evaluate(() => {
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    let starts = 0;
    Reflect.set(window, 'batchSpeechStarts', 0);
    Object.assign(chrome.runtime, {
      connect: (options: { name?: string } = {}) => {
        const port = connect(options);
        const post = port.postMessage.bind(port);
        port.postMessage = (message: unknown) => {
          if (
            typeof message === 'object' &&
            message !== null &&
            Reflect.get(message, 'type') === 'start' &&
            Reflect.get(message, 'operation') === 'speech'
          ) {
            Reflect.set(window, 'batchSpeechStarts', ++starts);
            if (starts === 2) return;
          }
          post(message);
        };
        return port;
      },
    });
  });
}
async function checkBatchTextFont(page: Page, element: Locator) {
  await element.scrollIntoViewIfNeeded();
  await element.evaluate((node) => node.setAttribute('data-batch-text-font', 'true'));
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '[data-batch-text-font]',
    });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    const family = await element.evaluate((node) => getComputedStyle(node).fontFamily);
    expect(
      fonts.some(
        (font) => font.isCustomFont && font.familyName === 'Golos Text VF' && font.glyphCount > 0
      ),
      JSON.stringify({ fonts, family })
    ).toBe(true);
  } finally {
    await session.detach();
    await element.evaluate((node) => node.removeAttribute('data-batch-text-font'));
  }
}
for (const variant of [
  { size: PRIMARY_BROWSER_VIEWPORTS[0].size, locale: 'en', theme: 'dark' },
  { size: PRIMARY_BROWSER_VIEWPORTS[1].size, locale: 'ru', theme: 'light' },
] as const) {
  test(`Montage batch voice inspector ${variant.size.width} ${variant.locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ ...variant.size });
    await page.emulateMedia({ colorScheme: variant.theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const phrases = ['Batch first overflow. Привет, мир!', 'Batch second. Łukasz 中文'];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
        runtimeResponses: { AI_SETTINGS_QUERY: textModelResponse },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?id=beta-v1-recording&theme=${variant.theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await installSpeechPortFixture(page);
      await holdSecondBatchRequest(page);
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      const category = page.getByRole('button', {
        name: label('videoEditor.sidebar.textDocuments'),
        exact: true,
      });
      await operate(category);
      const text = page.locator('[data-ui="video-editor.text.panel"]');
      for (const phrase of phrases) {
        await operate(
          text.getByRole('button', {
            name: label('videoEditor.sidebar.newProjectText'),
            exact: true,
          })
        );
        const editor = text.getByRole('textbox', {
          name: label('gallery.videoReview.speechText'),
          exact: true,
        });
        await editor.fill(phrase);
        await editor.press('Tab');
        const end = text.getByRole('textbox', {
          name: label('gallery.videoReview.textFragmentEnd'),
          exact: true,
        });
        await end.fill('1');
        await end.press('Tab');
      }
      await expect
        .poll(async () =>
          (await readProject(page))?.textDocuments?.[0]?.document.fragments.map((item) => item.text)
        )
        .toEqual(phrases);
      const before = await readProject(page);
      await operate(
        text.getByRole('button', { name: label('gallery.videoReview.speechBatch'), exact: true })
      );
      await operate(
        text.getByRole('button', {
          name: label('gallery.videoReview.textFragmentSelectFound'),
          exact: true,
        })
      );
      await operate(text.locator('[data-project-text-voice="selected"]'));
      const voice = page.locator('[data-ui="video-editor.text-voice.panel"]');
      const scope = voice.locator('[data-ui="video-editor.text-voice.batch"]');
      await expect(scope.locator('[data-project-voice-take]')).toHaveCount(2);
      await voice.locator('.sniptale-ai-model-selector-trigger').click();
      await page.getByRole('button', { name: 'Fixture speech', exact: true }).click();
      await chooseInspectorValue(page, voice, label('gallery.videoReview.speechFormat'), 'WAV');
      const generate = voice.getByRole('button', {
        name: label('gallery.videoReview.speechGenerateSelected'),
        exact: true,
      });
      await operate(generate);
      for (const phrase of phrases) await expect(scope).toContainText(phrase);
      expect(await countRequests(page)).toBe(0);
      await scope.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('batch-consent.png'), fullPage: false });
      const approve = () =>
        operate(
          voice.getByRole('button', {
            name: label('gallery.videoReview.speechConsentContinue'),
            exact: true,
          })
        );
      await approve();
      await expect
        .poll(() => page.evaluate(() => Reflect.get(window, 'batchSpeechStarts')))
        .toBe(2);
      await expect(voice.getByRole('status')).toContainText('1 / 2');
      await expect(voice.locator('audio')).toHaveCount(1);
      await voice.getByRole('status').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('batch-partial.png'), fullPage: false });
      await operate(
        voice.getByRole('button', { name: label('common.actions.cancel'), exact: true })
      );
      await expect(generate).toBeEnabled();
      await operate(generate);
      await expect(scope).toContainText(phrases[1]!);
      await expect(scope).not.toContainText(phrases[0]!);
      expect(await countRequests(page)).toBe(1);
      await approve();
      await expect.poll(() => countRequests(page)).toBe(2);
      await expect(generate).toHaveCount(0);
      const rows = scope.locator('[data-project-voice-take]');
      await expect(rows).toHaveCount(2);
      const position = voice.getByRole('textbox', {
        name: label('videoEditor.sidebar.textVoicePosition'),
        exact: true,
      });
      for (let index = 0; index < phrases.length; index++) {
        await operate(rows.nth(index).getByRole('button'));
        await expect
          .poll(() => voice.locator('audio').evaluate((node) => node.duration))
          .toBe(index === 0 ? 3 : 1);
        await operate(
          voice.getByRole('button', {
            name: label('gallery.videoReview.speechPreview'),
            exact: true,
          })
        );
        await expect.poll(() => voice.locator('audio').evaluate((node) => node.paused)).toBe(false);
        await operate(
          voice.getByRole('button', {
            name: label('videoEditor.sidebar.textVoiceStop'),
            exact: true,
          })
        );
        await configureOriginalAudio(page, voice, before!, label, index === 0 ? 0.3 : 0, (name) =>
          info.outputPath(`batch-${index}-${name}`)
        );
        await position.fill(String(index === 0 ? 6 : 20));
        await position.press('Tab');
      }
      await checkBatchTextFont(page, rows.first().locator('[data-project-voice-text]'));
      await checkBatchTextFont(page, voice.locator('[data-ui="video-editor.text-voice.text"]'));
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupCanvas'),
          exact: true,
        })
      );
      await operate(category);
      await expect(position).toHaveValue('20');
      if (variant.locale === 'ru')
        await verifyVoiceLayout(page, voice, (name) => info.outputPath(`batch-${name}`));
      await refuseTakeSave(page);
      await operate(
        voice.getByRole('button', {
          name: label('gallery.videoReview.speechApplySelected'),
          exact: true,
        })
      );
      const retry = voice.getByRole('button', {
        name: label('gallery.videoReview.speechRetrySave'),
        exact: true,
      });
      await expect(retry).toBeEnabled();
      await expect(position).toBeDisabled();
      await expect(rows.locator('input[type=checkbox]').first()).toBeDisabled();
      await page.keyboard.press('Escape');
      await retry.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('batch-save-retry.png'), fullPage: false });
      await page.evaluate(() => {
        const allow: unknown = Reflect.get(window, 'allowVoiceSave');
        if (typeof allow !== 'function') throw new Error('Missing Save fixture');
        allow();
      });
      await operate(retry);
      await expect(voice).toContainText(label('videoEditor.sidebar.textVoiceSaved'));
      const accepted = await readProject(page);
      const takes = accepted?.clips.filter((clip) => clip.type === 'AUDIO' && clip.textSnapshot);
      expect(takes?.map((clip) => [clip.startTime, clip.duration])).toEqual([
        [6, 3],
        [20, 1],
      ]);
      expect(
        takes?.map((clip) => (clip.type === 'AUDIO' ? clip.originalAudioMute?.volume : undefined))
      ).toEqual([expect.closeTo(0.3, 12), 0]);
      expect(new Set(takes?.map((clip) => clip.trackId)).size).toBe(2);
      expect(accepted?.clips.filter((clip) => !takes?.some((take) => take.id === clip.id))).toEqual(
        before?.clips
      );
      expect(await countRequests(page)).toBe(2);
      await page.screenshot({ path: info.outputPath('batch-accepted.png'), fullPage: false });
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect
        .poll(
          async () =>
            (await readProject(page))?.clips.filter(
              (clip) => clip.type === 'AUDIO' && clip.textSnapshot
            ).length
        )
        .toBe(0);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
      await expect
        .poll(async () =>
          (await readProject(page))?.clips
            .filter((clip) => clip.type === 'AUDIO' && clip.textSnapshot)
            .map((clip) => clip.id)
        )
        .toEqual(takes?.map((clip) => clip.id));
      await operate(
        voice.getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
      );
      await expect(text.locator('[data-project-text-voice="selected"]')).toBeFocused();
      await page.setViewportSize({ width: 1200, height: 560 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.setViewportSize({ ...variant.size });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(
        (await readProject(page))?.clips.filter((clip) =>
          takes?.some((take) => take.id === clip.id)
        )
      ).toEqual(takes);
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
