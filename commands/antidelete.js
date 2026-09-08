const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('toxic-baileys');
const { writeFile } = require('fs/promises');

const messageStore = new Map();
const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');
const settings = require('../settings');

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Load config
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false, mode: 'p' };
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH));
        return {
            enabled: data.enabled ?? false,
            mode: data.mode || 'p'
        };
    } catch {
        return { enabled: false, mode: 'p' };
    }
}

function saveAntideleteConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Config save error:', err);
    }
}

const isOwnerOrSudo = require('../lib/isOwner');

// Command Handler
async function handleAntideleteCommand(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!message.key.fromMe && !isOwner) {
        return sock.sendMessage(chatId, { text: '*Only the bot owner can use this command.*' }, { quoted: message });
    }

    const config = loadAntideleteConfig();
    const cleanMatch = (match || '').trim().toLowerCase();

    if (!cleanMatch) {
        let statusText = '❌ Disabled';
        if (config.enabled) {
            statusText = config.mode === 'g' ? '✅ Enabled (Group/Chat)' : '✅ Enabled (Owner DM)';
        }
        return sock.sendMessage(chatId, {
            text: `*ANTIDELETE SETUP*\n\nCurrent Status: ${statusText}\n\n• *.antidelete p* - Send deleted messages to owner DM\n• *.antidelete g* - Send deleted messages to chat/group\n• *.antidelete off* - Disable antidelete`
        }, { quoted: message });
    }

    if (cleanMatch === 'p' || cleanMatch === 'pm' || cleanMatch === 'on') {
        config.enabled = true;
        config.mode = 'p';
        saveAntideleteConfig(config);
        return sock.sendMessage(chatId, { text: '*Antidelete enabled: Reports will be sent to Owner DM (p).*' }, { quoted: message });
    } else if (cleanMatch === 'g' || cleanMatch === 'gc' || cleanMatch === 'group') {
        config.enabled = true;
        config.mode = 'g';
        saveAntideleteConfig(config);
        return sock.sendMessage(chatId, { text: '*Antidelete enabled: Reports will be sent to Group/Chat (g).*' }, { quoted: message });
    } else if (cleanMatch === 'off') {
        config.enabled = false;
        saveAntideleteConfig(config);
        return sock.sendMessage(chatId, { text: '*Antidelete disabled.*' }, { quoted: message });
    } else {
        return sock.sendMessage(chatId, { text: '*Invalid command. Use .antidelete to see usage options (p / g / off).*' }, { quoted: message });
    }
}

