// Webpack invokes this build-time loader through its CommonJS loader API.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { transform } = require('lightningcss');

module.exports = function loadStyles(source) {
  const result = transform({ filename: this.resourcePath, code: Buffer.from(source), cssModules: { pattern: '[name]__[local]' } });
  this.emitFile('dialog-scope.css', result.code);
  return `export default ${JSON.stringify(Object.fromEntries(Object.entries(result.exports).map(([name, value]) => [name, value.name])))};`;
};
