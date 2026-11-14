import {
  DEFAULT_EDITOR_VECTOR_SOURCE,
  type EditorVectorSettings,
} from '../../../composition/persistence/vector-elements/contracts';
import type { EditorVectorLibrary } from '../../../composition/persistence/vector-elements/library';
import { SupersededAssetPublicationError } from '../../../composition/persistence/assets/publication';
import { EditorVectorCatalogError } from '../../../features/editor/vector-catalog';

/** Requests a trusted-click grant before any await, then checks the captured settings revision. */
export async function authorizeEditorVectorSource(input: {
  baseUrl: string;
  disclosureAccepted: boolean;
  accepted: EditorVectorSettings | null;
  requestPermission(baseUrl: string): Promise<boolean>;
  readSettings(): Promise<EditorVectorSettings>;
  isAlive(): boolean;
}): Promise<EditorVectorSettings | null> {
  const accepted = input.accepted;
  if (!input.disclosureAccepted || !accepted) return null;
  const granted = input.requestPermission(input.baseUrl);
  if (!(await granted)) throw new EditorVectorCatalogError('permission-required');
  const current = await input.readSettings();
  if (
    !input.isAlive() ||
    current.incarnation !== accepted.incarnation ||
    current.revision !== accepted.revision
  )
    return null;
  return accepted;
}

/** Activate the default source through its existing revision-checked settings command. */
export async function activateDefaultEditorVectorSource(
  library: Pick<EditorVectorLibrary, 'readSettings' | 'updateSettings'>
): Promise<EditorVectorSettings> {
  const settings = await library.readSettings();
  if (
    settings.incarnation !== 'unconfigured' ||
    settings.revision !== 0 ||
    settings.baseUrl !== DEFAULT_EDITOR_VECTOR_SOURCE ||
    !settings.networkEnabled ||
    !settings.disclosureAccepted
  )
    return settings;
  try {
    return await library.updateSettings({}, settings);
  } catch (error) {
    if (!(error instanceof SupersededAssetPublicationError)) throw error;
    // A competing initializer or Settings command can establish authority first.
    // Adopt its result without replaying a write over its source or network choice.
    let current: EditorVectorSettings;
    try {
      current = await library.readSettings();
    } catch {
      throw error;
    }
    if (current.incarnation === 'unconfigured') throw error;
    return current;
  }
}