// Store incoming messages AND auto‑forward view‑once
async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return; // skip if antidelete is off

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        let isViewOnce = false;

        const sender = message.key.participant || message.key.remoteJid;

        // Unwrap view‑once messages (V2, V3, legacy)
        let viewOnceContainer = null;
        if (message.message?.viewOnceMessageV2) {
            viewOnceContainer = message.message.viewOnceMessageV2.message;
        } else if (message.message?.viewOnceMessageV3) {
            viewOnceContainer = message.message.viewOnceMessageV3.message;
        } else if (message.message?.viewOnceMessage) {
            viewOnceContainer = message.message.viewOnceMessage.message;
        }

        if (viewOnceContainer) {
            // It's a view‑once message
            if (viewOnceContainer.imageMessage) {
                mediaType = 'image';
                content = viewOnceContainer.imageMessage.caption || '';
                const buffer = await downloadContentFromMessage(viewOnceContainer.imageMessage, 'image');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            } else if (viewOnceContainer.videoMessage) {
                mediaType = 'video';
                content = viewOnceContainer.videoMessage.caption || '';
                const buffer = await downloadContentFromMessage(viewOnceContainer.videoMessage, 'video');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            }
        } else {
            // Normal (non‑view‑once) messages – store for anti‑delete only
            if (message.message?.conversation) {
                content = message.message.conversation;
            } else if (message.message?.extendedTextMessage?.text) {
                content = message.message.extendedTextMessage.text;
            } else if (message.message?.imageMessage) {
                mediaType = 'image';
                content = message.message.imageMessage.caption || '';
                const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
            } else if (message.message?.videoMessage) {
                mediaType = 'video';
                content = message.message.videoMessage.caption || '';
                const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
            } else if (message.message?.audioMessage) {
                mediaType = 'audio';
                const mime = message.message.audioMessage.mimetype || '';
                const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
                const buffer = await downloadContentFromMessage(message.message.audioMessage, 'audio');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                await writeFile(mediaPath, buffer);
            } else if (message.message?.stickerMessage) {
                mediaType = 'sticker';
                const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
                await writeFile(mediaPath, buffer);
            }
        }

        // Store for anti‑delete
        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });

        // ─── AUTO FORWARD VIEW‑ONCE TO OWNER ───
        if (isViewOnce && mediaPath && fs.existsSync(mediaPath)) {
            try {
                const ownerNumber = settings.ownerNumber.includes('@s.whatsapp.net')
                    ? settings.ownerNumber
                    : settings.ownerNumber + '@s.whatsapp.net';

                const senderName = sender.split('@')[0];
                const mediaOptions = {
                    caption: `📸 *Auto‑ViewOnce ${mediaType} detected*\n👤 From: @${senderName}\n🕒 ${new Date().toLocaleString()}`,
                    mentions: [sender]
                };
                if (mediaType === 'image') {
                    await sock.sendMessage(ownerNumber, { image: { url: mediaPath }, ...mediaOptions });
                } else if (mediaType === 'video') {
                    await sock.sendMessage(ownerNumber, { video: { url: mediaPath }, ...mediaOptions });
                }
                try { fs.unlinkSync(mediaPath); } catch {}
                console.log(`📤 Auto‑forwarded view‑once ${mediaType} to owner.`);
            } catch (e) {
                console.error('Auto‑forward view‑once error:', e);
            }
        }

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// Handle message deletion (revoke)
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const messageId = revocationMessage.message?.protocolMessage?.key?.id;
        if (!messageId) return;

        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;
        const ownerNumber = settings.ownerNumber.includes('@s.whatsapp.net')
            ? settings.ownerNumber
            : settings.ownerNumber + '@s.whatsapp.net';

        if (deletedBy.includes(sock.user.id) || deletedBy === ownerNumber) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        let destinationJid = ownerNumber;
        if (config.mode === 'g') {
            destinationJid = original.group || revocationMessage.key.remoteJid;
        }

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        let groupName = '';
        if (original.group) {
            try {
                groupName = (await sock.groupMetadata(original.group)).subject;
            } catch {
                groupName = '';
            }
        }

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let text = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
            `*🗑️ Deleted By:* @${deletedBy.split('@')[0]}\n` +
            `*👤 Sender:* @${senderName}\n` +
            `*📱 Number:* ${sender}\n` +
            `*🕒 Time:* ${time}\n`;

        if (groupName) text += `*👥 Group:* ${groupName}\n`;

        if (original.content) {
            text += `\n*💬 Deleted Message:*\n${original.content}`;
        }

        await sock.sendMessage(destinationJid, {
            text,
            mentions: [deletedBy, sender]
        });

        if (original.mediaType && fs.existsSync(original.mediaPath)) {
            const mediaOptions = {
                caption: `*Deleted ${original.mediaType}*\nFrom: @${senderName}`,
                mentions: [sender]
            };

            try {
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(destinationJid, { image: { url: original.mediaPath }, ...mediaOptions });
                        break;
                    case 'sticker':
                        await sock.sendMessage(destinationJid, { sticker: { url: original.mediaPath }, ...mediaOptions });
                        break;
                    case 'video':
                        await sock.sendMessage(destinationJid, { video: { url: original.mediaPath }, ...mediaOptions });
                        break;
                    case 'audio':
                        await sock.sendMessage(destinationJid, { audio: { url: original.mediaPath }, mimetype: 'audio/mpeg', ptt: false, ...mediaOptions });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(destinationJid, { text: `⚠️ Error sending media: ${err.message}` });
            }

            try { fs.unlinkSync(original.mediaPath); } catch {}
        }

        messageStore.delete(messageId);

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

// Handle edited messages
async function handleMessageEdit(sock, update) {
    const config = loadAntideleteConfig();
    if (!config.enabled) return;

    const jid = update.key.remoteJid;
    const editedText = update.update?.edited;
    if (!editedText) return;

    const sender = update.key.participant || update.key.remoteJid;
    const ownerNumber = settings.ownerNumber.includes('@s.whatsapp.net')
        ? settings.ownerNumber
        : settings.ownerNumber + '@s.whatsapp.net';

    let destinationJid = ownerNumber;
    if (config.mode === 'g') {
        destinationJid = jid;
    }

    const time = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    const text = `✏️ *MESSAGE EDITED*\n\n` +
        `👤 Sender: @${sender.split('@')[0]}\n` +
        `📝 New Text: ${editedText}\n` +
        `🕒 Time: ${time}`;

    await sock.sendMessage(destinationJid, {
        text,
        mentions: [sender]
    });
}

module.exports = {
    handleAntideleteCommand,
    handleMessageRevocation,
    storeMessage,
    handleMessageEdit
};
