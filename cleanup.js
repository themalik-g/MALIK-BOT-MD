const fs = require('fs')
const path = require('path')

const dirsToClean = ['./temp', './assets', './logs']
const filesToClean = ['./data/store.json']

console.log('🧹 Cleaning up temporary files...')

for (const dir of dirsToClean) {
    if (fs.existsSync(dir)) {
        try {
            const files = fs.readdirSync(dir)
            for (const file of files) {
                const fullPath = path.join(dir, file)
                try {
                    const stat = fs.statSync(fullPath)
                    if (stat.isFile()) {
                        fs.unlinkSync(fullPath)
                        console.log(`  🗑️  Deleted: ${fullPath}`)
                    }
                } catch (e) {}
            }
            console.log(`✅ Cleaned: ${dir}`)
        } catch (e) {
            console.error(`❌ Error cleaning ${dir}:`, e.message)
        }
    } else {
        fs.mkdirSync(dir, { recursive: true })
        console.log(`📁 Created: ${dir}`)
    }
}

for (const file of filesToClean) {
    if (fs.existsSync(file)) {
        try {
            fs.unlinkSync(file)
            console.log(`  🗑️  Deleted: ${file}`)
        } catch (e) {}
    }
}

console.log('✅ Cleanup complete!')
