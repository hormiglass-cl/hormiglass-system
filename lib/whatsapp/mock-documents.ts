export type DemoDocument = {
  id: string;
  product: string;
  name: string;
  description: string;
  preview: readonly string[];
};

/** Fictional presentation metadata only: no PDF bytes, catalog or remote source. */
export const mockDatasheets: readonly DemoDocument[] = Object.freeze([
  Object.freeze({
    id: 'demo-placas',
    product: 'Placas de hormigón (demo)',
    name: 'ficha-placas-demo.pdf',
    description: 'Muestra ficticia de una ficha de placas para revisar el diseño.',
    preview: Object.freeze([
      'Contenido ficticio. No es una especificación técnica válida.',
      'Producto de ejemplo: placas de hormigón (demo).',
      'Este espacio ilustra la presentación del producto, sin datos técnicos.',
    ]),
  }),
  Object.freeze({
    id: 'demo-postes',
    product: 'Postes de hormigón (demo)',
    name: 'ficha-postes-demo.pdf',
    description: 'Muestra ficticia de una ficha de postes para revisar el diseño.',
    preview: Object.freeze([
      'Contenido ficticio. No es una especificación técnica válida.',
      'Producto de ejemplo: postes de hormigón (demo).',
      'Este espacio ilustra la organización del contenido, sin datos técnicos.',
    ]),
  }),
]);

/** Exact preview copy used by the guarded mock sender too. */
export function datasheetMessage(document: DemoDocument): string {
  return `Te comparto ${document.name}. Es una muestra ficticia para revisar el diseño; no es una ficha técnica válida.`;
}

export function findMockDatasheet(id: string): DemoDocument | undefined {
  return mockDatasheets.find(document => document.id === id);
}
