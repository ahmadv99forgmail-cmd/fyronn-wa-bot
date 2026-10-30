# Fyronn WA Broadcast Bot

Bot WhatsApp otomatis untuk mem-broadcast pesan promosi ke seluruh grup dan komunitas yang ada di akun Anda. Bot ini dikontrol sepenuhnya melalui chat WhatsApp dan dilengkapi dengan sistem jeda acak (anti-banned).

> **Ikuti saluran MARKET & TESTIMONI FYRONN di WhatsApp:**
> [Klik di sini untuk masuk saluran](https://whatsapp.com/channel/0029Vb9KOPK4dTnO6zMt7R3z)

## Fitur Utama
- **Pairing Code**: Login tanpa perlu scan QR Code (lebih praktis).
- **Remote Control**: Kontrol bot langsung dari chat WhatsApp (`!start` & `!stop`).
- **Auto-Blast**: Mengirim pesan ke semua grup dengan jeda acak 10-20 detik agar aman dari banned.
- **Anti-Spam Error**: Dilengkapi patch khusus untuk mencegah error `Bad MAC` (kunci enkripsi korup).
- **Filter Grup**: Otomatis mengabaikan grup kosong/announcement yang tidak bisa dibaca member.

## Persyaratan Sistem
- Android (menggunakan Termux) / Windows / Linux VPS
- Node.js versi 18 atau lebih baru
- Akun WhatsApp aktif (disarankan nomor sekunder)

## Panduan Instalasi (Termux Android)

**1. Install Aplikasi Termux**
Download dan install Termux dari F-Droid (Jangan dari Play Store, karena versinya sudah usang). Buka aplikasinya.

**2. Update & Perbaiki Mirror Termux**
Jalankan perintah berikut untuk memastikan server download Termux normal:
```bash
pkg update && pkg upgrade -y
```
**3. SET UP**
jalankan script ini untuk menjalankan bot WA fyronn
```
cd fyronn-wa-bot
npm install
node index.js
