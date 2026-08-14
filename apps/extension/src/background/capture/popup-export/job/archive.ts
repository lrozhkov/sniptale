import { getMoscowFilenameTimestamp } from '@sniptale/foundation/utils/export-timestamp';
import type {
  ExportOptions,
  ExportPagePackage,
  PopupExportJobTab,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';

export type PopupExportCollectedPackage = {
  pagePackage: ExportPagePackage;
  tab: PopupExportJobTab;
};

type ZipEntry = {
  data: Uint8Array;
  path: string;
};

type CentralDirectoryRecord = {
  compressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  pathBytes: Uint8Array;
  uncompressedSize: number;
};

const textEncoder = new TextEncoder();
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION_NEEDED = 10;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crc32Table = createCrc32Table();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function createStoredZip(entries: ZipEntry[], isCancelled: () => boolean): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralRecords: CentralDirectoryRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (isCancelled()) throw new Error('Popup export cancelled');
    const pathBytes = textEncoder.encode(entry.path);
    const entryCrc32 = crc32(entry.data);
    const localHeader = concatBytes([
      uint32(ZIP_LOCAL_FILE_HEADER_SIGNATURE),
      uint16(ZIP_VERSION_NEEDED),
      uint16(0),
      uint16(ZIP_STORE_METHOD),
      uint16(0),
      uint16(0),
      uint32(entryCrc32),
      uint32(entry.data.byteLength),
      uint32(entry.data.byteLength),
      uint16(pathBytes.byteLength),
      uint16(0),
      pathBytes,
    ]);
    localParts.push(localHeader, entry.data);
    centralRecords.push({
      compressedSize: entry.data.byteLength,
      crc32: entryCrc32,
      localHeaderOffset: offset,
      pathBytes,
      uncompressedSize: entry.data.byteLength,
    });
    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralParts = centralRecords.map((record) =>
    concatBytes([
      uint32(ZIP_CENTRAL_DIRECTORY_SIGNATURE),
      uint16(0x031e),
      uint16(ZIP_VERSION_NEEDED),
      uint16(0),
      uint16(ZIP_STORE_METHOD),
      uint16(0),
      uint16(0),
      uint32(record.crc32),
      uint32(record.compressedSize),
      uint32(record.uncompressedSize),
      uint16(record.pathBytes.byteLength),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(record.localHeaderOffset),
      record.pathBytes,
    ])
  );
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endRecord = concatBytes([
    uint32(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE),
    uint16(0),
    uint16(0),
    uint16(centralRecords.length),
    uint16(centralRecords.length),
    uint32(centralDirectorySize),
    uint32(centralDirectoryOffset),
    uint16(0),
  ]);

  return concatBytes([...localParts, ...centralParts, endRecord]);
}

function resolveLayout(options: ExportOptions, pageCount: number): 'flat' | 'grouped' {
  if (pageCount <= 1) return 'grouped';
  const flat =
    (options.includeAnnotations ||
      options.includeJson ||
      options.includeMarkdown ||
      options.includeFullPageScreenshot) &&
    !options.includeFiles &&
    !options.includeImages &&
    !options.includeBasicLogs &&
    !options.includePageDiagnostics &&
    !options.includeCssDiagnostics;
  return flat ? 'flat' : 'grouped';
}

function uniqueBaseNames(packages: PopupExportCollectedPackage[]): string[] {
  const used = new Set<string>();
  return packages.map(({ pagePackage }) => {
    let base = pagePackage.archiveBaseName;
    let suffix = 1;
    while (used.has(base)) base = `${pagePackage.archiveBaseName}_${suffix++}`;
    used.add(base);
    return base;
  });
}

function flatPath(path: string, packageBaseName: string, uniqueBaseName: string): string {
  if (path === `${packageBaseName}.json`) return `${uniqueBaseName}.json`;
  if (path === `${packageBaseName}.md`) return `${uniqueBaseName}.md`;
  if (path === 'browser-annotations.md') return `${uniqueBaseName}_annotations.md`;
  if (path === 'page-screenshot.png') return `${uniqueBaseName}_screenshot.png`;
  if (path === 'logs/errors.log') return `${uniqueBaseName}_errors.log`;
  return `${uniqueBaseName}/${path}`;
}

export async function createPopupExportJobArchive(args: {
  isCancelled(): boolean;
  options: ExportOptions;
  packages: PopupExportCollectedPackage[];
}): Promise<{ blob: Blob; filename: string }> {
  const layout = resolveLayout(args.options, args.packages.length);
  const bases = uniqueBaseNames(args.packages);
  const entries: ZipEntry[] = [];

  for (const [index, item] of args.packages.entries()) {
    if (args.isCancelled()) throw new Error('Popup export cancelled');
    const uniqueBase = bases[index];
    if (!uniqueBase) continue;
    for (const entry of item.pagePackage.entries) {
      if (args.isCancelled()) throw new Error('Popup export cancelled');
      const path =
        layout === 'flat'
          ? flatPath(entry.path, item.pagePackage.archiveBaseName, uniqueBase)
          : `${uniqueBase}/${entry.path}`;
      if (typeof entry.textContent === 'string') {
        entries.push({ data: textEncoder.encode(entry.textContent), path });
      } else if (typeof entry.binaryBase64 === 'string') {
        entries.push({ data: decodeBase64Bytes(entry.binaryBase64), path });
      }
    }
  }

  const bytes = createStoredZip(entries, args.isCancelled);
  const zipBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return {
    blob: new Blob([zipBuffer], { type: 'application/zip' }),
    filename: `pages_export_${getMoscowFilenameTimestamp()}.zip`,
  };
}

export function createPopupExportJobResult(args: {
  errors: string[];
  filename: string;
  packages: PopupExportCollectedPackage[];
  warnings: string[];
}): PopupExportResult {
  const stats = args.packages.reduce(
    (result, item) => ({
      filesCount: result.filesCount + item.pagePackage.stats.filesCount,
      filesFailed: result.filesFailed + item.pagePackage.stats.filesFailed,
      rowsCount: result.rowsCount + item.pagePackage.stats.rowsCount,
      sectionsCount: result.sectionsCount + item.pagePackage.stats.sectionsCount,
    }),
    { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 }
  );
  return {
    success: args.errors.length === 0,
    filename: args.filename,
    errors: args.errors,
    stats,
    warnings: args.warnings,
  };
}
