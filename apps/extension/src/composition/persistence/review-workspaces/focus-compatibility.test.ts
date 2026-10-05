import { describe, expect, it } from 'vitest';
import {
  createQuickEditAdvancedContent,
  createQuickEditAdvancedState,
} from '../../../features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../../features/video/review/advanced/zoom';
import { createQuickEditBorder } from '../../../features/video/review/advanced/border';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION } from '../../../features/video/review/advanced/types';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { parseVideoWorkspace } from './parser';
import { parsePortableVideoReview, prepareVideoReviewRestore } from './backup-restore';

function legacyWorkspace(cursor: number) {
  const before = { ...createQuickEditAdvancedContent(), schemaVersion: 2 };
  const after = {
    ...before,
    zoom: { enabled: true, regions: [createQuickEditZoomRegion({ id: 'old-zoom', at: 1 })] },
  };
  return {
    aggregateId: 'recording:focus-compatibility',
    sourceAssetId: 'source-asset',
    formatVersion: 1,
    source: { duration: 10, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
    revision: 2,
    createdAt: 1,
    updatedAt: 2,
    cursor,
    advanced: { ...createQuickEditAdvancedState(), schemaVersion: 2 },
    history: [{ id: 'old-operation', at: 2, target: 'advancedContent', before, after }],
  };
}

describe('Focus payload compatibility through workspace and archive boundaries', () => {
  it.each([0, 1])(
    'normalizes v2 baseline and retained undo/redo content at cursor %i',
    (cursor) => {
      const legacy = legacyWorkspace(cursor);
      const workspace = parseVideoWorkspace(legacy);
      expect(workspace).not.toBeNull();
      expect(legacy.advanced.schemaVersion).toBe(2);
      expect(workspace!.advanced.schemaVersion).toBe(QUICK_EDIT_ADVANCED_SCHEMA_VERSION);
      expect(workspace!.history[0]).toMatchObject({
        before: { schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION },
        after: { schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION },
      });
      const baseline = reviewAdvancedContentBaseline(workspace!.advanced);
      expect(
        replayReviewHistory(workspace!.history, 0, workspace!.source, baseline).advancedContent.zoom
          .regions
      ).toHaveLength(0);
      expect(
        replayReviewHistory(workspace!.history, 1, workspace!.source, baseline).advancedContent.zoom
          .regions[0]?.id
      ).toBe('old-zoom');
      expect(parseVideoWorkspace(JSON.parse(JSON.stringify(workspace)))).toEqual(workspace);
    }
  );

  it('preserves Border and overlapping focus across portable restore and history replay', () => {
    const workspace = parseVideoWorkspace(legacyWorkspace(1))!;
    const before = replayReviewHistory(
      workspace.history,
      1,
      workspace.source,
      reviewAdvancedContentBaseline(workspace.advanced)
    ).advancedContent;
    const border = {
      ...createQuickEditZoomRegion({ id: 'border', at: 1 }),
      border: {
        ...createQuickEditBorder(),
        reveal: 'draw-ccw' as const,
        exitReveal: 'erase-ccw' as const,
        segmentPercent: 65,
      },
    };
    const after = { ...before, zoom: { enabled: true, regions: [...before.zoom.regions, border] } };
    const next = {
      ...workspace,
      cursor: 2,
      history: [
        ...workspace.history,
        { id: 'border-operation', at: 3, target: 'advancedContent' as const, before, after },
      ],
    };
    const { sourceAssetId: _source, ...portable } = next;
    const review = parsePortableVideoReview({ workspace: portable, draft: null }, next.aggregateId);
    const restored = prepareVideoReviewRestore({
      review,
      sourceAggregateId: next.aggregateId,
      targetAggregateId: 'recording:restored',
      sourceAssetId: 'restored-source',
    });
    const parsed = parseVideoWorkspace(restored.workspace)!;
    expect(parsed).not.toBeNull();
    const document = replayReviewHistory(
      parsed.history,
      parsed.cursor,
      parsed.source,
      reviewAdvancedContentBaseline(parsed.advanced)
    );
    expect(document.advancedContent.zoom.regions).toEqual(after.zoom.regions);
    expect(parseVideoWorkspace(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(
      replayReviewHistory(
        parsed.history,
        1,
        parsed.source,
        reviewAdvancedContentBaseline(parsed.advanced)
      ).advancedContent.zoom.regions
    ).toHaveLength(1);
  });

  it('normalizes retained Border segment size in baseline and redo without altering authored timing', () => {
    const { segmentPercent: _newSize, ...oldBorder } = createQuickEditBorder();
    const region = {
      ...createQuickEditZoomRegion({ id: 'retained', at: 1 }),
      border: oldBorder,
    };
    const content = {
      ...createQuickEditAdvancedContent(),
      zoom: { enabled: true, regions: [region] },
    };
    const raw = {
      ...legacyWorkspace(0),
      advanced: { ...createQuickEditAdvancedState(), zoom: content.zoom },
      history: [
        {
          id: 'retained-operation',
          at: 2,
          target: 'advancedContent',
          before: content,
          after: {
            ...content,
            zoom: { enabled: true, regions: [{ ...region, border: { ...oldBorder, width: 6 } }] },
          },
        },
      ],
    };
    const parsed = parseVideoWorkspace(raw)!;
    expect(parsed).not.toBeNull();
    expect(parsed.advanced.zoom.regions[0]?.border?.segmentPercent).toBe(25);
    const replayed = replayReviewHistory(
      parsed.history,
      1,
      parsed.source,
      reviewAdvancedContentBaseline(parsed.advanced)
    );
    expect(replayed.advancedContent.zoom.regions[0]).toMatchObject({
      border: { segmentPercent: 25 },
      enter: region.enter,
      exit: region.exit,
    });
    expect(parseVideoWorkspace(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(
      parseVideoWorkspace({
        ...raw,
        advanced: {
          ...raw.advanced,
          zoom: {
            enabled: true,
            regions: [{ ...region, border: { ...oldBorder, segmentPercent: 101 } }],
          },
        },
      })
    ).toBeNull();
  });

  it('rejects unsupported future content even in the unapplied redo suffix', () => {
    const raw = legacyWorkspace(0);
    raw.history[0]!.after.schemaVersion = 999;
    expect(parseVideoWorkspace(raw)).toBeNull();
    const { sourceAssetId: _source, ...portable } = raw;
    expect(() =>
      parsePortableVideoReview({ workspace: portable, draft: null }, raw.aggregateId)
    ).toThrow();
  });
});
