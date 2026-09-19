import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectReviewAssetReferences,
  decodePortableReviewAssetRefs,
  encodePortableReviewAssetRefs,
  remapReviewAssetReferences,
} from './asset-refs';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace, VideoWorkspaceSnapshot } from './contracts';
import type { QuickEditAdvancedState } from '../../../features/video/review/advanced/types';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION } from '../../../features/video/review/advanced/types';

vi.mock('../infrastructure/indexed-db/core', () => ({}));

const advanced = (patch: Partial<QuickEditAdvancedState>): QuickEditAdvancedState => ({
  schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
  ui: {
    mode: 'basic',
    tracks: { actions: true, zoom: false, audio: false },
    overlaysVisible: true,
  },
  zoom: { enabled: false, regions: [] },
  background: { enabled: false },
  audio: { original: { muted: false, volume: 1 }, voiceover: [], music: [] },
  ...patch,
});

afterEach(() => vi.clearAllMocks());

describe('collectReviewAssetReferences', () => {
  it('collects every audio lane reference and recovery copy reference', () => {
    const snapshot = {
      workspace: {
        aggregateId: 'recording:a',
        sourceAssetId: 'asset:1',
        advanced: advanced({
          audio: {
            original: { muted: false, volume: 1 },
            voiceover: [
              {
                id: 'v',
                assetId: 'project-asset:voice',
                timelineStart: 0,
                sourceOffset: 0,
                duration: 1,
                volume: 1,
                muted: false,
                fadeIn: 0,
                fadeOut: 0,
              },
            ],
            music: [
              {
                id: 'm',
                assetId: 'project-asset:music',
                timelineStart: 0,
                sourceOffset: 0,
                duration: 1,
                volume: 1,
                muted: false,
                fadeIn: 0,
                fadeOut: 0,
              },
            ],
          },
          recoveryV1: JSON.stringify({
            schemaVersion: 1,
            audio: {
              original: { muted: false, volume: 1 },
              voiceover: [],
              music: [{ assetId: 'project-asset:v1music', timelineStart: 0, duration: 1 }],
            },
          }),
        }),
      },
      draft: null,
    };
    expect(collectReviewAssetReferences(snapshot.workspace as VideoWorkspace)).toEqual(
      new Set(['project-asset:voice', 'project-asset:music', 'project-asset:v1music'])
    );
  });

  it('returns nothing for a workspace without advanced audio', () => {
    const empty = {
      workspace: {
        aggregateId: 'recording:a',
        sourceAssetId: 'asset:1',
        advanced: advanced({}),
      },
      draft: null,
    };
    expect(collectReviewAssetReferences(empty.workspace as VideoWorkspace)).toEqual(new Set());
  });
});

