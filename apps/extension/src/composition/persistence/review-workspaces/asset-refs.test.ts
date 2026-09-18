import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectReviewAssetReferences, remapReviewAssetReferences } from './asset-refs';
import type { VideoWorkspaceSnapshot } from './contracts';
import type { QuickEditAdvancedState } from '../../../features/video/review/advanced/types';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION } from '../../../features/video/review/advanced/types';

vi.mock('../infrastructure/indexed-db/core', () => ({}));

const advanced = (patch: Partial<QuickEditAdvancedState>): QuickEditAdvancedState => ({
  schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
  ui: { mode: 'basic', tracks: { actions: true, zoom: false, audio: false } },
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
    expect(collectReviewAssetReferences(snapshot as unknown as VideoWorkspaceSnapshot)).toEqual(
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
    expect(collectReviewAssetReferences(empty as unknown as VideoWorkspaceSnapshot)).toEqual(
      new Set()
    );
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
    } as unknown as VideoWorkspaceSnapshot;
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
});
