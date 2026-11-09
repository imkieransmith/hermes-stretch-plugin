// Node module hooks for the tests:
//   - resolve: map the three specifiers Hermes Desktop provides at runtime
//     onto local stubs, so src/ (and the bundle) import under `node --test`.
//   - load: compile JSX in src/ with esbuild (as the build does), so tests
//     import the source directly.
import { transform } from 'esbuild'
import { readFile } from 'node:fs/promises'

const STUBS = {
  '@hermes/plugin-sdk': new URL('./plugin-sdk.mjs', import.meta.url).href,
  react: new URL('./react.mjs', import.meta.url).href,
  'react/jsx-runtime': new URL('./jsx-runtime.mjs', import.meta.url).href
}
const SRC = new URL('../../src/', import.meta.url).href

export async function resolve(specifier, context, next) {
  if (specifier in STUBS) return { url: STUBS[specifier], shortCircuit: true }
  return next(specifier, context)
}

export async function load(url, context, next) {
  if (!url.startsWith(SRC) || !/\.jsx?$/.test(url)) return next(url, context)
  const source = await readFile(new URL(url), 'utf8')
  const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'esm', sourcefile: url, sourcemap: 'inline' })
  return { format: 'module', source: code, shortCircuit: true }
}
