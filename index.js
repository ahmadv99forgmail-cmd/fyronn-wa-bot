const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const fs = require("fs")
const path = require("path")
const readline = require("readline")
const config = require("./config")

if (!fs.existsSync(config.logFolder)) {
    fs.mkdirSync(config.logFolder, { recursive: true })
}

function log(level, ...args) {
    const line = `[${new Date().toISOString()}] [${level}] ${args.join(" ")}`
    console.log(line)
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// State
let sock
let isRunning = false
let isBroadcasting = false

function askPhoneNumber() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        })
        const ask = () => {
            rl.question("Masukkan nomor WhatsApp bot (contoh: 62812...): ", (answer) => {
                const num = String(answer).replace(/[^0-9]/g, "")
                if (num.startsWith("0")) num = "62" + num.slice(1)
                if (num.startsWith("8")) num = "62" + num
                
                if (num.length < 8) {
                    console.log("Format salah, ulangi.")
                    return ask()
                }
                rl.close()
                resolve(num)
            })
        }
        ask()
    })
}

async function connectToWhatsApp() {
    const { state: authState, saveCreds } = await useMultiFileAuthState("./auth_info")
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: authState,
        browser: ["Ubuntu", "Chrome", "122.0.0.0"],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr && !authState.creds.registered && !isRunning) {
            isRunning = true
            const phone = await askPhoneNumber()
            try {
                const code = await sock.requestPairingCode(phone)
                console.log(`\n=========================================`)
                console.log(` PAIRING CODE: ${code}`)
                console.log(`=========================================\n`)
            } catch (err) {
                console.log("Gagal minta code:", err.message)
                isRunning = false
            }
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                connectToWhatsApp()
            } else {
                console.log("Bot logout. Hapus folder auth_info.")
                process.exit(1)
            }
        } else if (connection === "open") {
            console.log("\n[+] BOT TERSAMBUNG KE WHATSAPP")
            console.log("[*] Ketik '!start' di chat nomor bot ini buat mulai blast.")
            console.log("[*] Ketik '!stop' buat berhenti.\n")
            isRunning = false
            listenCommands()
        }
    })
}

// ================= LISTENER ON/OFF =================
function listenCommands() {
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0]
        if (!msg.message) return

        // Ambil teks dari pesan
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim()
        
        // Cuma respon kalau pesannya dari lu sendiri (nomor bot)
        if (!msg.key.fromMe) return

        if (text === "!start") {
            if (isBroadcasting) {
                return sock.sendMessage(msg.key.remoteJid, { text: "Bot udah jalan bre." })
            }
            isBroadcasting = true
            sock.sendMessage(msg.key.remoteJid, { text: "🚀 MULAI BLAST KE SEMUA GRUP..." })
            startBroadcast()
        } 
        else if (text === "!stop") {
            if (!isBroadcasting) return
            isBroadcasting = false
            sock.sendMessage(msg.key.remoteJid, { text: "🛑 BLAST DIHENTIKAN." })
        }
    })
}

// ================= BROADCAST LOGIC =================
async function startBroadcast() {
    try {
        const groups = await sock.groupFetchAllParticipating()
        const groupList = Object.values(groups)
        
        console.log(`\n[*] Ketemu ${groupList.length} grup/komunitas.`)
        let sukses = 0
        let gagal = 0

        for (let i = 0; i < groupList.length; i++) {
            // Cek apakah lu ngetik !stop di tengah jalan
            if (!isBroadcasting) {
                console.log("[!] Proses dihentikan oleh user.")
                break
            }

            const group = groupList[i]
            console.log(`[${i+1}/${groupList.length}] Ngirim ke: ${group.subject || "Tanpa Nama"}`)

            try {
                // Kirim pesan
                await sock.sendMessage(group.id, { text: config.message })
                sukses++
                
                // Jeda acak 10 - 20 detik biar gak cepet kena banned
                const delay = Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000
                await sleep(delay)
            } catch (err) {
                console.log(`[X] Gagal kirim ke ${group.subject}: ${err.message}`)
                gagal++
                await sleep(3000) // jeda bentar kalau error
            }
        }

        console.log(`\n[+] Selesai! Sukses: ${sukses}, Gagal: ${gagal}`)
        isBroadcasting = false
    } catch (err) {
        console.log("[!] Error fatal saat ambil grup:", err.message)
        isBroadcasting = false
    }
}

connectToWhatsApp()
