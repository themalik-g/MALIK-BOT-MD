const fs = require('fs');
const path = require('path');

function loadUserGroupData() {
    try {
        const dataPath = path.join(__dirname, '../data/userGroupData.json');
        if (!fs.existsSync(dataPath)) {
            const defaultData = {
                antibadword: {},
                antilink: {},
                welcome: {},
                goodbye: {},
                chatbot: {},
                warnings: {},
                sudo: [],
                antisticker: {}
            };
            fs.writeFileSync(dataPath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (error) {
        console.error('Error loading user group data:', error);
        return { antibadword: {}, antilink: {}, welcome: {}, goodbye: {}, chatbot: {}, warnings: {}, antisticker: {} };
    }
}

function saveUserGroupData(data) {
    try {
        const dataPath = path.join(__dirname, '../data/userGroupData.json');
        const dir = path.dirname(dataPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving user group data:', error);
        return false;
    }
}

// ---------------------------------------------------------
// Existing functions (antilink, antitag, warnings, sudo, welcome, goodbye, antibadword, chatbot)
// Keep them exactly as you have – I'm not changing them.
// Just ensure the module.exports includes the new anti‑sticker helpers at the end.
// ---------------------------------------------------------

// ========== ANTI-STICKER HELPERS (NEW) ==========
async function setAntiSticker(groupId, enabled) {
    const data = loadUserGroupData();
    if (!data.antisticker) data.antisticker = {};
    data.antisticker[groupId] = { enabled: !!enabled };
    saveUserGroupData(data);
    return true;
}

async function getAntiSticker(groupId) {
    const data = loadUserGroupData();
    return data.antisticker?.[groupId]?.enabled || false;
}

async function removeAntiSticker(groupId) {
    const data = loadUserGroupData();
    if (data.antisticker) delete data.antisticker[groupId];
    saveUserGroupData(data);
    return true;
}

module.exports = {
    // ... (your existing exports)
    setAntilink, getAntilink, removeAntilink,
    setAntitag, getAntitag, removeAntitag,
    incrementWarningCount, resetWarningCount,
    isSudo, addSudo, removeSudo, getSudoList,
    addWelcome, delWelcome, isWelcomeOn, getWelcome,
    addGoodbye, delGoodBye, isGoodByeOn, getGoodbye,
    setAntiBadword, getAntiBadword, removeAntiBadword,
    setChatbot, getChatbot, removeChatbot,
    // new
    setAntiSticker,
    getAntiSticker,
    removeAntiSticker
};
