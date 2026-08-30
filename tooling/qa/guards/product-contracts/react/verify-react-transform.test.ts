import { expect, it } from 'vitest';
import type { Plugin, UserConfig } from 'vite';

import { createReactTransformPlugins } from '../../../../../apps/extension/vite.config';

function flattenPlugins(value: ReturnType<typeof createReactTransformPlugins>): Plugin[] {
  return (Array.isArray(value) ? value : [value]).flat(Infinity).filter(Boolean) as Plugin[];
}

async function runConfigHook(plugin: Plugin): Promise<UserConfig | undefined> {
  if (!plugin.config) return undefined;
  const handler = typeof plugin.config === 'function' ? plugin.config : plugin.config.handler;
  return (await handler.call(
    {} as never,
    {},
    { command: 'serve', isPreview: false, isSsrBuild: false, mode: 'development' }
  )) as UserConfig | undefined;
}

it('configures React refresh through the Vite Oxc transform without a Babel transform hook', async () => {
  const plugins = flattenPlugins(createReactTransformPlugins());
  const configs = await Promise.all(plugins.map(runConfigHook));
  const oxcConfig = configs.find((config) => config?.oxc)?.oxc;

  expect(oxcConfig).toMatchObject({
    jsx: {
      importSource: 'react',
      refresh: true,
      runtime: 'automatic',
    },
  });
  expect(plugins.every((plugin) => plugin.transform == null)).toBe(true);
});
