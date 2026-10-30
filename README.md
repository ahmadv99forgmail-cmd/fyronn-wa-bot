# Fyronn WA Broadcast Bot

Bot WhatsApp untuk broadcast pesan promosi ke semua grup dengan cooldown 10 menit.

## Fitur

- Pairing code login (input nomor di terminal, tanpa scan QR)
- Nomor tersimpan di `.phone` setelah input pertama
- Broadcast ke semua grup dengan cooldown 10 menit + jitter random
- Skip grup tidak aktif (> 30 hari)
- Persist state (tahan restart)
- Log harian ke file

## Setup

```bash
git clone https://github.com/USERNAME/fyronn-wa-bot.git
cd fyronn-wa-bot
npm install
node index.js