describe('remapReviewAssetReferences', () => {
  it('replaces lane references in the advanced state and the raw recovery copy', () => {
    const withRefs = advanced({
      audio: {
        original: { muted: false, volume: 1 },
        voiceover: [],
        music: [
          {
            id: 'm',
            assetId: 'project-asset:music',
            timelineStart: 1,
            sourceOffset: 0,
            duration: 2,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
        ],
      },
      recoveryV1: JSON.stringify({
        schemaVersion: 1,
        audio: {
          original: { muted: false, volume: 1 },
          voiceover: [{ assetId: 'project-asset:old-voice', timelineStart: 0, duration: 1 }],
          music: [{ assetId: 'project-asset:music', timelineStart: 0, duration: 1 }],
        },
      }),
    });
    const snapshot = {
      workspace: {
        aggregateId: 'recording:a',
        sourceAssetId: 'asset:1',
        advanced: withRefs,
      },
      draft: null,
    } as VideoWorkspaceSnapshot;
    // Nothing matches: the same reference object is returned unchanged.
    expect(
      remapReviewAssetReferences(
        snapshot,
        new Map([['project-asset:unrelated', 'project-asset:x']])
      )
    ).toBe(snapshot);
    const result = remapReviewAssetReferences(
      snapshot,
      new Map([
        ['project-asset:music', 'project-asset:music2'],
        ['project-asset:old-voice', 'project-asset:old-voice2'],
      ])
    );
    expect(result).not.toBe(snapshot);
    expect(result.workspace.advanced.audio.music[0]!.assetId).toBe('project-asset:music2');
    const recovered = JSON.parse(result.workspace.advanced.recoveryV1!) as {
      audio: { music: { assetId: string }[]; voiceover: { assetId: string }[] };
    };
    expect(recovered.audio.music[0]!.assetId).toBe('project-asset:music2');
    expect(recovered.audio.voiceover[0]!.assetId).toBe('project-asset:old-voice2');
    expect(result.workspace.sourceAssetId).toBe(snapshot.workspace.sourceAssetId);
    expect(snapshot.workspace.advanced.audio.music[0]!.assetId).toBe('project-asset:music');
  });

  it('accepts bare stored entry ids in the restored asset map', () => {
    const withRefs = advanced({
      audio: {
        original: { muted: false, volume: 1 },
        voiceover: [],
        music: [
          {
            id: 'm',
            assetId: 'project-asset:music',
            timelineStart: 1,
            sourceOffset: 0,
            duration: 2,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
        ],
      },
    });
    const snapshot = {
      workspace: { aggregateId: 'recording:a', sourceAssetId: 'asset:1', advanced: withRefs },
      draft: null,
    } as VideoWorkspaceSnapshot;
    const result = remapReviewAssetReferences(snapshot, new Map([['music', 'restored-music']]));
    expect(result.workspace.advanced.audio.music[0]!.assetId).toBe('project-asset:restored-music');
  });
});

it('collects, remaps, and portably encodes audio refs inside advancedContent history ops', () => {
  const audio = (assetId: string) => ({
    original: { muted: false, volume: 1 },
    voiceover: [
      {
        id: 'v1',
        assetId,
        timelineStart: 0,
        sourceOffset: 0,
        duration: 1,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
    ],
    music: [],
  });
  const content = (assetId: string) => ({
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    zoom: { enabled: false, regions: [] },
    background: { enabled: false },
    audio: audio(assetId),
  });
  const snapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 5 },
      revision: 2,
      cursor: 1,
      advanced: { ...createQuickEditAdvancedState(), audio: audio('project-asset:take') },
      history: [
        {
          id: 'op1',
          at: 2,
          target: 'advancedContent' as const,
          before: content('project-asset:take'),
          after: content('project-asset:music'),
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    },
    draft: null,
  } as unknown as VideoWorkspaceSnapshot;
  const references = collectReviewAssetReferences(snapshot.workspace);
  expect([...references]).toEqual(['project-asset:take', 'project-asset:music']);
  const map = new Map([
    ['take', 'restored-take'],
    ['music', 'restored-music'],
  ]);
  const remapped = remapReviewAssetReferences(snapshot, map);
  const op = remapped.workspace.history[0] as {
    target: string;
    before: { audio: { voiceover: { assetId: string }[] } };
    after: { audio: { voiceover: { assetId: string }[] } };
  };
  expect(op.before.audio.voiceover[0]!.assetId).toBe('project-asset:restored-take');
  expect(op.after.audio.voiceover[0]!.assetId).toBe('project-asset:restored-music');
  const portable = encodePortableReviewAssetRefs(remapped) as {
    workspace: {
      history: { before: { audio: { voiceover: { assetRef?: string; assetId?: string }[] } } }[];
    };
  };
  expect(portable.workspace.history[0]!.before.audio.voiceover[0]!.assetRef).toBe(
    'project-asset:restored-take'
  );
  const restoredWorkspace = decodePortableReviewAssetRefs(portable.workspace) as {
    history: { before: { audio: { voiceover: { assetId: string }[] } } }[];
  };
  expect(restoredWorkspace.history[0]!.before.audio.voiceover[0]!.assetId).toBe(
    'project-asset:restored-take'
  );
});
