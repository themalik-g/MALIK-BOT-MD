const { addTask, removeTask, listTasks } = require('../lib/scheduler');

module.exports = {
    pattern: /^\.schedule\s+(add|list|remove)\s*(.*)/,
    function: async (sock, msg, match) => {
        const action = match[1];
        const args = match[2].trim();

        if (action === 'add') {
            const [date, time, ...textParts] = args.split(/\s+/);
            const content = textParts.join(' ');
            if (!date || !time || !content) {
                return msg.reply('Usage: .schedule add YYYY-MM-DD HH:MM "Your message"');
            }
            const timestamp = new Date(`${date}T${time}:00`).getTime();
            if (isNaN(timestamp) || timestamp < Date.now()) {
                return msg.reply('❌ Invalid date or time in the past.');
            }
            const task = {
                chatId: msg.key.remoteJid,
                type: 'message',
                content,
                time: timestamp
            };
            const id = addTask(task);
            await msg.reply(`✅ Scheduled message for ${date} ${time}. Task ID: ${id}`);
        } else if (action === 'list') {
            const tasks = listTasks();
            if (tasks.length === 0) return msg.reply('No scheduled tasks.');
            const text = tasks.map((t, i) => `${i+1}. ID: ${t.id} | ${new Date(t.time).toLocaleString()} | ${t.content}`).join('\n');
            await msg.reply(`📋 Scheduled tasks:\n${text}`);
        } else if (action === 'remove') {
            if (!args) return msg.reply('Usage: .schedule remove <task_id>');
            removeTask(args);
            await msg.reply(`✅ Task ${args} removed.`);
        } else {
            await msg.reply('Usage: .schedule add|list|remove');
        }
    }
};
