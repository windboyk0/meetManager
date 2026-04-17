import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src')
      },
      // Force browser build of packages like @xenova/transformers.
      // Without this, Vite picks the Node.js build which contains require('fs'),
      // causing "Dynamic require of 'fs' is not supported" in the Web Worker.
      conditions: ['browser'],
      mainFields: ['browser', 'module', 'main'],
    },
    define: {
      // @xenova/transformers checks process.versions?.node to detect Node.js environment.
      // Vite stubs require('fs') with a throwing function; if IS_NODE stays true,
      // that stub gets called and throws "Dynamic require of 'fs' is not supported".
      // Replacing this with undefined at build time forces IS_NODE = false so the
      // fs code paths are never entered and the stub is never invoked.
      'process.versions.node': 'undefined',
    },
    optimizeDeps: {
      // @xenova/transformers uses dynamic WASM imports — pre-bundling breaks the file paths.
      // onnxruntime-web is excluded so Vite's dep optimizer doesn't transform require('fs')
      // before our mock-node-builtins plugin can intercept it.
      exclude: ['@xenova/transformers', 'onnxruntime-web', 'onnxruntime-node'],
    },
    worker: {
      format: 'es',
    },
    plugins: [
      // Mock Node.js built-ins for the renderer/worker context.
      // onnxruntime-web (internal dep of @xenova/transformers) calls require('fs') inside
      // try-catch at module level. Vite normally replaces require() with a throwing stub,
      // which breaks the try-catch. Providing real (empty) virtual modules lets Vite emit
      // proper ESM imports instead of the throwing stub, so the try-catch is never triggered.
      {
        // onnxruntime-web (bundled inside @xenova/transformers) has legacy CJS code with
        // require('fs') inside try-catch blocks. Vite's CJS→ESM transform converts this
        // to __require('fs') — a function that throws synchronously — before the try-catch
        // can catch it. We use a 'pre' transform hook to replace require('fs/path/os')
        // with inline mock objects BEFORE Vite's transform runs, so the throwing stub
        // is never created for these modules.
        name: 'mock-node-builtins',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          // Only process node_modules files that actually call require('fs')
          if (!id.includes('node_modules')) return null
          if (!code.includes("require('fs')") && !code.includes('require("fs")') &&
              !code.includes("require('path')") && !code.includes('require("path")') &&
              !code.includes("require('os')") && !code.includes('require("os")')) return null

          const result = code
            .replace(/require\(['"]fs\/promises['"]\)/g,
              `({readFile:async()=>null,writeFile:async()=>{},stat:async()=>({isDirectory:()=>false}),mkdir:async()=>{},readdir:async()=>[]})`)
            .replace(/require\(['"]fs['"]\)/g,
              `({readFileSync:()=>null,writeFileSync:()=>{},existsSync:()=>false,mkdirSync:()=>{},readdirSync:()=>[],statSync:()=>({isDirectory:()=>false,isFile:()=>false}),createReadStream:()=>null,promises:{readFile:async()=>null,writeFile:async()=>{},stat:async()=>({isDirectory:()=>false})}})`)
            .replace(/require\(['"]path['"]\)/g,
              `({join:(...a)=>a.filter(Boolean).join('/'),dirname:p=>(p||'').split('/').slice(0,-1).join('/')||'.',basename:p=>(p||'').split('/').pop()||'',extname:p=>{const b=(p||'').split('/').pop()||'';const i=b.lastIndexOf('.');return i>0?b.slice(i):''},sep:'/',resolve:(...a)=>a.filter(Boolean).join('/'),normalize:p=>p})`)
            .replace(/require\(['"]os['"]\)/g,
              `({platform:()=>'browser',tmpdir:()=>'/tmp',homedir:()=>'/home/user'})`)

          return result !== code ? { code: result, map: null } : null
        },
      },
      react(),
      electron({
        main: {
          // Shortcut of `build.lib.entry`
          entry: 'electron/main/index.ts',
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              console.log(/* For `.vscode/.debug.script.mjs` */'[startup] Electron App')
            } else {
              args.startup()
            }
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        preload: {
          // Shortcut of `build.rollupOptions.input`.
          // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        // Ployfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: {},
      }),
    ],
    server: process.env.VSCODE_DEBUG && (() => {
      const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
      return {
        host: url.hostname,
        port: +url.port,
      }
    })(),
    clearScreen: false,
  }
})
