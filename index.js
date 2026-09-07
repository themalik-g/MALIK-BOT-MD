/**
 * MEHTAB-MD - A WhatsApp Bot
 * Copyright (c) 2024 MALIK MEHTAB
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const { handleMessages, handleMessageUpdates, handleGroupParticipantUpdate, handleStatus } = require('./main');
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
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { rmSync, existsSync } = require('fs')

// Import lightweight store
const store = require('./lib/lightweight_store')

// ═══════════════════════════════════════════════════════════
// STABILITY & MEMORY CONFIG
// ═══════════════════════════════════════════════════════════

const STABILITY_CONFIG = {
    maxReconnectDelay: 60000,
    initialReconnectDelay: 5000,
    reconnectBackoffMultiplier: 1.5,
    maxConsecutiveCrashes: 10,
    crashResetInterval: 300000,
    ramWarningThreshold: 500,
    ramCriticalThreshold: 800,
    gcInterval: 60000,
    healthCheckInterval: 30000,
    storeWriteInterval: 10000,
    keepAliveInterval: 15000,
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

// ═══════════════════════════════════════════════════════════
// STORE INITIALIZATION
// ═══════════════════════════════════════════════════════════

store.readFromFile()
const settings = require('./settings')

storeTimer = setInterval(() => {
    try { store.writeToFile() } catch (e) { console.error('Store write error:', e.message) }
}, settings.storeWriteInterval || STABILITY_CONFIG.storeWriteInterval)

// ═══════════════════════════════════════════════════════════
// MEMORY MANAGEMENT (Graceful — warn first, kill only if critical)
// ═══════════════════════════════════════════════════════════

gcTimer = setInterval(() => {
    try {
        if (global.gc) {
            global.gc()
            const used = process.memoryUsage().rss / 1024 / 1024
            console.log(`🧹 GC completed | RAM: ${used.toFixed(1)}MB`)
        }
    } catch (e) {}
}, STABILITY_CONFIG.gcInterval)

memoryTimer = setInterval(() => {
    try {
        const used = process.memoryUsage().rss / 1024 / 1024
        if (used > STABILITY_CONFIG.ramCriticalThreshold) {
            console.log(`🚨 CRITICAL RAM (${used.toFixed(1)}MB) — attempting cleanup...`)
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
    } catch (e) { console.error('Memory monitor error:', e.message) }
}, STABILITY_CONFIG.healthCheckInterval)

// ═══════════════════════════════════════════════════════════
// BOT CONFIG
// ═══════════════════════════════════════════════════════════

let phoneNumber = "923257853673"
let owner = []
try {
    owner = JSON.parse(fs.readFileSync('./data/owner.json'))
} catch (e) {
    owner = [phoneNumber]
}

global.botname = "MEHTAB-MD"
global.themeemoji = "•"
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) return new Promise((resolve) => rl.question(text, resolve))
    return Promise.resolve(settings.ownerNumber || phoneNumber)
}

// ═══════════════════════════════════════════════════════════
// RECONNECTION BACKOFF
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// MAIN BOT FUNCTION
// ═══════════════════════════════════════════════════════════

async function startXeonBotInc() {
    if (isConnecting) {
        console.log('⏳ Connection already in progress, skipping...')
        return
    }
    isConnecting = true

    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
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
            maxMsgRetryCount: 5,
            fireInitQueries: true,
            shouldSyncHistoryMessage: () => false,
            shouldIgnoreJid: (jid) => jid === 'status@broadcast',
        })

        XeonBotInc.ev.on('creds.update', saveCreds)
        store.bind(XeonBotInc.ev)

        // ═══════════════════════════════════════════════════
        // MESSAGE HANDLING (Single listener — NO duplicates)
        // ═══════════════════════════════════════════════════

        XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message

                // Status broadcasts
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(XeonBotInc, chatUpdate)
                    return
                }

                // Public/private filter
                if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                    if (!isGroup) return
                }

                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                try {
                    await handleMessages(XeonBotInc, chatUpdate, true)
                } catch (err) {
                    console.error("Error in handleMessages:", err)
                    if (mek.key && mek.key.remoteJid) {
                        await XeonBotInc.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message.',
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363409689492071@newsletter',
                                    newsletterName: 'MEHTAB-MD',
                                    serverMessageId: -1
                                }
                            }
                        }).catch(() => {})
                    }
                }
            } catch (err) {
                console.error("Error in messages.upsert:", err)
            }
        })

        // Message updates (read receipts, etc.)
        XeonBotInc.ev.on('messages.update', async (updates) => {
            try {
                await handleMessageUpdates(XeonBotInc, updates)
            } catch (err) {
                console.error("Error in messages.update:", err)
            }
        })

        // ═══════════════════════════════════════════════════
        // JID DECODE & CONTACTS
        // ═══════════════════════════════════════════════════

        XeonBotInc.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
        }

        XeonBotInc.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = XeonBotInc.decodeJid(contact.id)
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })

        XeonBotInc.ev.on('presence.update', (update) => {
            try {
                const { handlePresenceUpdate } = require('./commands/getonline')
                handlePresenceUpdate(update)
            } catch (e) {}
        })

        XeonBotInc.getName = (jid, withoutContact = false) => {
            const id = XeonBotInc.decodeJid(jid)
            withoutContact = XeonBotInc.withoutContact || withoutContact
            let v
            if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
                v = store.contacts[id] || {}
                if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
                resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
            })
            else v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
                XeonBotInc.user : (store.contacts[id] || {})
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
        }

        XeonBotInc.public = true
        XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

        // ═══════════════════════════════════════════════════
        // PAIRING CODE
        // ═══════════════════════════════════════════════════

        if (pairingCode && !XeonBotInc.authState.creds.registered) {
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

        // ═══════════════════════════════════════════════════
        // CONNECTION HANDLER (Fixed: Auto re-auth on 401/session loss)
        // ═══════════════════════════════════════════════════

        XeonBotInc.ev.on('connection.update', async (s) => {
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
                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

                // Always Online presence updater
                const { isAlwaysOnlineEnabled } = require('./commands/alwaysonline');
                if (global.alwaysOnlineInterval) clearInterval(global.alwaysOnlineInterval);
                global.alwaysOnlineInterval = setInterval(async () => {
                    try {
                        if (XeonBotInc?.user) {
                            await XeonBotInc.sendPresenceUpdate(isAlwaysOnlineEnabled() ? 'available' : 'unavailable');
                        }
                    } catch (e) {}
                }, 20000);
                try {
                    await XeonBotInc.sendPresenceUpdate(isAlwaysOnlineEnabled() ? 'available' : 'unavailable');
                } catch (e) {}

                try {
                    const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                    await XeonBotInc.sendMessage(botNumber, {
                        text: `🤖 MEHTAB-MD Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n✅Make sure to join below channel`,
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

                // FIX: Treat 401/badSession/multideviceMismatch as "needs re-auth", not permanent stop
                const needsReauth = [
                    DisconnectReason.loggedOut,      // 401
                    DisconnectReason.badSession,     // 500
                    DisconnectReason.multideviceMismatch // 411
                ].includes(statusCode)

                if (needsReauth) {
                    console.log(chalk.yellow('🔄 Session invalid or logged out. Clearing auth and restarting for fresh pairing...'))
                    try {
                        rmSync('./session', { recursive: true, force: true })
                        console.log(chalk.green('✅ Session folder cleared.'))
                    } catch (error) {
                        console.error('Error deleting session:', error)
                    }
                    isConnecting = false
                    // FIX: Restart bot to trigger fresh pairing code / QR
                    const delayMs = getReconnectDelay()
                    console.log(chalk.yellow(`🔄 Restarting for re-authentication in ${(delayMs/1000).toFixed(1)}s...`))
                    setTimeout(() => {
                        startXeonBotInc().catch(err => {
                            console.error('Reconnection failed:', err)
                            isConnecting = false
                        })
                    }, delayMs)
                    return
                }

                // For other disconnects (restartRequired, connectionLost, etc.), reconnect normally
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut

                if (shouldReconnect) {
                    if (isConnecting) {
                        console.log(chalk.gray('⏳ Reconnection already scheduled, skipping...'))
                        return
                    }
                    const delayMs = getReconnectDelay()
                    console.log(chalk.yellow(`Reconnecting in ${(delayMs/1000).toFixed(1)}s... (crash #${crashCount})`))
                    isConnecting = true
                    setTimeout(() => {
                        startXeonBotInc().catch(err => {
                            console.error('Reconnection failed:', err)
                            isConnecting = false
                        })
                    }, delayMs)
                } else {
                    isConnecting = false
                }
            }
        })

        // ═══════════════════════════════════════════════════
        // ANTI-CALL (Cached module, not re-required every time)
        // ═══════════════════════════════════════════════════

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
                        try {
                            if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                                await XeonBotInc.rejectCall(call.id, callerJid)
                            } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                                await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject')
                            }
                        } catch {}

                        if (!antiCallNotified.has(callerJid)) {
                            antiCallNotified.add(callerJid)
                            setTimeout(() => antiCallNotified.delete(callerJid), 60000)
                            await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' })
                        }
                    } catch {}

                    setTimeout(async () => {
                        try { await XeonBotInc.updateBlockStatus(callerJid, 'block') } catch {}
                    }, 800)
                }
            } catch (e) {}
        })

        // ═══════════════════════════════════════════════════
        // GROUP PARTICIPANTS (Only real handler needed)
        // ═══════════════════════════════════════════════════

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
        setTimeout(() => {
            startXeonBotInc().catch(err => {
                console.error('Fatal restart error:', err)
            })
        }, delayMs)
    }
}

// ═══════════════════════════════════════════════════════════
// PROCESS HANDLERS
// ═══════════════════════════════════════════════════════════

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message)
    console.error(err.stack)
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

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════

startXeonBotInc().catch(error => {
    console.error('Fatal startup error:', error)
    const delayMs = getReconnectDelay()
    console.log(chalk.yellow(`Retrying startup in ${(delayMs/1000).toFixed(1)}s...`))
    setTimeout(() => {
        startXeonBotInc().catch(err => {
            console.error('Second startup attempt failed:', err)
            process.exit(1)
        })
    }, delayMs)
})
