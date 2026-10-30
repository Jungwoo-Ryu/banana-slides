/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


function gitValue(command: string): string {
  try {
    return execSync(command, {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim()
  } catch {
    return ''
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Read from the root directory .env Documents (relative to frontend The top level of the directory）
  const envDir = path.resolve(__dirname, '..')

  // Usage loadEnv Loading environment variables (the third parameter is an empty string indicating that all variables are loaded, not just VITE_ Prefixed.）
  const env = loadEnv(mode, envDir, '')

  // Port： Read first env，Or I’ll press. worktree Autocalculation of directory names
  const backendPort = env.BACKEND_PORT || '5011'
  const frontendPort = Number(env.FRONTEND_PORT) || 3011
  const backendUrl = `http://127.0.0.1:${backendPort}`
  const gitTag = env.VITE_APP_VERSION_TAG || gitValue('git describe --tags --exact-match HEAD')
  const gitSha = env.VITE_APP_COMMIT_SHA || gitValue('git rev-parse HEAD')
  const gitShortSha = env.VITE_APP_COMMIT_SHORT_SHA || gitSha.slice(0, 7)

  return {
    base: './',
    envDir,
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_VERSION_TAG': JSON.stringify(gitTag),
      'import.meta.env.VITE_APP_COMMIT_SHA': JSON.stringify(gitSha),
      'import.meta.env.VITE_APP_COMMIT_SHORT_SHA': JSON.stringify(gitShortSha),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: frontendPort,
      host: '127.0.0.1',
      strictPort: true, // Listen to all addresses.
      watch: {
        usePolling: true, // WSL Query needs to be enabled in an environment
      },
      hmr: {
        overlay: true, // Show Error Overwrite
      },
      proxy: {
        // API Requesting proxy to backend (port from environment variable) BACKEND_PORT Read）
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
        // File Services Agent to Backend
        '/files': {
          target: backendUrl,
          changeOrigin: true,
        },
        // Health check agent to backend
        '/health': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    // Vitest Test Configuration
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/tests/setup.ts',
      include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
      exclude: ['node_modules', 'dist'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'src/tests/',
          '**/*.d.ts',
          '**/*.config.*',
        ],
      },
    },
  }
})
