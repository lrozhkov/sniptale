import { renderToStaticMarkup } from 'react-dom/server';

export async function renderDesignSystemPageMarkup() {
  const [{ DesignSystemPage }, { DesignSystemThemeSurface }] = await Promise.all([
    import('../shell/page'),
    import('../theme'),
  ]);

  return renderToStaticMarkup(
    <DesignSystemThemeSurface>
      <DesignSystemPage />
    </DesignSystemThemeSurface>
  );
}
