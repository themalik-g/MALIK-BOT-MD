const fs = require('fs');
const path = require('path');

const SCHEDULE_FILE = path.join(__dirname, '../data/schedule.json');
let scheduledTasks = [];

function loadTasks() {
    try {
        if (fs.existsSync(SCHEDULE_FILE)) {
            scheduledTasks = JSON.parse(fs.readFileSync(SCHEDULE_FILE));
        } else {
            scheduledTasks = [];
            fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduledTasks, null, 2));
        }
    } catch (e) {
        scheduledTasks = [];
    }
}

function saveTasks() {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduledTasks, null, 2));
}

function addTask(task) {
    task.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    scheduledTasks.push(task);
    saveTasks();
    return task.id;
}

function removeTask(id) {
    scheduledTasks = scheduledTasks.filter(t => t.id !== id);
    saveTasks();
}

function listTasks() {
    return scheduledTasks;
}

async function checkTasks(sock) {
    const now = Date.now();
    const toExecute = scheduledTasks.filter(t => t.time <= now);
    for (const task of toExecute) {
        try {
            if (task.type === 'message') {
                await sock.sendMessage(task.chatId, { text: task.content });
            }
            // Extend for media, status, channels here
        } catch (e) {
            console.error('Scheduler error:', e);
        }
        removeTask(task.id);
    }
}

function startScheduler(sock) {
    loadTasks();
    setInterval(async () => {
        await checkTasks(sock);
    }, 60000); // Check every minute
}

module.exports = {
    loadTasks,
    saveTasks,
    addTask,
    removeTask,
    listTasks,
    startScheduler
};
