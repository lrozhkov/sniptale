import type { EditorVectorSettings } from '../../../composition/persistence/vector-elements/contracts';
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
