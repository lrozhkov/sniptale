import type { AssetOwner, AssetRef, PhysicalDeleteAssetOperation } from '../assets';
import type { PersistedEditorDocument } from './contracts';

interface EditorDocumentAssetStores {
  owners: {
    delete?: ((key: [string, string, string]) => Promise<unknown>) | undefined;
    index?: ((name: 'assetId') => { count(assetId: string): Promise<number> }) | undefined;
    put?: ((owner: AssetOwner) => Promise<unknown>) | undefined;
  };
  refs: {
    delete?: ((assetId: string) => Promise<unknown>) | undefined;
    put?: ((ref: AssetRef) => Promise<unknown>) | undefined;
  };
}

export function editorDocumentAssetIds(document: PersistedEditorDocument): string[] {
  return [...new Set(document.assets.map((asset) => asset.assetId))];
}

export async function replaceEditorDocumentAssetOwnership(args: {
  nextDocument: Pick<PersistedEditorDocument, 'assets'>;
  nextRefs: readonly AssetRef[];
  ownerId: string;
  ownerKind: string;
  previousDocument: Pick<PersistedEditorDocument, 'assets'> | null;
  physicalDelete: PhysicalDeleteAssetOperation;
  stores: EditorDocumentAssetStores;
}): Promise<void> {
  const nextByRole = new Map(args.nextDocument.assets.map((asset) => [asset.role, asset]));
  const previousByRole = new Map(
    (args.previousDocument?.assets ?? []).map((asset) => [asset.role, asset])
  );
  const previousAssetIds = new Set(
    (args.previousDocument?.assets ?? []).map((asset) => asset.assetId)
  );
  if (nextByRole.size !== args.nextDocument.assets.length)
    throw new Error('Editor asset owner roles must be unique.');
  const refsById = new Map(args.nextRefs.map((ref) => [ref.assetId, ref]));
  for (const asset of args.nextDocument.assets)
    if (!refsById.has(asset.assetId))
      throw new Error(`Prepared editor document ref is missing: ${asset.assetId}.`);
  const retainedAssetIds = new Set(args.nextDocument.assets.map((asset) => asset.assetId));
  for (const previous of args.previousDocument?.assets ?? []) {
    if (nextByRole.get(previous.role)?.assetId === previous.assetId) continue;
    await removeEditorDocumentAssetOwner({
      assetId: previous.assetId,
      ownerId: args.ownerId,
      ownerKind: args.ownerKind,
      physicalDelete: args.physicalDelete,
      retainedAssetIds,
      role: previous.role,
      stores: args.stores,
    });
  }
  const writtenRefs = new Set<string>();
  for (const asset of args.nextDocument.assets) {
    if (previousByRole.get(asset.role)?.assetId === asset.assetId) continue;
    if (!previousAssetIds.has(asset.assetId) && !writtenRefs.has(asset.assetId)) {
      await args.stores.refs.put!(refsById.get(asset.assetId)!);
      writtenRefs.add(asset.assetId);
    }
    await args.stores.owners.put!({
      assetId: asset.assetId,
      ownerId: args.ownerId,
      ownerKind: args.ownerKind,
      role: asset.role,
    });
  }
}

export async function removeEditorDocumentOwnership(args: {
  document: Pick<PersistedEditorDocument, 'assets'>;
  ownerId: string;
  ownerKind: string;
  physicalDelete: PhysicalDeleteAssetOperation;
  stores: EditorDocumentAssetStores;
}): Promise<void> {
  for (const asset of args.document.assets) {
    await removeEditorDocumentAssetOwner({ ...args, assetId: asset.assetId, role: asset.role });
  }
}

async function removeEditorDocumentAssetOwner(args: {
  assetId: string;
  ownerId: string;
  ownerKind: string;
  physicalDelete: PhysicalDeleteAssetOperation;
  role: string;
  retainedAssetIds?: ReadonlySet<string>;
  stores: EditorDocumentAssetStores;
}): Promise<void> {
  await args.stores.owners.delete!([args.ownerKind, args.ownerId, args.role]);
  if (
    !args.retainedAssetIds?.has(args.assetId) &&
    (await args.stores.owners.index!('assetId').count(args.assetId)) === 0
  ) {
    await args.stores.refs.delete!(args.assetId);
    args.physicalDelete.assetIds.push(args.assetId);
  }
}
