const { downloadMediaMessage } = require('toxic-baileys');

async function viewonceCommand(sock, chatId, message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
        return sock.sendMessage(chatId, { text: '❌ Reply to a view‑once message with .vv' }, { quoted: message });
    }

    let mediaMsg = null;
    let msgType = null;
    if (quoted.viewOnceMessageV2) {
        mediaMsg = quoted.viewOnceMessageV2.message;
        msgType = 'viewOnceMessageV2';
    } else if (quoted.viewOnceMessageV3) {
        mediaMsg = quoted.viewOnceMessageV3.message;
        msgType = 'viewOnceMessageV3';
    } else if (quoted.viewOnceMessage) {
        mediaMsg = quoted.viewOnceMessage.message;
        msgType = 'viewOnceMessage';
    } else if (quoted.imageMessage?.viewOnce) {
        mediaMsg = quoted.imageMessage;
        msgType = 'imageMessage';
    } else if (quoted.videoMessage?.viewOnce) {
        mediaMsg = quoted.videoMessage;
        msgType = 'videoMessage';
    }

    if (!mediaMsg) {
        return sock.sendMessage(chatId, { text: '❌ Not a view‑once media.' }, { quoted: message });
    }

    try {
        const fakeMsg = {
            key: {
                remoteJid: chatId,
                id: message.key.id,
                participant: message.key.participant
            },
            message: msgType.startsWith('viewOnce')
                ? { [msgType]: { message: mediaMsg } }
                : { [msgType]: mediaMsg }
        };

        const buffer = await downloadMediaMessage(
            fakeMsg,
            'buffer',
            {},
            { logger: console }
        );

        if (!buffer) throw new Error('Download failed');

        let mime = 'document';
        let ext = 'bin';
        if (mediaMsg.imageMessage) {
            mime = 'image';
            ext = 'jpg';
        } else if (mediaMsg.videoMessage) {
            mime = 'video';
            ext = 'mp4';
        } else if (mediaMsg.audioMessage) {
            mime = 'audio';
            ext = 'mp3';
        } else {
            mime = 'document';
            ext = 'bin';
        }

        await sock.sendMessage(chatId, {
            [mime]: buffer,
            fileName: `viewonce.${ext}`,
            caption: '📸 View‑once media saved!'
        }, { quoted: message });

    } catch (error) {
        console.error('ViewOnce error:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to download view‑once media.'
        }, { quoted: message });
    }
}

module.exports = viewonceCommand;
