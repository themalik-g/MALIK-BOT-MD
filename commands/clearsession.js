const fs = require('fs');
const path = require('path');
const os = require('os');
const isOwnerOrSudo = require('../lib/isOwner');

const channelInfo = {
    contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363409689492071@newsletter',
            newsletterName: '𝙈𝘼𝙇𝙄𝙆 𝙈𝘿',
            serverMessageId: -1
        }
    }
};

async function clearSessionCommand(sock, chatId, msg) {
    try {
        const senderId = msg.key.participant || msg.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!msg.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ This command can only be used by the owner!',
                ...channelInfo
            });
            return;
        }

        // Define session directory
        const sessionDir = path.join(__dirname, '../session');

        if (!fs.existsSync(sessionDir)) {
            await sock.sendMessage(chatId, {
                text: '❌ Session directory not found!',
                ...channelInfo
            });
            return;
        }

        let filesCleared = 0;
        let errors = 0;
        let errorDetails = [];

        // Send initial status
        await sock.sendMessage(chatId, {
            text: `🔍 Optimizing session files for better performance...`,
            ...channelInfo
        });

        const files = fs.readdirSync(sessionDir);

        // Count files by type for optimization
        let appStateSyncCount = 0;
        let preKeyCount = 0;
        let deviceListCount = 0;
        let identityKeyCount = 0;
        let lidMappingCount = 0;
        let otherCount = 0;

        for (const file of files) {
            if (file === 'creds.json') continue;
            if (file.startsWith('app-state-sync-')) appStateSyncCount++;
            else if (file.startsWith('pre-key-')) preKeyCount++;
            else if (file.startsWith('device-list-')) deviceListCount++;
            else if (file.startsWith('identity-key-')) identityKeyCount++;
            else if (file.startsWith('lid-mapping-')) lidMappingCount++;
            else otherCount++;
        }

        // Delete files
        for (const file of files) {
            if (file === 'creds.json') {
                // Keep creds.json completely safe!
                continue;
            }
            try {
                const filePath = path.join(sessionDir, file);
                fs.unlinkSync(filePath);
                filesCleared++;
            } catch (error) {
                errors++;
                errorDetails.push(`Failed to delete ${file}: ${error.message}`);
            }
        }

        // Send completion message
        const message = `✅ Session files cleared successfully!\n\n` +
                       `📊 Statistics:\n` +
                       `• Total files cleared: ${filesCleared}\n` +
                       `• Device list files: ${deviceListCount}\n` +
                       `• Identity key files: ${identityKeyCount}\n` +
                       `• LID mapping files: ${lidMappingCount}\n` +
                       `• Pre-key files: ${preKeyCount}\n` +
                       `• App state sync files: ${appStateSyncCount}\n` +
                       (errors > 0 ? `\n⚠️ Errors encountered: ${errors}\n${errorDetails.join('\n')}` : '');

        await sock.sendMessage(chatId, {
            text: message,
            ...channelInfo
        });

    } catch (error) {
        console.error('Error in clearsession command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to clear session files!',
            ...channelInfo
        });
    }
}

module.exports = clearSessionCommand;