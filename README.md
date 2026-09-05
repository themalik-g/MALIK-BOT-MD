# 🤖 𝙈𝘼𝙇𝙄𝙆 𝙈𝘿

A powerful WhatsApp Multi-Device Bot built with Baileys for group management, entertainment, and automation.

**Owner:** 𝙈𝘼𝙇𝙄𝙆 𝙈𝙀𝙃𝙏𝘼𝘽
**GitHub:** [themalik-g](https://github.com/themalik-g)
**YouTube:** [@problem solved](https://youtube.com/@problemsolved)
**Support:** [Join WhatsApp Group](https://chat.whatsapp.com/FfJZtyvL1PM46pLmInoHcZ)

---

## ✨ Features

- **Group Management:** Tag all, mute/unmute, promote/demote, kick, warn system
- **Media Tools:** Sticker creation, image editing, video download (YT, TT, IG, FB)
- **Games:** Tic-Tac-Toe, Hangman, Trivia
- **AI & Fun:** Chatbot, AI image generation, jokes, quotes, facts
- **Security:** Anti-link, anti-tag, anti-delete, anti-badword, anti-call
- **Automation:** Auto-status view, auto-read, auto-typing, welcome/goodbye messages
- **24/7 Stable:** Built-in reconnection, memory management, crash recovery

---

## 🚀 Deployment

### Prerequisites
- Node.js 18+
- Git
- PM2 (recommended for 24/7)

### Local Setup

```bash
git clone https://github.com/themalik-g/malik-md.git
cd malik-md
npm install --legacy-peer-deps
node index.js
```

### PM2 (Recommended for 24/7)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Environment Variables (Optional)

Create a `.env` file:

```env
SESSION_ID=your_session_string_here
OWNER_NUMBER=923001234567
```

---

## ⚙️ Configuration

Edit `settings.js`:

```js
module.exports = {
  botName: "𝙈𝘼𝙇𝙄𝙆 𝙈𝘿",
  botOwner: "𝙈𝘼𝙇𝙄𝙆 𝙈𝙀𝙃𝙏𝘼𝘽",
  ownerNumber: "923001234567",
  commandMode: "public",
  // ...
};
```

---

## 📋 Commands

| Category | Commands |
|----------|----------|
| Group | `.tagall`, `.mute`, `.unmute`, `.promote`, `.demote`, `.kick`, `.warn` |
| Media | `.sticker`, `.simage`, `.attp`, `.blur`, `.removebg`, `.remini` |
| Download | `.play`, `.video`, `.tiktok`, `.instagram`, `.facebook`, `.spotify` |
| Fun | `.joke`, `.quote`, `.fact`, `.meme`, `.tictactoe`, `.hangman` |
| AI | `.gpt`, `.gemini`, `.imagine`, `.dalle`, `.sora` |
| Admin | `.mode`, `.autostatus`, `.antidelete`, `.anticall`, `.pmblocker` |

Type `.menu` or `.help` in WhatsApp for the full list.

---

## 🔒 Stability Features (24/7)

This bot has been hardened for 24/7 operation:

- **Exponential Backoff Reconnection:** Prevents rapid restart loops
- **Crash Counter:** Stops infinite crash loops, resets after 5 min
- **Graceful Memory Management:** Warns at 500MB, only kills at 800MB after GC attempt
- **Auto Garbage Collection:** Every 60 seconds
- **Session Protection:** Only clears session on true logout (401), not temporary disconnects
- **Non-Fatal Error Handling:** Uncaught exceptions no longer crash the bot
- **PM2 Ready:** Pre-configured ecosystem file included

---

## ⚠️ Warning

- This bot is for **educational purposes only**.
- Using unofficial WhatsApp bots may violate WhatsApp's Terms of Service.
- Use a secondary number, not your main WhatsApp account.
- The developers assume no liability for bans or misuse.

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

**Copyright (c) 2024-2026 𝙈𝘼𝙇𝙄𝙆 𝙈𝙀𝙃𝙏𝘼𝘽**
