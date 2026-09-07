const fs = require('fs')

console.log('🔄 Resetting session...')

try {
    if (fs.existsSync('./session')) {
        fs.rmSync('./session', { recursive: true, force: true })
        console.log('✅ Session folder deleted.')
    }
    if (fs.existsSync('./data/store.json')) {
        fs.unlinkSync('./data/store.json')
        console.log('✅ Store cache deleted.')
    }
    console.log('✅ Session reset complete! Run npm start to re-authenticate.')
} catch (error) {
    console.error('❌ Error resetting session:', error.message)
}
