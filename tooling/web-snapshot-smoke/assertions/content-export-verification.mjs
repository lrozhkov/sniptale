import JSZip from 'jszip';

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

function addCheck(checks, id, passed, detail) {
  checks.push({
    id,
    status: passed ? 'passed' : 'failed',
    ...(detail ? { detail } : {}),
  });
}

function findContentExport(files, extension) {
  const isCandidate = (entry) =>
    !entry.dir &&
    entry.name.toLowerCase().endsWith(extension) &&
    !/(?:^|\/)readme(?:\.|$)/iu.test(entry.name) &&
    !/(?:^|\/)browser-annotations\.md$/iu.test(entry.name);
  return (
    files.find((entry) => entry.name.startsWith('exports/data/') && isCandidate(entry)) ??
    files.find(
      (entry) => !entry.name.includes('/') && entry.name !== 'manifest.json' && isCandidate(entry)
    )
  );
}

function collectInlineNodes(data) {
  if (!Array.isArray(data?.sections)) return [];
  return data.sections.flatMap((section) => {
    if (!Array.isArray(section?.fields)) return [];
    return section.fields.flatMap((field) =>
      Array.isArray(field?.inlineContent) ? field.inlineContent : []
    );
  });
}

function isSafeUrl(value, protocols) {
  if (typeof value !== 'string') return false;
  try {
    return protocols.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function normalizeUrlForMarkdown(value) {
  return value.replace(/\\/gu, '%5C').replace(/>/gu, '%3E');
}

async function readContentExports(archiveBytes, checks) {
  const zip = await JSZip.loadAsync(archiveBytes);
  const files = Object.values(zip.files);
  const markdownEntry = findContentExport(files, '.md');
  const jsonEntry = findContentExport(files, '.json');
  addCheck(checks, 'markdown-present', Boolean(markdownEntry));
  addCheck(checks, 'json-present', Boolean(jsonEntry));
  if (!markdownEntry || !jsonEntry) throw new Error('Markdown or JSON export is missing');
  return {
    data: JSON.parse(await jsonEntry.async('string')),
    markdown: await markdownEntry.async('string'),
  };
}

function verifyDocumentStructure(checks, data, markdown, expectedUrl) {
  addCheck(
    checks,
    'markdown-structured',
    /^#\s+\S+/mu.test(markdown) && /^##\s+\S+/mu.test(markdown)
  );
  addCheck(
    checks,
    'json-structured',
    typeof data?.meta?.title === 'string' &&
      typeof data?.meta?.url === 'string' &&
      Array.isArray(data.sections) &&
      data.sections.length > 0
  );
  addCheck(
    checks,
    'source-url',
    !expectedUrl || data?.meta?.url === expectedUrl,
    data?.meta?.url ?? 'missing'
  );
}

function verifyInlineSemantics(checks, markdown, links, images, options) {
  addCheck(
    checks,
    'safe-inline-urls',
    links.every((node) => isSafeUrl(node.url, SAFE_LINK_PROTOCOLS)) &&
      images.every(
        (node) =>
          isSafeUrl(node.sourceUrl, SAFE_IMAGE_PROTOCOLS) &&
          (!node.linkUrl || isSafeUrl(node.linkUrl, SAFE_LINK_PROTOCOLS))
      )
  );
  const projectedUrls = [
    ...links.map((node) => node.url),
    ...images.flatMap((node) => [node.sourceUrl, node.linkUrl].filter(Boolean)),
  ];
  addCheck(
    checks,
    'markdown-json-url-parity',
    projectedUrls.every((url) => markdown.includes(`<${normalizeUrlForMarkdown(url)}>`))
  );
  addCheck(
    checks,
    'minimum-links',
    links.length >= (options.minimumLinks ?? 0),
    `retained=${links.length}; expected>=${options.minimumLinks ?? 0}`
  );
  addCheck(
    checks,
    'minimum-images',
    images.length >= (options.minimumImages ?? 0),
    `retained=${images.length}; expected>=${options.minimumImages ?? 0}`
  );
}

async function runContentVerification(archiveBytes, checks, metrics, options) {
  const { data, markdown } = await readContentExports(archiveBytes, checks);
  const inlineNodes = collectInlineNodes(data);
  const links = inlineNodes.filter((node) => node?.kind === 'link');
  const images = inlineNodes.filter((node) => node?.kind === 'image');
  metrics.links = links.length;
  metrics.images = images.length;
  metrics.sections = Array.isArray(data.sections) ? data.sections.length : 0;
  verifyDocumentStructure(checks, data, markdown, options.expectedUrl);
  verifyInlineSemantics(checks, markdown, links, images, options);
}

export async function verifyContentExports(archiveBytes, options = {}) {
  const checks = [];
  const metrics = { images: 0, links: 0, sections: 0 };
  try {
    await runContentVerification(archiveBytes, checks, metrics, options);
  } catch (error) {
    addCheck(
      checks,
      'content-exports-readable',
      false,
      error instanceof Error ? error.message : String(error)
    );
  }
  const violations = checks.filter((check) => check.status === 'failed').map((check) => check.id);
  return {
    checks,
    metrics,
    status: violations.length === 0 ? 'passed' : 'failed',
    violations,
  };
}
