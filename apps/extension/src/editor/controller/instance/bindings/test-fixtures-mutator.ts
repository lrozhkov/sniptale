import type { Rect } from 'fabric';
import type { EditorObjectType } from '../../../../features/editor/document/types';
import type { CropSelection, DrawSession, PanSession } from '../../core/types';
import type { SourceState } from '../../../document/model/source-state';
import { createMockDocument } from './test-fixtures-document';
import { createMockHistory } from './test-fixtures-history';

export function createMockMutatorFixtures() {
  return {
    cropGuide: { kind: 'crop' } as unknown as Rect,
    cropSelection: { kind: 'selection' } as unknown as CropSelection,
    document: createMockDocument(),
    drawSession: { tool: 'arrow' } as unknown as DrawSession,
    history: createMockHistory(),
    panSession: { kind: 'pan' } as unknown as PanSession,
    source: { kind: 'image' } as unknown as SourceState,
  };
}

export function getExpectedLabelIndexType(): EditorObjectType {
  return 'text' as EditorObjectType;
}
