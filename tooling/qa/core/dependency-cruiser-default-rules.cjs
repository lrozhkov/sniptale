module.exports = [
  {
    name: 'no-circular',
    severity: 'warn',
    comment:
      'This dependency is part of a circular relationship. You might want to revise your solution.',
    from: {},
    to: {
      circular: true,
    },
  },
  {
    name: 'no-orphans',
    comment:
      "This is an orphan module - it's likely not used anymore. Use it, remove it, or add an exception.",
    severity: 'warn',
    from: {
      orphan: true,
      pathNot: [
        '(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$',
        '[.]d[.]ts$',
        '^tooling/test/harness/vitest[.]setup[.]ts$',
        '(^|/)tsconfig[.]json$',
        '(^|/)(?:babel|webpack)[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$',
      ],
    },
    to: {},
  },
  {
    name: 'no-deprecated-core',
    comment:
      'A module depends on a node core module that has been deprecated. Find an alternative.',
    severity: 'warn',
    from: {},
    to: {
      dependencyTypes: ['core'],
      path: [
        '^v8/tools/codemap$',
        '^v8/tools/consarray$',
        '^v8/tools/csvparser$',
        '^v8/tools/logreader$',
        '^v8/tools/profile_view$',
        '^v8/tools/profile$',
        '^v8/tools/SourceMap$',
        '^v8/tools/splaytree$',
        '^v8/tools/tickprocessor-driver$',
        '^v8/tools/tickprocessor$',
        '^node-inspect/lib/_inspect$',
        '^node-inspect/lib/internal/inspect_client$',
        '^node-inspect/lib/internal/inspect_repl$',
        '^async_hooks$',
        '^punycode$',
        '^domain$',
        '^constants$',
        '^sys$',
        '^_linklist$',
        '^_stream_wrap$',
      ],
    },
  },
  {
    name: 'not-to-deprecated',
    comment: 'This module uses a deprecated npm module. Upgrade it or find an alternative.',
    severity: 'warn',
    from: {},
    to: {
      dependencyTypes: ['deprecated'],
    },
  },
  {
    name: 'no-non-package-json',
    severity: 'error',
    comment:
      "This module depends on an npm package that isn't in the dependencies section of package.json.",
    from: {
      pathNot: ['^apps/extension/src/vite-env[.]d[.]ts$'],
    },
    to: {
      dependencyTypes: ['npm-no-pkg', 'npm-unknown'],
    },
  },
  {
    name: 'not-to-unresolvable',
    comment:
      'This module depends on a module that cannot be found. Add it to package.json or fix the path.',
    severity: 'error',
    from: {},
    to: {
      couldNotResolve: true,
      pathNot: '[?](?:inline|raw|url)$',
    },
  },
  {
    name: 'no-duplicate-dep-types',
    comment:
      'This module depends on an external package that occurs more than once in package.json.',
    severity: 'warn',
    from: {},
    to: {
      moreThanOneDependencyType: true,
      dependencyTypesNot: ['type-only'],
    },
  },
  {
    name: 'not-to-spec',
    comment: 'This module depends on a spec file. Factor shared helpers out of test files instead.',
    severity: 'error',
    from: {},
    to: {
      path: '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$',
    },
  },
  {
    name: 'not-to-dev-dep',
    severity: 'error',
    comment:
      'This module depends on an npm package from devDependencies but looks like production code.',
    from: {
      path: '^(?:apps/extension/src|packages/[^/]+/src)',
      pathNot: [
        '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$',
        '(^|[./])test-(?:support|helpers|fixtures|expectations)(?:[./])',
        '[.]test-(?:support|helpers|fixtures|expectations)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$',
        '[.]test[.](?:support|helpers|fixtures|expectations)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$',
        '^apps/extension/src/design-system/parity/',
        '(^|/)test-support/',
        '^tooling/test/harness/',
        '^apps/extension/src/vite-env[.]d[.]ts$',
      ],
    },
    to: {
      dependencyTypes: ['npm-dev'],
      dependencyTypesNot: ['type-only'],
      pathNot: ['node_modules/@types/'],
    },
  },
  {
    name: 'optional-deps-used',
    severity: 'info',
    comment: 'This module depends on an optional dependency.',
    from: {},
    to: {
      dependencyTypes: ['npm-optional'],
    },
  },
  {
    name: 'peer-deps-used',
    comment: 'This module depends on a peer dependency.',
    severity: 'warn',
    from: {},
    to: {
      dependencyTypes: ['npm-peer'],
    },
  },
];
