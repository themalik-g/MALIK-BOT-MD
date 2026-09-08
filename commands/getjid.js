module.exports = {
    pattern: /^\.getjid\s+(\d+)/,
    function: async (sock, msg, match) => {
        let number = match[1];
        if (!number) return msg.reply('Usage: .getjid 923257853673');
        number = number.replace(/[^0-9]/g, '');
        if (number.length < 8) return msg.reply('Invalid number. Use international format without + or spaces.');
        const jid = number + '@s.whatsapp.net';
        try {
            const [result] = await sock.onWhatsApp(jid);
            if (result?.exists) {
                await msg.reply(`📱 JID: ${result.jid}\n✅ Registered on WhatsApp`);
            } else {
                await msg.reply(`📱 JID: ${jid}\n⚠️ Not registered on WhatsApp (or number invalid)`);
            }
        } catch {
            await msg.reply(`📱 JID: ${jid}\n⚠️ Could not verify registration.`);
        }
    }
};
