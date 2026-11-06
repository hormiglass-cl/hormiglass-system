// Webpack's synchronous CommonJS loader API requires this installed compiler.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ts = require('typescript');

module.exports = function headerFixtureLoader(source) {
  return ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText;
};
