const settings = require('../settings');
const fs = require('fs');
const path = require('path');

async function helpCommand(sock, chatId, message) {
    const helpMessage = `┌──────────────────┈⚝
   *🤖 ${settings.botName || 'MEHTAB-MD'}*
   Version: *${settings.version || '3.0.7'}*
   by ${settings.botOwner || 'MALIK MEHTAB'}
   YT : ${settings.botOwner || 'MALIK MEHTAB'}
└──────────────────┈⚝

┌──❮ 🌐 ɢᴇɴᴇʀᴀʟ ❮
│
│ ◈ .help or .menu
│ ◈ .ping
│ ◈ .alive
│ ◈ .tts <text>
│ ◈ .owner
│ ◈ .joke
│ ◈ .quote
│ ◈ .fact
│ ◈ .weather <city>
│ ◈ .news
│ ◈ .attp <text>
│ ◈ .lyrics <song_title>
│ ◈ .8ball <question>
│ ◈ .groupinfo
│ ◈ .staff or .admins
│ ◈ .vv
│ ◈ .trt <text> <lang>
│ ◈ .ss <link>
│ ◈ .jid
│ ◈ .url
│
└───────────────┈⚝

┌──❮ 👮‍♂️ ᴀᴅᴍɪɴ ❮
│
│ ◈ .ban @user
│ ◈ .promote @user
│ ◈ .demote @user
│ ◈ .mute <minutes>
│ ◈ .unmute
│ ◈ .delete or .del
│ ◈ .kick @user
│ ◈ .warnings @user
│ ◈ .warn @user
│ ◈ .antilink
│ ◈ .antibadword
│ ◈ .clear
│ ◈ .tag <message>
│ ◈ .tagall
│ ◈ .tagnotadmin
│ ◈ .hidetag <message>
│ ◈ .chatbot
│ ◈ .resetlink
│ ◈ .antitag <on/off>
│ ◈ .welcome <on/off>
│ ◈ .goodbye <on/off>
│ ◈ .setgdesc <description>
│ ◈ .setgname <new name>
│ ◈ .setgpp (reply to image)
│
└───────────────┈⚝

┌──❮ 🔒 ᴏᴡɴᴇʀ ❮
│
│ ◈ .mode <public/private>
│ ◈ .clearsession
│ ◈ .antidelete <p/g/off>
│ ◈ .cleartmp
│ ◈ .update
│ ◈ .settings
│ ◈ .setpp <reply to image>
│ ◈ .autoreact <on/off>
│ ◈ .autostatus <on/off>
│ ◈ .autostatus react <on/off>
│ ◈ .autotyping <on/off>
│ ◈ .autoread <on/off>
│ ◈ .anticall <on/off>
│ ◈ .pmblocker <on/off/status>
│ ◈ .pmblocker setmsg <text>
│ ◈ .setmention <reply to msg>
│ ◈ .mention <on/off>
│
└───────────────┈⚝

┌──❮ 🎨 ɪᴍᴀɢᴇ / ꜱᴛɪᴄᴋᴇʀ ❮
│
│ ◈ .blur <image>
│ ◈ .simage <reply to sticker>
│ ◈ .sticker <reply to image>
│ ◈ .removebg
│ ◈ .remini
│ ◈ .crop <reply to image>
│ ◈ .tgsticker <Link>
│ ◈ .meme
│ ◈ .take <packname>
│ ◈ .emojimix <emj1>+<emj2>
│ ◈ .igs <insta link>
│ ◈ .igsc <insta link>
│
└───────────────┈⚝

┌──❮ 🖼️ ᴘɪᴇꜱ ❮
│
│ ◈ .pies <country>
│ ◈ .china
│ ◈ .indonesia
│ ◈ .japan
│ ◈ .korea
│ ◈ .hijab
│
└───────────────┈⚝

┌──❮ 🎮 ɢᴀᴍᴇ ❮
│
│ ◈ .tictactoe @user
│ ◈ .hangman
│ ◈ .guess <letter>
│ ◈ .trivia
│ ◈ .answer <answer>
│ ◈ .truth
│ ◈ .dare
│
└───────────────┈⚝

┌──❮ 🤖 ᴀɪ ❮
│
│ ◈ .gpt <question>
│ ◈ .gemini <question>
│ ◈ .imagine <prompt>
│ ◈ .flux <prompt>
│ ◈ .sora <prompt>
│
└───────────────┈⚝

┌──❮ 🎯 ꜰᴜɴ ❮
│
│ ◈ .compliment @user
│ ◈ .insult @user
│ ◈ .flirt
│ ◈ .shayari
│ ◈ .goodnight
│ ◈ .roseday
│ ◈ .character @user
│ ◈ .wasted @user
│ ◈ .ship @user
│ ◈ .simp @user
│ ◈ .stupid @user [text]
│
└───────────────┈⚝

┌──❮ 🔤 ᴛᴇXᴛᴍᴀᴋᴇʀ 🔢 ❯
│
│ ◈ .metallic <text>
│ ◈ .ice <text>
│ ◈ .snow <text>
│ ◈ .impressive <text>
│ ◈ .matrix <text>
│ ◈ .light <text>
│ ◈ .neon <text>
│ ◈ .devil <text>
│ ◈ .purple <text>
│ ◈ .thunder <text>
│ ◈ .leaves <text>
│ ◈ .1917 <text>
│ ◈ .arena <text>
│ ◈ .hacker <text>
│ ◈ .sand <text>
│ ◈ .blackpink <text>
│ ◈ .glitch <text>
│ ◈ .fire <text>
│
└───────────────┈⚝

┌──❮ 📥 ᴅᴏᴡɴʟᴏᴀᴅᴇʀ ❮
│
│ ◈ .play <song_name>
│ ◈ .song <song_name>
│ ◈ .spotify <query>
│ ◈ .instagram <link>
│ ◈ .facebook <link>
│ ◈ .tiktok <link>
│ ◈ .video <song name>
│ ◈ .ytmp4 <Link>
│
└───────────────┈⚝

┌──❮ 🧩 ᴍɪꜱᴄ ❮
│
│ ◈ .heart
│ ◈ .horny
│ ◈ .circle
│ ◈ .lgbt
│ ◈ .lolice
│ ◈ .its-so-stupid
│ ◈ .namecard
│ ◈ .oogway
│ ◈ .tweet
│ ◈ .ytcomment
│ ◈ .comrade
│ ◈ .gay
│ ◈ .glass
│ ◈ .jail
│ ◈ .passed
│ ◈ .triggered
│
└───────────────┈⚝

┌──❮ 🖼️ ᴀɴɪᴍᴇ ❮
│
│ ◈ .nom
│ ◈ .poke
│ ◈ .cry
│ ◈ .kiss
│ ◈ .pat
│ ◈ .hug
│ ◈ .wink
│ ◈ .facepalm
│
└───────────────┈⚝

┌──❮ 💻 ɢɪᴛʜᴜʙ ❮
│
│ ◈ .git
│ ◈ .github
│ ◈ .sc
│ ◈ .script
│ ◈ .repo
│
└───────────────┈⚝`;

    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');

        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);

            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363409689492071@newsletter',
                        newsletterName: '𝙈𝘼𝙇𝙄𝙆 𝙈𝘿',
                        serverMessageId: -1
                    }
                }
            },{ quoted: message });
        } else {
            console.error('Bot image not found at:', imagePath);
            await sock.sendMessage(chatId, {
                text: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363409689492071@newsletter',
                        newsletterName: '𝙈𝘼𝙇𝙄𝙆 𝙈𝘿 by @problem solved',
                        serverMessageId: -1
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage });
    }
}

module.exports = helpCommand;