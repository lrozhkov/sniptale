import type { FabricObject } from 'fabric';

import type { SourceState } from '../../../../document/model/source-state';
import { syncSourceStateFromObject } from '../../../document/source';

export function updateSourceAndSync(
  source: SourceState | null,
  object: FabricObject | null,
  setSource: (source: SourceState | null) => void,
  commitHistory: () => void,
  syncRuntimeState: () => void
): void {
  if (!object) {
    return;
  }

  setSource(syncSourceStateFromObject(source, object));
  commitHistory();
  syncRuntimeState();
}
