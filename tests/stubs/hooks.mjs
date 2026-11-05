// Node module-resolution hooks: map the three specifiers Hermes Desktop
// provides at runtime onto local stubs, so desktop/plugin.js can be imported
// under `node --test` without the app.
const STUBS = {
  '@hermes/plugin-sdk': new URL('./plugin-sdk.mjs', import.meta.url).href,
  react: new URL('./react.mjs', import.meta.url).href,
  'react/jsx-runtime': new URL('./jsx-runtime.mjs', import.meta.url).href
}

export async function resolve(specifier, context, next) {
  if (specifier in STUBS) return { url: STUBS[specifier], shortCircuit: true }
  return next(specifier, context)
}
