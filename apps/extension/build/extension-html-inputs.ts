import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

import type { Plugin } from 'vite';

import type { ExtensionBuildLayout } from './layout';

function normalized(path: string): string {
  return path.replaceAll('\\', '/');
}

function isWithin(path: string, root: string): boolean {
  const offset = relative(root, path);
  return offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..');
}

export function extensionHtmlInputSource(
  layout: ExtensionBuildLayout,
  virtualPath: string
): string | null {
  const normalizedPath = normalized(virtualPath);
  return (
    layout.htmlInputs.find((input) => normalized(input.virtualAbsolutePath) === normalizedPath)
      ?.sourceAbsolutePath ?? null
  );
}

/** Map app-owned sources to the stable committed extension and E2E artifact URLs. */
export function extensionHtmlInputs(layout: ExtensionBuildLayout): Plugin {
  const byVirtualPath = new Map(
    layout.htmlInputs.map((input) => [normalized(input.virtualAbsolutePath), input])
  );
  const manifestModulesByVirtualPath = new Map(
    layout.manifestModuleInputs.map((input) => [
      normalized(input.virtualAbsolutePath),
      input.sourceAbsolutePath,
    ])
  );

  return {
    enforce: 'pre',
    name: 'sniptale:extension-html-inputs',
    configureServer(server) {
      const appEntries = layout.htmlInputs.filter((input) =>
        isWithin(input.sourceAbsolutePath, layout.appRoot)
      );
      server.middlewares.use((request, _response, next) => {
        const requestPath = decodeURIComponent((request.url ?? '').split(/[?#]/u, 1)[0] ?? '');
        const entry = appEntries.find((input) => `/${input.outputPath}` === requestPath);
        if (entry) {
          request.url = `/${normalized(relative(layout.appRoot, entry.sourceAbsolutePath))}`;
        }
        next();
      });
    },
    resolveId(source, importer) {
      const absoluteSource = normalized(
        resolve(importer ? dirname(importer) : layout.appRoot, source)
      );
      const manifestModule = manifestModulesByVirtualPath.get(absoluteSource);
      if (manifestModule) return manifestModule;
      const htmlInput = byVirtualPath.get(absoluteSource);
      if (htmlInput) return absoluteSource;
      if (!importer) return null;

      const importerInput = byVirtualPath.get(normalized(importer));
      if (!importerInput || !source.startsWith('.')) return null;
      return resolve(dirname(importerInput.sourceAbsolutePath), source);
    },
    load(id) {
      const sourcePath = extensionHtmlInputSource(layout, id);
      return sourcePath ? readFileSync(sourcePath, 'utf8') : null;
    },
  };
}
