/**
 * Lightweight media converter
 * Uses sharp for images, skips heavy ffmpeg operations when possible
 */
const fs = require('fs')
const path = require('path')

let sharp = null
function getSharp() {
    if (!sharp) sharp = require('sharp')
    return sharp
}

async function toSticker(input, output, options = {}) {
    try {
        const s = getSharp()
        let pipeline = s(input)
            .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80, lossless: false })
        await pipeline.toFile(output)
        return output
    } catch (e) {
        throw new Error(`Sticker conversion failed: ${e.message}`)
    }
}

async function toImage(input, output) {
    try {
        const s = getSharp()
        await s(input).png({ compressionLevel: 9 }).toFile(output)
        return output
    } catch (e) {
        throw new Error(`Image conversion failed: ${e.message}`)
    }
}

async function resize(input, output, width, height) {
    try {
        const s = getSharp()
        await s(input).resize(width, height, { fit: 'inside' }).toFile(output)
        return output
    } catch (e) {
        throw new Error(`Resize failed: ${e.message}`)
    }
}

module.exports = {
    toSticker,
    toImage,
    resize
}
