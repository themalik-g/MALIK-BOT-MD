/**
 * MEHTAB-MD - WhatsApp Bot
 * Copyright (c) 2024 MALIK MEHTAB
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const PhoneNumber = require('awesome-phonenumber')
const { smsg } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("toxic-baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { rmSync } = require('fs')

// Store
const store = require('./lib/lightweight_store')

// Import handlers
const {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus,
    handleMessageRevocation,
    handleMessageEdit,
    storeMessage
} = require('./main')

// Scheduler
const { startScheduler } = require('./lib/scheduler')

// ──────────────────── CONFIG ────────────────────
const STABILITY_CONFIG = {
    maxReconnectDelay: 30000,
    initialReconnectDelay: 3000,
    reconnectBackoffMultiplier: 1.5,
    maxConsecutiveCrashes: 15,
    crashResetInterval: 600000,
    ramWarningThreshold: 180,
    ramCriticalThreshold: 220,
    gcInterval: 30000,
    healthCheckInterval: 20000,
    storeWriteInterval: 15000,
    keepAliveInterval: 20000,
    connectionTimeout: 60000,
    defaultQueryTimeout: 60000,
}

let crashCount = 0
let lastCrashTime = Date.now()
let reconnectDelay = STABILITY_CONFIG.initialReconnectDelay
let isConnecting = false
let gcTimer = null
let storeTimer = null
let memoryTimer = null

store.readFromFile()
const settings = require('./settings')

storeTimer = setInterval(() => {
    try { store.writeToFile() } catch (e) { console.error('Store write error:', e.message) }
}, settings.storeWriteInterval || STABILITY_CONFIG.storeWriteInterval)

// ──────────────────── MEMORY ────────────────────
gcTimer = setInterval(() => {
    try {
        if (global.gc) {
            global.gc()
            const used = process.memoryUsage().rss / 1024 / 1024
            if (used > 150) console.log(`🧹 GC | RAM: ${used.toFixed(1)}MB`)
        }
    } catch (e) {}
}, STABILITY_CONFIG.gcInterval)

memoryTimer = setInterval(() => {
    try {
        const used = process.memoryUsage().rss / 1024 / 1024
        if (used > STABILITY_CONFIG.ramCriticalThreshold) {
            console.log(`🚨 CRITICAL RAM (${used.toFixed(1)}MB) — forcing GC...`)
            if (global.gc) global.gc()
            setTimeout(() => {
                const stillUsed = process.memoryUsage().rss / 1024 / 1024
                if (stillUsed > STABILITY_CONFIG.ramCriticalThreshold) {
                    console.log(`💀 RAM still critical. Graceful restart...`)
                    process.exit(1)
                }
            }, 5000)
        } else if (used > STABILITY_CONFIG.ramWarningThreshold) {
            console.log(`⚠️ RAM high: ${used.toFixed(1)}MB`)
            if (global.gc) global.gc()
        }
    } catch (e) {}
}, STABILITY_CONFIG.healthCheckInterval)

// ──────────────────── BOT CONFIG ────────────────────
let phoneNumber = "923257853673"
global.botname = "MEHTAB-MD"
global.themeemoji = "•"
const pairingCode = true
const useMobile = process.argv.includes("--mobile")

const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) return new Promise((resolve) => rl.question(text, resolve))
    return Promise.resolve(settings.ownerNumber || phoneNumber)
}

function getReconnectDelay() {
    const now = Date.now()
    if (now - lastCrashTime > STABILITY_CONFIG.crashResetInterval) {
        crashCount = 0
        reconnectDelay = STABILITY_CONFIG.initialReconnectDelay
    }
    crashCount++
    lastCrashTime = now
    if (crashCount > STABILITY_CONFIG.maxConsecutiveCrashes) {
        console.log(`❌ Too many crashes (${crashCount}). Waiting ${(STABILITY_CONFIG.crashResetInterval/1000/60).toFixed(0)} min...`)
        return STABILITY_CONFIG.crashResetInterval
    }
    const delay = Math.min(reconnectDelay, STABILITY_CONFIG.maxReconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * STABILITY_CONFIG.reconnectBackoffMultiplier, STABILITY_CONFIG.maxReconnectDelay)
    return delay
}

function resetReconnectDelay() {
    crashCount = 0
    reconnectDelay = STABILITY_CONFIG.initialReconnectDelay
}

// ──────────────────── MAIN BOT ────────────────────
async function startXeonBotInc() {
    if (isConnecting) {
        console.log('⏳ Connection already in progress, skipping...')
        return
    }
    isConnecting = true

    try {
        let { version } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: STABILITY_CONFIG.defaultQueryTimeout,
            connectTimeoutMs: STABILITY_CONFIG.connectionTimeout,
            keepAliveIntervalMs: STABILITY_CONFIG.keepAliveInterval,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 3,
            fireInitQueries: true,
            shouldSyncHistoryMessage: () => false,
            shouldIgnoreJid: (jid) => jid === 'status@broadcast',
        })

        sock.ev.on('creds.update', saveCreds)
        store.bind(sock.ev)

        // ──────────── DECODE JID ────────────
        sock.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
        }

        // ──────────── CONTACTS ────────────
        sock.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = sock.decodeJid(contact.id)
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })

        sock.getName = (jid, withoutContact = false) => {
            const id = sock.decodeJid(jid)
            withoutContact = sock.withoutContact || withoutContact
            let v
            if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
                v = store.contacts[id] || {}
                if (!(v.name || v.subject)) v = sock.groupMetadata(id) || {}
                resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
            })
            else v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === sock.decodeJid(sock.user.id) ?
                sock.user : (store.contacts[id] || {})
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
        }

        sock.public = true
        sock.serializeM = (m) => smsg(sock, m, store)

        // ──────────── PAIRING CODE ────────────
        if (pairingCode && !sock.authState.creds.registered) {
            if (useMobile) throw new Error('Cannot use pairing code with mobile api')

            let phoneNumber
            if (!!global.phoneNumber) {
                phoneNumber = global.phoneNumber
            } else {
                phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 6281376552730 (without + or spaces) : `)))
            }

            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
            const pn = require('awesome-phonenumber');
            if (!pn('+' + phoneNumber).isValid()) {
                console.log(chalk.red('Invalid phone number. Please enter your full international number without + or spaces.'));
                process.exit(1);
            }

            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(phoneNumber)
                    code = code?.match(/.{1,4}/g)?.join("-") || code
                    console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                    console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
                } catch (error) {
                    console.error('Error requesting pairing code:', error)
                    console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
                }
            }, 3000)
        }

        // ──────────── MESSAGES.UPSERT ────────────
        sock.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message

                // Store every message for anti‑delete & view‑once
                await storeMessage(sock, mek)

                // Handle status updates
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(sock, chatUpdate)
                    return
                }

                if (!sock.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                    if (!isGroup) return
                }

                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                try {
                    await handleMessages(sock, chatUpdate, true)
                } catch (err) {
                    console.error("Error in handleMessages:", err)
                }
            } catch (err) {
                console.error("Error in messages.upsert:", err)
            }
        })

        // ──────────── MESSAGES.UPDATE (Anti‑Edit & Revoke) ────────────
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                try {
                    if (update.update?.edited) {
                        await handleMessageEdit(sock, update)
                    }
                    if (update.update?.revoke) {
                        // Build fake message for revocation handler
                        const fakeMsg = {
                            message: {
                                protocolMessage: {
                                    key: update.key,
                                    type: 0
                                }
                            },
                            participant: update.key.participant || update.key.remoteJid,
                            key: update.key
                        }
                        await handleMessageRevocation(sock, fakeMsg)
                    }
                } catch (err) {
                    console.error("Error in messages.update:", err)
                }
            }
        })

        // ──────────── GROUP PARTICIPANTS ────────────
        sock.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(sock, update)
        })

        // ──────────── CONNECTION UPDATE ────────────
        sock.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s

            if (qr) {
                console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
            }

            if (connection === 'connecting') {
                console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
            }

            if (connection == "open") {
                resetReconnectDelay()
                console.log(chalk.magenta(` `))
                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(sock.user, null, 2)))

                // Start scheduler
                startScheduler(sock)

                try {
                    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    await sock.sendMessage(botNumber, {
                        text: `🤖 MEHTAB-MD Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!`,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363409689492071@newsletter',
                                newsletterName: 'MEHTAB-MD',
                                serverMessageId: -1
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error sending connection message:', error.message)
                }

                await delay(1999)
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'MEHTAB-MD'} ]`)}\n\n`))
                console.log(chalk.cyan(`< ================================================== >`))
                console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: @problem_solved`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: themalik-g`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: 923257853673`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: Malik Mehtab`))
                console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
                console.log(chalk.blue(`Bot Version: ${settings.version}`))
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode
                const reason = lastDisconnect?.error?.message || "Unknown"
                console.log(chalk.red(`Connection closed. Status: ${statusCode}, Reason: ${reason}`))

                isConnecting = false

                const isRestartRequired = statusCode === 515 || statusCode === DisconnectReason.restartRequired
                const needsReauth = [
                    DisconnectReason.loggedOut,
                    DisconnectReason.badSession,
                    DisconnectReason.multideviceMismatch
                ].includes(statusCode)

                if (needsReauth) {
                    console.log(chalk.yellow('🔄 Session invalid. Clearing auth and restarting...'))
                    try {
                        rmSync('./session', { recursive: true, force: true })
                        console.log(chalk.green('✅ Session folder cleared.'))
                    } catch (error) {
                        console.error('Error deleting session:', error)
                    }
                    const delayMs = getReconnectDelay()
                    console.log(chalk.yellow(`🔄 Restarting for re-authentication in ${(delayMs/1000).toFixed(1)}s...`))
                    setTimeout(() => {
                        startXeonBotInc().catch(err => {
                            console.error('Reconnection failed:', err)
                        })
                    }, delayMs)
                    return
                }

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut
                if (shouldReconnect || isRestartRequired) {
                    const delayMs = getReconnectDelay()
                    console.log(chalk.yellow(`Reconnecting in ${(delayMs/1000).toFixed(1)}s... (crash #${crashCount})`))
                    setTimeout(() => {
                        startXeonBotInc().catch(err => {
                            console.error('Reconnection failed:', err)
                        })
                    }, delayMs)
                } else {
                    console.log(chalk.red('Logged out. Exiting.'))
                    process.exit(0)
                }
            }
        })

        // ──────────── ANTI-CALL ────────────
        let anticallModule = null
        try { anticallModule = require('./commands/anticall') } catch (e) {}

        const antiCallNotified = new Set()
        sock.ev.on('call', async (calls) => {
            try {
                if (!anticallModule) return
                const state = anticallModule.readState ? anticallModule.readState() : { enabled: false }
                if (!state.enabled) return

                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId
                    if (!callerJid) continue

                    try {
                        if (typeof sock.rejectCall === 'function' && call.id) {
                            await sock.rejectCall(call.id, callerJid)
                        }
                    } catch {}

                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid)
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000)
                        await sock.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected.' })
                    }

                    setTimeout(async () => {
                        try { await sock.updateBlockStatus(callerJid, 'block') } catch {}
                    }, 800)
                }
            } catch (e) {}
        })

        isConnecting = false
        return sock

    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        isConnecting = false
        const delayMs = getReconnectDelay()
        console.log(chalk.yellow(`Restarting bot in ${(delayMs/1000).toFixed(1)}s due to error...`))
        setTimeout(() => {
            startXeonBotInc().catch(err => {
                console.error('Fatal restart error:', err)
            })
        }, delayMs)
    }
}

// ──────────────────── PROCESS HANDLERS ────────────────────
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message)
})

process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled Rejection:', err?.message || err)
})

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Cleaning up...')
    if (storeTimer) clearInterval(storeTimer)
    if (gcTimer) clearInterval(gcTimer)
    if (memoryTimer) clearInterval(memoryTimer)
    process.exit(0)
})

process.on('SIGINT', () => {
    console.log('SIGINT received. Cleaning up...')
    if (storeTimer) clearInterval(storeTimer)
    if (gcTimer) clearInterval(gcTimer)
    if (memoryTimer) clearInterval(memoryTimer)
    process.exit(0)
})

// ──────────────────── START ────────────────────
startXeonBotInc().catch(error => {
    console.error('Fatal startup error:', error)
    const delayMs = getReconnectDelay()
    setTimeout(() => {
        startXeonBotInc().catch(err => {
            console.error('Second startup attempt failed:', err)
            process.exit(1)
        })
    }, delayMs)
})se pairing code with mobile api')
            let phoneNumber
            if (!!global.phoneNumber) {
                phoneNumber = global.phoneNumber
            } else {
                phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 6281376552730 (without + or spaces) : `)))
            }
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
            const pn = require('awesome-phonenumber');
            if (!pn('+' + phoneNumber).isValid()) {
                console.log(chalk.red('Invalid phone number. Please enter your full international number without + or spaces.'));
                process.exit(1);
            }
            setTimeout(async () => {
                try {
                    let code = await XeonBotInc.requestPairingCode(phoneNumber)
                    code = code?.match(/.{1,4}/g)?.join("-") || code
                    console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                    console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
                } catch (error) {
                    console.error('Error requesting pairing code:', error)
                    console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
                }
            }, 3000)
        }

        XeonBotInc.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s
            if (qr) console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
            if (connection === 'connecting') console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
            if (connection == "open") {
                resetReconnectDelay()
                console.log(chalk.magenta(` `))
                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

                // Start scheduler
                startScheduler(XeonBotInc);

                const { isAlwaysOnlineEnabled } = require('./commands/alwaysonline');
                if (global.alwaysOnlineInterval) clearInterval(global.alwaysOnlineInterval);
                global.alwaysOnlineInterval = setInterval(async () => {
                    try { if (XeonBotInc?.user) await XeonBotInc.sendPresenceUpdate(isAlwaysOnlineEnabled() ? 'available' : 'unavailable'); } catch (e) {}
                }, 30000);
                try { await XeonBotInc.sendPresenceUpdate(isAlwaysOnlineEnabled() ? 'available' : 'unavailable'); } catch (e) {}

                try {
                    const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                    await XeonBotInc.sendMessage(botNumber, {
                        text: `🤖 MEHTAB-MD Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!`,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363409689492071@newsletter',
                                newsletterName: 'MEHTAB-MD',
                                serverMessageId: -1
                            }
                        }
                    });
                } catch (error) { console.error('Error sending connection message:', error.message) }

                await delay(1999)
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'MEHTAB-MD'} ]`)}\n\n`))
                console.log(chalk.cyan(`< ================================================== >`))
                console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: @problem_solved`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: themalik-g`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: 923257853673`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: Malik Mehtab`))
                console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
                console.log(chalk.blue(`Bot Version: ${settings.version}`))
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode
                const reason = lastDisconnect?.error?.message || "Unknown"
                console.log(chalk.red(`Connection closed. Status: ${statusCode}, Reason: ${reason}`))
                isConnecting = false
                const isRestartRequired = statusCode === 515 || statusCode === DisconnectReason.restartRequired
                const needsReauth = [DisconnectReason.loggedOut, DisconnectReason.badSession, DisconnectReason.multideviceMismatch].includes(statusCode)
                if (needsReauth) {
                    console.log(chalk.yellow('🔄 Session invalid. Clearing auth and restarting...'))
                    try { rmSync('./session', { recursive: true, force: true }); console.log(chalk.green('✅ Session folder cleared.')) } catch (error) { console.error('Error deleting session:', error) }
                    const delayMs = getReconnectDelay()
                    console.log(chalk.yellow(`🔄 Restarting for re-authentication in ${(delayMs/1000).toFixed(1)}s...`))
                    setTimeout(() => { startXeonBotInc().catch(err => { console.error('Reconnection failed:', err) }) }, delayMs)
                    return
                }
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut
                if (shouldReconnect || isRestartRequired) {
                    const delayMs = getReconnectDelay()
                    console.log(chalk.yellow(`Reconnecting in ${(delayMs/1000).toFixed(1)}s... (crash #${crashCount})`))
                    setTimeout(() => { startXeonBotInc().catch(err => { console.error('Reconnection failed:', err) }) }, delayMs)
                } else { console.log(chalk.red('Logged out. Exiting.')); process.exit(0) }
            }
        })

        // Anti-call
        let anticallModule = null
        try { anticallModule = require('./commands/anticall') } catch (e) {}
        const antiCallNotified = new Set()
        XeonBotInc.ev.on('call', async (calls) => {
            try {
                if (!anticallModule) return
                const state = anticallModule.readState ? anticallModule.readState() : { enabled: false }
                if (!state.enabled) return
                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId
                    if (!callerJid) continue
                    try {
                        try { if (typeof XeonBotInc.rejectCall === 'function' && call.id) await XeonBotInc.rejectCall(call.id, callerJid) } catch {}
                        if (!antiCallNotified.has(callerJid)) {
                            antiCallNotified.add(callerJid)
                            setTimeout(() => antiCallNotified.delete(callerJid), 60000)
                            await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected.' })
                        }
                    } catch {}
                    setTimeout(async () => { try { await XeonBotInc.updateBlockStatus(callerJid, 'block') } catch {} }, 800)
                }
            } catch (e) {}
        })

        XeonBotInc.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(XeonBotInc, update)
        })

        isConnecting = false
        return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        isConnecting = false
        const delayMs = getReconnectDelay()
        console.log(chalk.yellow(`Restarting bot in ${(delayMs/1000).toFixed(1)}s due to error...`))
        setTimeout(() => { startXeonBotInc().catch(err => { console.error('Fatal restart error:', err) }) }, delayMs)
    }
}

process.on('uncaughtException', (err) => { console.error('⚠️ Uncaught Exception:', err.message) })
process.on('unhandledRejection', (err) => { console.error('⚠️ Unhandled Rejection:', err?.message || err) })
process.on('SIGTERM', () => { console.log('SIGTERM received. Cleaning up...'); if (storeTimer) clearInterval(storeTimer); if (gcTimer) clearInterval(gcTimer); if (memoryTimer) clearInterval(memoryTimer); process.exit(0) })
process.on('SIGINT', () => { console.log('SIGINT received. Cleaning up...'); if (storeTimer) clearInterval(storeTimer); if (gcTimer) clearInterval(gcTimer); if (memoryTimer) clearInterval(memoryTimer); process.exit(0) })

startXeonBotInc().catch(error => {
    console.error('Fatal startup error:', error)
    const delayMs = getReconnectDelay()
    setTimeout(() => {
        startXeonBotInc().catch(err => { console.error('Second startup attempt failed:', err); process.exit(1) })
    }, delayMs)
})
