import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Inline the built JS and CSS into index.html so the preview is a single, shareable file. */
function singleFile(): Plugin {
  return {
    name: 'single-file',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        for (const [name, chunk] of Object.entries(ctx.bundle)) {
          if (chunk.type === 'chunk' && chunk.isEntry) {
            html = html.replace(
              new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`),
              () => `<script type="module">${chunk.code.replace(/<\/script/g, '<\\/script')}</script>`
            )
            delete ctx.bundle[name]
          } else if (chunk.type === 'asset' && name.endsWith('.css')) {
            html = html.replace(new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`), () => `<style>${chunk.source}</style>`)
            delete ctx.bundle[name]
          }
        }
        return html
      }
    }
  }
}

export default defineConfig({
  root: __dirname,
  base: './',
  resolve: { alias: { '@shared': resolve(__dirname, '../src/shared') } },
  plugins: [react(), singleFile()],
  build: {
    outDir: resolve(__dirname, '../out/preview'),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER
  }
})
