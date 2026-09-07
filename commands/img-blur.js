const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

async function blurCommand(sock, chatId, message, quotedMessage) {
    try {
        // Get the image to blur
        let imageBuffer;

        if (quotedMessage) {
            // If replying to a message
            if (!quotedMessage.imageMessage) {
                await sock.sendMessage(chatId, {
                    text: '❌ Please reply to an image message'
                }, { quoted: message });
                return;
            }

            const quoted = {
                message: {
                    imageMessage: quotedMessage.imageMessage
                }
            };

            imageBuffer = await downloadMediaMessage(
                quoted,
                'buffer',
                { },
                { }
            );
        } else if (message.message?.imageMessage) {
            // If image is in current message
            imageBuffer = await downloadMediaMessage(
                message,
                'buffer',
                { },
                { }
            );
        } else {
            await sock.sendMessage(chatId, {
                text: '❌ Please reply to an image or send an image with caption .blur'
            }, { quoted: message });
            return;
        }

        const tmpDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const inputPath = path.join(tmpDir, `blur_in_${Date.now()}.jpg`);
        const outputPath = path.join(tmpDir, `blur_out_${Date.now()}.jpg`);

        fs.writeFileSync(inputPath, imageBuffer);

        await new Promise((resolve, reject) => {
            exec(`ffmpeg -y -i "${inputPath}" -vf "scale='min(800,iw)':'min(800,ih)':force_original_aspect_ratio=decrease,gblur=sigma=10" "${outputPath}"`, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        const blurredImage = fs.readFileSync(outputPath);

        try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch (e) {}

        // Send the blurred image
        await sock.sendMessage(chatId, {
            image: blurredImage,
            caption: '*[ ✔ ] Image Blurred Successfully*',
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363409689492071@newsletter',
                    newsletterName: '𝙈𝘼𝙇𝙄𝙆 𝙈𝘿',
                    serverMessageId: -1
                }
            }
        }, { quoted: message });

    } catch (error) {
        console.error('Error in blur command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to blur image. Please try again later.'
        }, { quoted: message });
    }
}

module.exports = blurCommand;