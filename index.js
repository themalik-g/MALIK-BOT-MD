/**
 * 𝙈𝘼𝙇𝙄𝙆 𝙈𝘿 - A WhatsApp Bot
 * Copyright (c) 2024 𝙈𝘼𝙇𝙄𝙆 𝙈𝙀𝙃𝙏𝘼𝘽
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
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { smsg } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage,
    jidDecode,
    proto,
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
// STABILITY & 24/7 CONFIGURATION
// ═══════════════════════════════════════════════════════════

const STABILITY_CONFIG = {
    maxReconnectDelay: 60000,      // Max 60s between reconnects
    initialReconnectDelay: 5000,   // Start with 5s
    reconnectBackoffMultiplier: 1.5,
    maxConsecutiveCrashes: 10,     // Stop trying after 10 crashes
    crashResetInterval: 300000,    // Reset crash counter every 5 min
    ramWarningThreshold: 500,      // Warn at 500MB (was 400MB kill)
    ramCriticalThreshold: 800,     // Only kill at 800MB
    gcInterval: 60000,             // GC every 60s
    healthCheckInterval: 30000,    // Health check every 30s
    storeWriteInterval: 10000,     // Save store every 10s
    keepAliveInterval: 15000,      // Keep socket alive every 15s
    connectionTimeout: 60000,      // 60s connection timeout
    defaultQueryTimeout: 60000,    // 60s query timeout
}

// Crash counter for exponential backoff
let crashCount = 0
let lastCrashTime = Date.now()
let reconnectDelay = STABILITY_CONFIG.initialReconnectDelay
let isConnecting = false
let connectionState = 'disconnected'
let healthCheckTimer = null
let gcTimer = null
let storeTimer = null
let memoryTimer = null

// ═══════════════════════════════════════════════════════════
// STORE INITIALIZATION
// ═══════════════════════════════════════════════════════════

store.readFromFile()
const settings = require('./settings')

storeTimer = setInterval(() => {
    try {
        store.writeToFile()
    } catch (e) {
        console.error('Store write error:', e.message)
    }
}, settings.storeWriteInterval || STABILITY_CONFIG.storeWriteInterval)

// ═══════════════════════════════════════════════════════════
// MEMORY MANAGEMENT (GRACEFUL - NO FORCED KILLS)
// ═══════════════════════════════════════════════════════════

// Force garbage collection if available
gcTimer = setInterval(() => {
    try {
        if (global.gc) {
            global.gc()
            const used = process.memoryUsage().rss / 1024 / 1024
            console.log(`🧹 GC completed | RAM: ${used.toFixed(1)}MB`)
        }
    } catch (e) {
        // ignore
    }
}, STABILITY_CONFIG.gcInterval)

// Memory monitoring - WARN instead of KILL
memoryTimer = setInterval(() => {
    try {
        const used = process.memoryUsage().rss / 1024 / 1024
        if (used > STABILITY_CONFIG.ramCriticalThreshold) {
            console.log(`🚨 CRITICAL RAM (${used.toFixed(1)}MB > ${STABILITY_CONFIG.ramCriticalThreshold}MB) — attempting emergency cleanup...`)
            if (global.gc) global.gc()
            // Only exit if still critical after GC attempt
            setTimeout(() => {
                const stillUsed = process.memoryUsage().rss / 1024 / 1024
                if (stillUsed > STABILITY_CONFIG.ramCriticalThreshold) {
                    console.log(`💀 RAM still critical (${stillUsed.toFixed(1)}MB). Graceful restart...`)
                    process.exit(1)
                }
            }, 5000)
        } else if (used > STABILITY_CONFIG.ramWarningThreshold) {
            console.log(`⚠️ RAM high: ${used.toFixed(1)}MB (threshold: ${STABILITY_CONFIG.ramWarningThreshold}MB)`)
            if (global.gc) global.gc()
        }
    } catch (e) {
        console.error('Memory monitor error:', e.message)
    }
}, STABILITY_CONFIG.healthCheckInterval)

// ═══════════════════════════════════════════════════════════
// BOT CONFIG
// ═══════════════════════════════════════════════════════════

let phoneNumber = settings.ownerNumber || "911234567890"
let owner = []
try {
    owner = JSON.parse(fs.readFileSync('./data/owner.json'))
} catch (e) {
    owner = [phoneNumber]
}

global.botname = "𝙈𝘼𝙇𝙄𝙆 𝙈𝘿"
global.themeemoji = "•"
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

// ═══════════════════════════════════════════════════════════
// RECONNECTION BACKOFF LOGIC
// ═══════════════════════════════════════════════════════════

function getReconnectDelay() {
    const now = Date.now()
    // Reset crash count if enough time passed
    if (now - lastCrashTime > STABILITY_CONFIG.crashResetInterval) {
        crashCount = 0
        reconnectDelay = STABILITY_CONFIG.initialReconnectDelay
    }
    crashCount++
    lastCrashTime = now

    if (crashCount > STABILITY_CONFIG.maxConsecutiveCrashes) {
        console.log(`❌ Too many crashes (${crashCount}). Waiting ${(STABILITY_CONFIG.crashResetInterval/1000/60).toFixed(0)} min before retry...`)
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

async function startMalikBot() {
    if (isConnecting) {
        console.log('⏳ Connection already in progress, skipping duplicate start...')
        return
    }
    isConnecting = true
    connectionState = 'connecting'

    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

        const MalikBotInc = makeWASocket({
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
            // Additional stability options
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
            fireInitQueries: true,
            shouldSyncHistoryMessage: () => false,
            shouldIgnoreJid: (jid) => jid === 'status@broadcast',
        })

        // Save credentials when they update
        MalikBotInc.ev.on('creds.update', saveCreds)
        store.bind(MalikBotInc.ev)

        // ═══════════════════════════════════════════════════
        // MESSAGE HANDLING
        // ═══════════════════════════════════════════════════

        MalikBotInc.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(MalikBotInc, chatUpdate);
                    return;
                }
                if (!MalikBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                    if (!isGroup) return
                }
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                try {
                    await handleMessages(MalikBotInc, chatUpdate, true)
                } catch (err) {
                    console.error("Error in handleMessages:", err)
                    if (mek.key && mek.key.remoteJid) {
                        await MalikBotInc.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message.',
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363409689492071@newsletter',
                                    newsletterName: '𝙈𝘼𝙇𝙄𝙆 𝙈𝘿',
                                    serverMessageId: -1
                                }
                            }
                        }).catch(() => {});
                    }
                }
            } catch (err) {
                console.error("Error in messages.upsert:", err)
            }
        })

        // ═══════════════════════════════════════════════════
        // JID DECODE & CONTACTS
        // ═══════════════════════════════════════════════════

        MalikBotInc.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
        }

        MalikBotInc.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = MalikBotInc.decodeJid(contact.id)
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })

        MalikBotInc.getName = (jid, withoutContact = false) => {
        const id = MalikBotInc.decodeJid(jid)
            withoutContact = MalikBotInc.withoutContact || withoutContact
            let v
            if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
                v = store.contacts[id] || {}
                if (!(v.name || v.subject)) v = MalikBotInc.groupMetadata(id) || {}
                resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
            })
            else v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === MalikBotInc.decodeJid(MalikBotInc.user.id) ?
                MalikBotInc.user : (store.contacts[id] || {})
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
        }

        MalikBotInc.public = true
        MalikBotInc.serializeM = (m) => smsg(MalikBotInc, m, store)

        // ═══════════════════════════════════════════════════
        // PAIRING CODE HANDLER
        // ═══════════════════════════════════════════════════

        if (pairingCode && !MalikBotInc.authState.creds.registered) {
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
                console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.'));
                process.exit(1);
            }

            setTimeout(async () => {
                try {
                    let code = await MalikBotInc.requestPairingCode(phoneNumber)
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
        // CONNECTION HANDLER (STABLE RECONNECTION)
        // ═══════════════════════════════════════════════════

        MalikBotInc.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s

            if (qr) {
                console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
            }

            if (connection === 'connecting') {
                console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
                connectionState = 'connecting'
            }

            if (connection == "open") {
                connectionState = 'open'
                resetReconnectDelay() // Reset backoff on successful connection
                console.log(chalk.magenta(` `))
                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(MalikBotInc.user, null, 2)))

                try {
                    const botNumber = MalikBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                    await MalikBotInc.sendMessage(botNumber, {
                        text: `🤖 𝙈𝘼𝙇𝙄𝙆 𝙈𝘿 Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n✅Make sure to join below channel`,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363409689492071@newsletter',
                                newsletterName: '𝙈𝘼𝙇𝙄𝙆 𝙈𝘿',
                                serverMessageId: -1
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error sending connection message:', error.message)
                }

                await delay(1999)
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || '𝙈𝘼𝙇𝙄𝙆 𝙈𝘿'} ]`)}\n\n`))
                console.log(chalk.cyan(`< ================================================== >`))
                console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: @problem solved`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: themalik-g`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: 𝙈𝘼𝙇𝙄𝙆 𝙈𝙀𝙃𝙏𝘼𝘽`))
                console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
                console.log(chalk.blue(`Bot Version: ${settings.version}`))
            }

            if (connection === 'close') {
                connectionState = 'closed'
                const statusCode = lastDisconnect?.error?.output?.statusCode
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut

                console.log(chalk.red(`Connection closed. Status: ${statusCode}, reconnecting: ${shouldReconnect}`))

                // ONLY delete session on actual logout (401), not on temporary disconnects
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    try {
                        rmSync('./session', { recursive: true, force: true })
                        console.log(chalk.yellow('Session folder deleted. Please re-authenticate.'))
                    } catch (error) {
                        console.error('Error deleting session:', error)
                    }
                    console.log(chalk.red('Session logged out. Please re-authenticate.'))
                    isConnecting = false
                    return // Don't reconnect after logout
                }

                if (shouldReconnect) {
                    const delayMs = getReconnectDelay()
                    console.log(chalk.yellow(`Reconnecting in ${(delayMs/1000).toFixed(1)}s... (crash #${crashCount})`))
                    isConnecting = false
                    setTimeout(() => {
                        startMalikBot().catch(err => {
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
        // ANTI-CALL HANDLER
        // ═══════════════════════════════════════════════════

        const antiCallNotified = new Set();

        MalikBotInc.ev.on('call', async (calls) => {
            try {
                const { readState: readAnticallState } = require('./commands/anticall');
                const state = readAnticallState();
                if (!state.enabled) return;
                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId;
                    if (!callerJid) continue;
                    try {
                        try {
                            if (typeof MalikBotInc.rejectCall === 'function' && call.id) {
                                await MalikBotInc.rejectCall(call.id, callerJid);
                            } else if (typeof MalikBotInc.sendCallOfferAck === 'function' && call.id) {
                                await MalikBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                            }
                        } catch {}

                        if (!antiCallNotified.has(callerJid)) {
                            antiCallNotified.add(callerJid);
                            setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                            await MalikBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                        }
                    } catch {}
                    setTimeout(async () => {
                        try { await MalikBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                    }, 800);
                }
            } catch (e) {}
        });

        // ═══════════════════════════════════════════════════
        // GROUP & STATUS HANDLERS
        // ═══════════════════════════════════════════════════

        MalikBotInc.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(MalikBotInc, update);
        });

        MalikBotInc.ev.on('messages.upsert', async (m) => {
            if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
                await handleStatus(MalikBotInc, m);
            }
        });

        MalikBotInc.ev.on('status.update', async (status) => {
            await handleStatus(MalikBotInc, status);
        });

        MalikBotInc.ev.on('messages.reaction', async (status) => {
            await handleStatus(MalikBotInc, status);
        });

        isConnecting = false
        return MalikBotInc

    } catch (error) {
        console.error('Error in startMalikBot:', error)
        isConnecting = false
        const delayMs = getReconnectDelay()
        console.log(chalk.yellow(`Restarting bot in ${(delayMs/1000).toFixed(1)}s due to error...`))
        setTimeout(() => {
            startMalikBot().catch(err => {
                console.error('Fatal restart error:', err)
            })
        }, delayMs)
    }
}

// ═══════════════════════════════════════════════════════════
// PROCESS ERROR HANDLERS (NON-FATAL)
// ═══════════════════════════════════════════════════════════

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message)
    console.error(err.stack)
    // DO NOT exit - let PM2 handle restarts if truly fatal
    // Most uncaught exceptions in Baileys are non-fatal
})

process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled Rejection:', err?.message || err)
    // DO NOT exit
})

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Cleaning up...')
    if (storeTimer) clearInterval(storeTimer)
    if (gcTimer) clearInterval(gcTimer)
    if (memoryTimer) clearInterval(memoryTimer)
    if (healthCheckTimer) clearInterval(healthCheckTimer)
    process.exit(0)
})

process.on('SIGINT', () => {
    console.log('SIGINT received. Cleaning up...')
    if (storeTimer) clearInterval(storeTimer)
    if (gcTimer) clearInterval(gcTimer)
    if (memoryTimer) clearInterval(memoryTimer)
    if (healthCheckTimer) clearInterval(healthCheckTimer)
    process.exit(0)
})

// ═══════════════════════════════════════════════════════════
// START THE BOT
// ═══════════════════════════════════════════════════════════

console.log(chalk.cyan('╔══════════════════════════════════════════════╗'))
console.log(chalk.cyan('║         🤖 𝙈𝘼𝙇𝙄𝙆 𝙈𝘿 Starting...          ║'))
console.log(chalk.cyan('║         Owner: 𝙈𝘼𝙇𝙄𝙆 𝙈𝙀𝙃𝙏𝘼𝘽              ║'))
console.log(chalk.cyan('╚══════════════════════════════════════════════╝'))

startMalikBot().catch(error => {
    console.error('Fatal startup error:', error)
    const delayMs = getReconnectDelay()
    console.log(chalk.yellow(`Retrying startup in ${(delayMs/1000).toFixed(1)}s...`))
    setTimeout(() => {
        startMalikBot().catch(err => {
            console.error('Second startup attempt failed:', err)
            process.exit(1)
        })
    }, delayMs)
})
