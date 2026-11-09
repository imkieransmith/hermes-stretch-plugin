// The built bundle (desktop/plugin.js) is what Hermes loads: check it obeys
// the loader's rules, and that src/ obeys the design rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fakeCtx } from './helpers.mjs'

const ALLOWED = ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']
const BUNDLE = new URL('../desktop/plugin.js', import.meta.url)
const bundle = () => readFileSync(BUNDLE, 'utf8')
const srcFiles = (dir = new URL('../src/', import.meta.url).pathname) =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? srcFiles(p) : /\.jsx?$/.test(f) ? [p] : []
  })
const importsOf = text => [...text.matchAll(/^\s*(?:import|export)\s[^'"]*?\sfrom\s+['"]([^'"]+)['"]/gm), ...text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map(m => m[1])

test('bundle: imports only the three specifiers Hermes provides', () => {
  const text = bundle()
  const specs = importsOf(text)
  assert.ok(specs.length >= 3)
  for (const s of specs) assert.ok(ALLOWED.includes(s), s)
  assert.doesNotMatch(text, /\bimport\s*\(/, 'no dynamic import()')
})

test('bundle: loads and registers against the SDK', async () => {
  const { default: plugin } = await import(BUNDLE.href)
  assert.equal(plugin.id, 'openchi')
  const ctx = fakeCtx()
  plugin.register(ctx)
  assert.ok(ctx.contributions.length > 0)
  ctx.dispose()
})

test('src: imports are relative or the three Hermes specifiers', () => {
  for (const f of srcFiles()) {
    const text = readFileSync(f, 'utf8')
    for (const s of importsOf(text)) assert.ok(ALLOWED.includes(s) || s.startsWith('./') || s.startsWith('../'), `${f}: ${s}`)
    assert.doesNotMatch(text, /\bimport\s*\(/, `${f}: no dynamic import()`)
  }
})

test('src: no native title= on buttons (Hermes DESIGN.md; core has the same test)', () => {
  for (const f of srcFiles()) {
    const text = readFileSync(f, 'utf8')
    assert.doesNotMatch(text, /jsxs?\(\s*Button,\s*\{[^}]*\btitle:/, `${f}: Button with title`)
    assert.doesNotMatch(text, /jsxs?\(\s*'button',\s*\{[^}]*\btitle:/, `${f}: button with title`)
    assert.doesNotMatch(text, /<Button\b[^>]*\btitle=/, `${f}: <Button title>`)
    assert.doesNotMatch(text, /<button\b[^>]*\btitle=/, `${f}: <button title>`)
  }
})

test('src: no hook called conditionally (React error #300 when the condition flips)', () => {
  for (const f of srcFiles()) {
    const text = readFileSync(f, 'utf8')
    assert.doesNotMatch(text, /(&&|\|\||\?)[^;\n]*\buse[A-Z]\w*\(/, `${f}: hook after && / || / ? on one line`)
  }
})

test('bundle: every figure in assets/figures is inlined', () => {
  const text = readFileSync(BUNDLE, 'utf8')
  const root = new URL('../assets/figures/', import.meta.url)
  const keys = readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .flatMap(d => readdirSync(new URL(`${d.name}/`, root)).filter(f => f.endsWith('.png')).map(f => `${d.name}/${f.slice(0, -4)}`))
  assert.ok(keys.length > 0)
  for (const key of keys) assert.ok(text.includes(`"${key}"`), key)
  assert.equal(text.match(/data:image\/png;base64,/g).length, keys.length)
})
