import { isAbsolute, relative, resolve, sep } from 'node:path';

import layoutPolicy from './layout.data.json';

export type ExtensionHtmlInput = (typeof layoutPolicy.htmlInputs)[number];

export interface ExtensionBuildLayout {
  appRoot: string;
  repositoryRoot: string;
  outputRoot: string;
  externalInputRoots: string[];
  htmlInputs: Array<
    ExtensionHtmlInput & { sourceAbsolutePath: string; virtualAbsolutePath: string }
  >;
  manifestModuleInputs: Array<{
    sourceAbsolutePath: string;
    virtualAbsolutePath: string;
  }>;
}

function isPathWithin(path: string, root: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))
  );
}

export function createExtensionBuildLayout(appRoot: string): ExtensionBuildLayout {
  const canonicalAppRoot = resolve(appRoot);
  const repositoryRoot = resolve(canonicalAppRoot, '../..');
  return {
    appRoot: canonicalAppRoot,
    repositoryRoot,
    outputRoot: resolve(repositoryRoot, layoutPolicy.outputRoot),
    externalInputRoots: layoutPolicy.externalInputRoots.map((path) =>
      resolve(repositoryRoot, path)
    ),
    htmlInputs: layoutPolicy.htmlInputs.map((input) => ({
      ...input,
      sourceAbsolutePath: resolve(repositoryRoot, input.sourcePath),
      virtualAbsolutePath: resolve(canonicalAppRoot, input.outputPath),
    })),
    manifestModuleInputs: layoutPolicy.manifestModuleInputs.map((input) => ({
      sourceAbsolutePath: resolve(repositoryRoot, input.sourcePath),
      virtualAbsolutePath: resolve(canonicalAppRoot, input.virtualPath),
    })),
  };
}

export function isDeclaredExtensionBuildInput(
  layout: ExtensionBuildLayout,
  candidatePath: string
): boolean {
  const absolutePath = resolve(candidatePath);
  return (
    isPathWithin(absolutePath, layout.appRoot) ||
    layout.externalInputRoots.some((root) => isPathWithin(absolutePath, root))
  );
}

export function extensionRollupInputs(layout: ExtensionBuildLayout, mode: string) {
  return Object.fromEntries(
    layout.htmlInputs
      .filter((input) => input.rollupName !== null)
      .filter(
        (input) =>
          input.mode === 'always' ||
          (input.mode === 'non-release' && mode !== 'release') ||
          (input.mode === 'test-e2e' && mode === 'test-e2e')
      )
      .map((input) => [input.rollupName, input.virtualAbsolutePath])
  );
}

export { layoutPolicy };
