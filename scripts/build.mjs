// Bundles src/ into desktop/plugin.js, the one file Hermes Desktop loads.
//
//   node scripts/build.mjs            build once
//   node scripts/build.mjs --watch    rebuild on every save
//
// The bundle is plain ESM that imports only what Hermes provides
// (@hermes/plugin-sdk, react, react/jsx-runtime); everything in src/ is
// inlined. Not minified, so reviewers can read it. Ordinary comments are
// dropped: the commented source is src/.
import * as esbuild from 'esbuild'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const watch = process.argv.includes('--watch')
const OUT = 'desktop/plugin.js'
const time = () => new Date().toTimeString().slice(0, 8)

/**
 * The exercise figures: src/figure-art.js is empty in source; in the bundle
 * it is every assets/figures/<exercise-id>/<pose>.png, keyed
 * 'exercise-id/pose' and inlined as data URLs (Hermes loads one file: no
 * asset files, no network). Sorted, so the bundle never depends on the
 * order the file system lists them in.
 */
const FIGURES = 'assets/figures'

const figureArt = {
  name: 'figure-art',
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]figure-art\.js$/ }, () => {
      const art = {}
      const dirs = [FIGURES]
      const files = []
      const ids = readdirSync(FIGURES, { withFileTypes: true }).filter(d => d.isDirectory())
      for (const id of ids.map(d => d.name).sort()) {
        dirs.push(`${FIGURES}/${id}`)
        for (const name of readdirSync(`${FIGURES}/${id}`).sort()) {
          if (!name.endsWith('.png')) continue
          const file = `${FIGURES}/${id}/${name}`
          files.push(file)
          art[`${id}/${name.slice(0, -4)}`] = `data:image/png;base64,${readFileSync(file).toString('base64')}`
        }
      }
      return {
        contents:
          `// Figures from ${FIGURES}/, inlined by scripts/build.mjs.\n` +
          `export const FIGURE_ART = ${JSON.stringify(art, null, 1)}\n`,
        loader: 'js',
        watchFiles: files,
        watchDirs: dirs
      }
    })
  }
}

/** Write the bundle and log each (re)build. The same source always gives the
 *  same file, so reviewers can rebuild and compare. */
const writeOut = {
  name: 'write-out',
  setup(build) {
    build.onEnd(result => {
      if (result.errors.length) return
      const at = time()
      const text = result.outputFiles[0].text
      mkdirSync(dirname(OUT), { recursive: true })
      writeFileSync(OUT, text)
      console.log(`${at} built ${OUT} (${(text.length / 1024).toFixed(0)} KB)`)
    })
  }
}

const options = {
  entryPoints: ['src/plugin.jsx'],
  outfile: OUT,
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'],
  legalComments: 'inline',
  charset: 'utf8',
  banner: {
    js: `// OpenChi: GENERATED from src/ by scripts/build.mjs. Don't edit; edit src/.`
  },
  logLevel: 'warning',
  plugins: [figureArt, writeOut]
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('watching src/ (Ctrl-C to stop)')
} else {
  await esbuild.build(options)
}
