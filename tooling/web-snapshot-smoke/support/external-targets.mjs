const DEFAULT_THRESHOLDS = Object.freeze({
  changedPixelRatio: 0.05,
  heightDeltaRatio: 0.005,
  meanChannelDelta: 5,
  missingAreaRatio: 0.01,
});

const target = (descriptor) =>
  Object.freeze({
    thresholds: DEFAULT_THRESHOLDS,
    ...descriptor,
  });

export const DEFAULT_EXTERNAL_TARGETS = Object.freeze([
  target({
    comparison: 'static',
    contentExpectations: Object.freeze({ minimumImages: 1, minimumLinks: 1 }),
    id: 'wiki-world-wide-web',
    readySelector: '#firstHeading',
    url: 'https://en.wikipedia.org/wiki/World_Wide_Web',
  }),
  target({
    comparison: 'static',
    id: 'sap-ui5-cart',
    readySelector: '.sapMSLITitleOnly',
    thresholds: Object.freeze({
      ...DEFAULT_THRESHOLDS,
      changedPixelRatio: 0.3,
      meanChannelDelta: 35,
    }),
    url: 'https://ui5.sap.com/test-resources/sap/m/demokit/cart/webapp/index.html?sap-ui-theme=sap_horizon_dark#/categories',
  }),
  target({
    comparison: 'static',
    contentExpectations: Object.freeze({ minimumLinks: 1 }),
    id: 'jira-public-issue',
    readySelector: '#content',
    url: 'https://jira.atlassian.com/browse/JRASERVER-60118',
  }),
  target({
    comparison: 'static',
    contentExpectations: Object.freeze({ minimumLinks: 1 }),
    id: 'mui-data-grid-virtualization',
    readySelector: '.MuiDataGrid-root',
    url: 'https://mui.com/x/react-data-grid/virtualization/',
  }),
  target({
    comparison: 'static',
    contentExpectations: Object.freeze({ minimumLinks: 1 }),
    id: 'ant-design-table',
    readySelector: '.ant-table-wrapper',
    thresholds: Object.freeze({
      ...DEFAULT_THRESHOLDS,
      changedPixelRatio: 0.1,
    }),
    toleranceReason:
      'The page updates interactive demos and contributor avatars between sequential captures.',
    url: 'https://ant.design/components/table/',
  }),
  target({
    comparison: 'static',
    id: 'vaadin-grid-performance',
    readySelector: 'vaadin-grid',
    url: 'https://vaadin.github.io/web-components/grid-performance.html',
  }),
  target({
    comparison: 'static',
    contentExpectations: Object.freeze({ minimumLinks: 1 }),
    id: 'next-commerce-product',
    readySelector: 'main',
    url: 'https://demo.vercel.store/product/acme-geometric-circles-t-shirt',
  }),
  target({
    comparison: 'static',
    id: 'discourse-topic',
    readySelector: '#main-outlet',
    url: 'https://meta.discourse.org/t/updates-to-new-site-experience-and-the-getting-started-guide/273189',
  }),
  target({
    comparison: 'screenshot',
    id: 'mozilla-pdfjs-viewer',
    readySelector: '#viewerContainer',
    scrollRootSelector: '#viewerContainer',
    url: 'https://mozilla.github.io/pdf.js/web/viewer.html',
  }),
]);

export const EXTENDED_EXTERNAL_TARGETS = Object.freeze([
  target({
    comparison: 'screenshot',
    id: 'wordpress-playground',
    readySelector: 'iframe',
    url: 'https://playground.wordpress.net/',
  }),
  target({
    comparison: 'screenshot',
    id: 'monaco-editor',
    readySelector: '.monaco-editor',
    url: 'https://microsoft.github.io/monaco-editor/playground.html',
  }),
  target({
    comparison: 'screenshot',
    id: 'echarts-examples',
    readySelector: 'canvas',
    url: 'https://echarts.apache.org/examples/en/index.html',
  }),
  target({
    comparison: 'screenshot',
    id: 'maplibre-demo',
    readySelector: '.maplibregl-canvas',
    url: 'https://maplibre.org/maplibre-gl-js/docs/examples/simple-map/',
  }),
]);

export function selectExternalTargets({ extended, targetId }) {
  const catalog = extended
    ? [...DEFAULT_EXTERNAL_TARGETS, ...EXTENDED_EXTERNAL_TARGETS]
    : [...DEFAULT_EXTERNAL_TARGETS];
  if (!targetId) return catalog;
  const selected = catalog.find((item) => item.id === targetId);
  if (!selected) {
    const known = catalog.map((item) => item.id).join(', ');
    throw new Error(`Unknown Web Snapshot smoke target "${targetId}". Known targets: ${known}`);
  }
  return [selected];
}
