import { colornames } from 'color-name-list';
import { createNamedCatalog } from './catalog-model';

/** The full dataset is evaluated only when the local catalog chunk is requested. */
export const namedCatalog = createNamedCatalog(colornames);
