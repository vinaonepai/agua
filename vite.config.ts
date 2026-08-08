/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'

const appVersion = `${Date.now()}`

const appVersionPlugin = (): Plugin => ({
  name: 'agua-plus-app-version',
  configureServer(server) {
    server.middlewares.use('/app-version.json', (_request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('Cache-Control', 'no-store')
      response.end(JSON.stringify({ version: appVersion }))
    })
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'app-version.json',
      source: JSON.stringify({ version: appVersion }),
    })
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    legacy(),
    appVersionPlugin()
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
})
