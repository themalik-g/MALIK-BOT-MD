/**
 * Ultra-lightweight in-memory store for Baileys
 * Replaces heavy makeInMemoryStore to save ~100MB+ RAM
 */

const fs = require('fs')
const path = require('path')

const STORE_FILE = './data/store.json'
const MAX_MESSAGES_PER_CHAT = 20
const MAX_CHATS = 50

let store = {
    chats: {},
    contacts: {},
    messages: {},
    state: { connection: 'close' }
}

function readFromFile() {
    try {
        if (fs.existsSync(STORE_FILE)) {
            const data = fs.readFileSync(STORE_FILE, 'utf8')
            store = JSON.parse(data)
            store.chats = store.chats || {}
            store.contacts = store.contacts || {}
            store.messages = store.messages || {}
        }
    } catch (e) {
        console.error('Error reading store:', e.message)
    }
}

function writeToFile() {
    try {
        const dir = path.dirname(STORE_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        trimMessages()
        fs.writeFileSync(STORE_FILE, JSON.stringify(store, safeReplacer, 0))
    } catch (e) {
        console.error('Error writing store:', e.message)
    }
}

function safeReplacer(key, value) {
    if (typeof value === 'bigint') return value.toString()
    if (value instanceof Buffer) return value.toString('base64')
    if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
    return value
}

function trimMessages() {
    const chatIds = Object.keys(store.messages)
    if (chatIds.length > MAX_CHATS) {
        const toDelete = chatIds.slice(0, chatIds.length - MAX_CHATS)
        toDelete.forEach(id => delete store.messages[id])
    }
    chatIds.forEach(chatId => {
        const msgs = store.messages[chatId]
        if (Array.isArray(msgs) && msgs.length > MAX_MESSAGES_PER_CHAT) {
            store.messages[chatId] = msgs.slice(-MAX_MESSAGES_PER_CHAT)
        }
    })
}

function bind(ev) {
    if (!ev) return

    ev.on('chats.set', ({ chats }) => {
        for (const chat of chats) {
            store.chats[chat.id] = chat
        }
    })

    ev.on('contacts.set', ({ contacts }) => {
        for (const contact of contacts) {
            store.contacts[contact.id] = contact
        }
    })

    ev.on('messages.set', ({ messages, isLatest }) => {
        if (!isLatest) return
        for (const message of messages.slice(-5)) {
            const chatId = message.key.remoteJid
            if (!chatId) continue
            if (!store.messages[chatId]) store.messages[chatId] = []
            store.messages[chatId].push(message)
        }
        trimMessages()
    })

    ev.on('chats.upsert', (chats) => {
        for (const chat of chats) {
            store.chats[chat.id] = { ...store.chats[chat.id], ...chat }
        }
    })

    ev.on('chats.update', (updates) => {
        for (const update of updates) {
            const chat = store.chats[update.id]
            if (chat) {
                Object.assign(chat, update)
            } else {
                store.chats[update.id] = update
            }
        }
    })

    ev.on('contacts.upsert', (contacts) => {
        for (const contact of contacts) {
            store.contacts[contact.id] = { ...store.contacts[contact.id], ...contact }
        }
    })

    ev.on('contacts.update', (updates) => {
        for (const update of updates) {
            const contact = store.contacts[update.id]
            if (contact) {
                Object.assign(contact, update)
            } else {
                store.contacts[update.id] = update
            }
        }
    })

    ev.on('messages.upsert', ({ messages }) => {
        for (const message of messages) {
            const chatId = message.key.remoteJid
            if (!chatId) continue
            if (!store.messages[chatId]) store.messages[chatId] = []
            store.messages[chatId].push(message)
        }
        trimMessages()
    })

    ev.on('messages.update', (updates) => {
        for (const { key, update } of updates) {
            const chatId = key.remoteJid
            const msgList = store.messages[chatId]
            if (!msgList) continue
            const msg = msgList.find(m => m.key.id === key.id)
            if (msg) {
                Object.assign(msg, update)
            }
        }
    })
}

function loadMessage(jid, id) {
    const msgs = store.messages[jid]
    if (!msgs) return undefined
    return msgs.find(m => m.key.id === id)
}

module.exports = {
    readFromFile,
    writeToFile,
    bind,
    loadMessage,
    store,
    chats: store.chats,
    contacts: store.contacts,
    messages: store.messages
}
