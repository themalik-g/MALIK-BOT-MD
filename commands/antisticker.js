const { setAntiSticker, removeAntiSticker } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

module.exports = {
    pattern: /^\.antisticker\s+(on|off)$/,
    function: async (sock, msg, match) => {
        const chatId = msg.key.remoteJid;
        if (!chatId.endsWith('@g.us')) return msg.reply('❌ This command is only for groups.');
        const senderId = msg.key.participant || msg.key.remoteJid;
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isBotAdmin) return msg.reply('❌ Please make me an admin first.');
        if (!isSenderAdmin) return msg.reply('❌ Only group admins can use this.');
        const action = match[1];
        if (action === 'on') {
            await setAntiSticker(chatId, true);
            await msg.reply('✅ Anti‑sticker enabled. I will delete all stickers sent in this group.');
        } else {
            await removeAntiSticker(chatId);
            await msg.reply('✅ Anti‑sticker disabled.');
        }
    }
};
