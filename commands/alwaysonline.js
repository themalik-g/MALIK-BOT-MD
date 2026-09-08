// Simple in-memory toggle (persist if needed)
let alwaysOnline = true; // default: show online

function isAlwaysOnlineEnabled() {
    return alwaysOnline;
}

function toggleAlwaysOnline(state) {
    if (typeof state === 'boolean') alwaysOnline = state;
    else alwaysOnline = !alwaysOnline;
    return alwaysOnline;
}

module.exports = {
    isAlwaysOnlineEnabled,
    toggleAlwaysOnline
};
