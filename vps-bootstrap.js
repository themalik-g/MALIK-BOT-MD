/**
 * ╔════════════════════════════════════════════════╗
 * ║  🤖 MALIK MD - VPS Bootstrap (Levanter Style)  ║
 * ║  Upload ONLY this file to /home/container/     ║
 * ╚════════════════════════════════════════════════╝
 */

const { spawnSync, spawn } = require('child_process')
const { existsSync, rmSync } = require('fs')
const path = require('path')

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const REPO_URL = 'https://github.com/themalik-g/MALIK-BOT-MD.git'
const BOT_DIR = 'malik-bot-md'

// ═══════════════════════════════════════════════════════════
// RESTART PROTECTION
// ═══════════════════════════════════════════════════════════

let nodeRestartCount = 0
const maxNodeRestarts = 5
const restartWindow = 30000
let lastRestartTime = Date.now()

function startNode() {
  const child = spawn('node', ['index.js'], { cwd: BOT_DIR, stdio: 'inherit' })

  child.on('exit', (code) => {
    if (code !== 0) {
      const currentTime = Date.now()
      if (currentTime - lastRestartTime > restartWindow) nodeRestartCount = 0
      lastRestartTime = currentTime
      nodeRestartCount++

      if (nodeRestartCount > maxNodeRestarts) {
        console.error('[BOOT] ❌ Bot crashing continuously. Stopping retries...')
        return
      }

      console.log(`[BOOT] ⚠️ Bot exited (${code}). Restarting... (${nodeRestartCount}/${maxNodeRestarts})`)
      startNode()
    }
  })
}

// ═══════════════════════════════════════════════════════════
// DEPENDENCIES
// ═══════════════════════════════════════════════════════════

function installDependencies() {
  console.log('[BOOT] 📥 Installing dependencies...')
  const result = spawnSync('npm', ['install'], {
    cwd: BOT_DIR,
    stdio: 'inherit',
    timeout: 300000,
  })

  if (result.error || result.status !== 0) {
    console.error('[BOOT] ❌ npm install failed.')
    process.exit(1)
  }
  console.log('[BOOT] ✅ Dependencies installed.')
}

// ═══════════════════════════════════════════════════════════
// CLONE
// ═══════════════════════════════════════════════════════════

function cloneRepository() {
  console.log('[BOOT] 🌐 Cloning MALIK-BOT-MD from GitHub...')
  console.log('[BOOT] ⏳ This may take 1-2 minutes depending on your connection...')

  const result = spawnSync('git', ['clone', '--depth', '1', REPO_URL, BOT_DIR], {
    stdio: 'inherit',
    timeout: 180000,
  })

  if (result.error || result.status !== 0) {
    console.error('[BOOT] ❌ Git clone failed.')
    console.error('[BOOT] 💡 Make sure git is installed and the repo URL is correct.')
    process.exit(1)
  }

  console.log('[BOOT] ✅ Repository cloned successfully.')
  installDependencies()
}

// ═══════════════════════════════════════════════════════════
// MAIN FLOW
// ═══════════════════════════════════════════════════════════

console.log('╔════════════════════════════════╗')
console.log('║  🤖 MALIK MD Bootstrap         ║')
console.log('║  🚀 Auto-Clone & Start System  ║')
console.log('╚════════════════════════════════╝')
console.log('')

if (!existsSync(BOT_DIR)) {
  console.log('[BOOT] 📦 Fresh install detected.')
  cloneRepository()
} else if (!existsSync(path.join(BOT_DIR, 'package.json'))) {
  console.log('[BOOT] ⚠️ Bot folder exists but is corrupted. Re-cloning...')
  rmSync(BOT_DIR, { recursive: true, force: true })
  cloneRepository()
} else if (!existsSync(path.join(BOT_DIR, 'node_modules'))) {
  console.log('[BOOT] 📁 Bot files found but node_modules missing.')
  installDependencies()
} else {
  console.log('[BOOT] 📁 Bot files found. Skipping download.')
}

console.log('')
console.log('[BOOT] 🚀 Starting MALIK-BOT-MD...')
console.log('[BOOT] 📝 Press Ctrl+C to stop.')
console.log('')

startNode()
