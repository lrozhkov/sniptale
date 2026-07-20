module.exports = {
  doNotFollow: {
    path: ['node_modules'],
  },
  detectJSDocImports: true,
  tsPreCompilationDeps: true,
  tsConfig: {
    fileName: 'tsconfig.json',
  },
  enhancedResolveOptions: {
    exportsFields: ['exports'],
    conditionNames: ['import', 'require', 'node', 'default', 'types'],
    mainFields: ['module', 'main', 'types', 'typings'],
  },
  skipAnalysisNotInRules: true,
  reporterOptions: {
    dot: {
      collapsePattern: 'node_modules/(?:@[^/]+/[^/]+|[^/]+)',
    },
    archi: {
      collapsePattern:
        '^(?:packages|src|lib(s?)|app(s?)|bin|test(s?)|spec(s?))/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)',
    },
    text: {
      highlightFocused: true,
    },
  },
};
