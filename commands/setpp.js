const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('toxic-baileys');
const sharp = require('sharp');
const isOwnerOrSudo = require('../lib/isOwner');

async function setProfilePicture(sock, chatId, msg) {
    try {
        const senderId = msg.key.participant || msg.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!msg.key.fromMe && !isOwner) {
            return sock.sendMessage(chatId, {
                text: '❌ This command is only available for the owner!'
            }, { quoted: msg });
        }

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || !quoted.imageMessage) {
            return sock.sendMessage(chatId, {
                text: '⚠️ Reply to an image with .setpp'
            }, { quoted: msg });
        }

        const buffer = await downloadMediaMessage(
            { key: msg.key, message: quoted.imageMessage },
            'buffer',
            {},
            { logger: console }
        );

        if (!buffer) throw new Error('Download failed');

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const outputPath = path.join(tmpDir, `pp_${Date.now()}.jpg`);

        await sharp(buffer)
            .resize(720, 720, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .jpeg({ quality: 90 })
            .toFile(outputPath);

        await sock.updateProfilePicture(
            sock.user.id,
            { url: outputPath },
            { hd: true }
        );

        fs.unlinkSync(outputPath);

        await sock.sendMessage(chatId, {
            text: '✅ Profile picture updated (full‑size with transparent padding).'
        }, { quoted: msg });

    } catch (error) {
        console.error('setpp error:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to set profile picture.'
        }, { quoted: msg });
    }
}

module.exports = setProfilePicture;
