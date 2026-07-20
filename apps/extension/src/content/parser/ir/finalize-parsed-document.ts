import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import {
  deriveDocumentBlocksFromSections,
  deriveLegacySectionsFromBlocks,
  inferExtractionClass,
  resolveSectionKinds,
} from './document-blocks';
import { buildQualitySignals } from './document-quality-signals';
import {
  dedupeGenericAggregateSectionCopies,
  dedupeRepeatedSections,
  dropEmptySections,
} from './section-deduplication';

export function finalizeParsedDocument(documentData: ParsedDocument): ParsedDocument {
  const normalizedSections = dedupeRepeatedSections(
    dedupeGenericAggregateSectionCopies(
      resolveSectionKinds(documentData.sections ?? documentData.structure)
    )
  );
  const blocks =
    documentData.blocks ?? deriveDocumentBlocksFromSections(dropEmptySections(normalizedSections));
  const shouldDeriveLegacySections =
    documentData.blocks !== undefined &&
    normalizedSections.some((section) => section.children.length === 0);
  const legacySections = shouldDeriveLegacySections
    ? deriveLegacySectionsFromBlocks(normalizedSections, blocks)
    : dropEmptySections(normalizedSections);
  const structure = resolveSectionKinds(dropEmptySections(legacySections));
  const meta = documentData.meta
    ? {
        ...documentData.meta,
        extractionClass: inferExtractionClass({
          blocks,
          structure,
        }),
      }
    : undefined;
  const nextDocument: ParsedDocument = {
    ...documentData,
    blocks,
    sections: structure,
    structure,
    ...(meta === undefined ? {} : { meta }),
  };

  if (nextDocument.meta) {
    nextDocument.meta.qualitySignals = buildQualitySignals(nextDocument);
  }

  return nextDocument;
}
