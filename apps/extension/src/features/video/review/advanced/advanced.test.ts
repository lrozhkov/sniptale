import { expect, it } from 'vitest';
import { createCameraFollowSettings } from '../../project/camera/cursor-policy';
import { createQuickEditAdvancedState, createQuickEditAdvancedContent } from './defaults';
import { loadQuickEditAdvancedState, loadQuickEditAdvancedContentState } from './validation';

it('retains defaults and local camera policy through native serialization and history admission', () => {
  const content = {
    ...createQuickEditAdvancedContent(),
    cameraFollowDefaults: createCameraFollowSettings('calm'),
    zoom: {
      enabled: true,
      regions: [
        {
          id: 'camera',
          start: 0,
          end: 2,
          followCursor: true,
          cameraFollow: createCameraFollowSettings('fast'),
          transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
          enter: { type: 'none', duration: 0 },
          exit: { type: 'none', duration: 0 },
        },
      ],
    },
  };
  const reopened = loadQuickEditAdvancedContentState(JSON.parse(JSON.stringify(content)));
  expect(reopened).toEqual(content);
  expect(loadQuickEditAdvancedContentState(reopened)).toEqual(reopened);
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 19 })).toBeNull();
  expect(
    loadQuickEditAdvancedContentState({
      ...content,
      cameraFollowDefaults: { transitionDuration: 0.5 },
    })
  ).toBeNull();
});

it('continues reading the released schema nineteen without inserting new policy', () => {
  const previous = { ...createQuickEditAdvancedContent(), schemaVersion: 19 };
  expect(loadQuickEditAdvancedContentState(previous)).toEqual({
    ...previous,
    schemaVersion: createQuickEditAdvancedContent().schemaVersion,
  });
});

it('preserves theme workspace colors, rejects malformed colors, and leaves legacy UI absent', () => {
  const state = createQuickEditAdvancedState();
  expect(
    loadQuickEditAdvancedState({ ...state, schemaVersion: 21 })?.ui.workspaceColors
  ).toBeUndefined();
  const value = {
    ...state,
    ui: { ...state.ui, workspaceColors: { light: '#abcdef', dark: '#123456' } },
  };
  expect(loadQuickEditAdvancedState(JSON.parse(JSON.stringify(value)))?.ui.workspaceColors).toEqual(
    { light: '#abcdefff', dark: '#123456ff' }
  );
  for (const workspaceColors of [null, [], { light: 'url(https://example.com)' }, { dark: 3 }]) {
    expect(
      loadQuickEditAdvancedState({ ...state, ui: { ...state.ui, workspaceColors } })
    ).toBeNull();
  }
});

it('roundtrips lane masters and locks without adding defaults to legacy UI', () => {
  const state = createQuickEditAdvancedState();
  expect(loadQuickEditAdvancedState(state)?.ui.lockedTracks).toBeUndefined();
  const ui = {
    ...state.ui,
    lockedTracks: { source: true, text: false },
    tracks: {
      ...state.ui.tracks,
      text: false,
      originalAudio: false,
      music: true,
      voiceover: false,
    },
  };
  expect(loadQuickEditAdvancedState(JSON.parse(JSON.stringify({ ...state, ui })))?.ui).toEqual(ui);
  expect(loadQuickEditAdvancedState({ ...state, ui: { ...ui, lockedTracks: [] } })).toBeNull();
  expect(
    loadQuickEditAdvancedState({ ...state, ui: { ...ui, lockedTracks: { source: 'yes' } } })
  ).toBeNull();
  expect(
    loadQuickEditAdvancedState({ ...state, ui: { ...ui, tracks: { ...ui.tracks, music: 1 } } })
  ).toBeNull();
});

it('retains audio snapshots in schema 31 without silently admitting them in historical schemas', () => {
  const base = createQuickEditAdvancedContent();
  const audioProcessing = { version: 1 as const, bypassed: false, effects: [] };
  const clip = {
    id: 'take',
    assetId: 'audio',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    audioProcessing,
  };
  for (const audio of [
    { ...base.audio, original: { ...base.audio.original, audioProcessing } },
    { ...base.audio, voiceover: [clip] },
    { ...base.audio, music: [clip] },
  ]) {
    const content = { ...base, audio };
    expect(content.schemaVersion).toBe(35);
    expect(loadQuickEditAdvancedContentState(JSON.parse(JSON.stringify(content)))).toEqual(content);
    expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 31 })).toEqual(content);
    expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 30 })).toBeNull();
  }
  expect(loadQuickEditAdvancedContentState({ ...base, schemaVersion: 30 })).toEqual(base);
  const invalid = {
    ...base,
    audio: {
      ...base.audio,
      original: {
        ...base.audio.original,
        audioProcessing: { ...audioProcessing, script: 'forbidden' },
      },
    },
  };
  expect(loadQuickEditAdvancedContentState(invalid)).toBeNull();
});

it('admits authored interaction timelines only from schema 32 and preserves historical empty content', () => {
  const base = createQuickEditAdvancedContent();
  const interactionTimeline = {
    presses: [
      {
        id: 'key',
        family: 'keyboard',
        start: 1,
        end: 2,
        label: 'Cmd+K',
        keys: ['Cmd', 'K'],
        button: 0,
        x: 0.5,
        y: 0.5,
      },
    ],
    overrides: [],
  };
  const candidate = { ...base, interactionTimeline };
  expect(loadQuickEditAdvancedContentState(JSON.parse(JSON.stringify(candidate)))).toEqual(
    candidate
  );
  expect(loadQuickEditAdvancedContentState({ ...candidate, schemaVersion: 31 })).toBeNull();
  expect(loadQuickEditAdvancedContentState({ ...base, schemaVersion: 31 })).toEqual(base);
  expect(
    loadQuickEditAdvancedContentState({
      ...base,
      interactionTimeline: {
        ...interactionTimeline,
        presses: [{ ...interactionTimeline.presses[0], x: Infinity }],
      },
    })
  ).toBeNull();
});
