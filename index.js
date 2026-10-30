const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore, // Tambahan buat fix Bad MAC
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const readline = require("readline")
const config = require("./config")

// Banner Fyronn
const BANNER = `
  /-------\\   \\       /   |-------|   /-------\\   |\\      |   |\\      |
  |  _____|    \\     /    |  _____|   |  _____|   | \\     |   | \\     |
  | |           \\   /     | |         | |     |   |  \\    |   |  \\    |
  | |----        | |      | |----\\    | |     |   |   \\   |   |   \\   |
  | |____        | |      | |____/    | |     |   |    \\  |   |    \\  |
  | |           | |      | |         | |     |   |     \\ |   |     \\ |
  |_|           |_|      |_|         \\_______/   |      \\|   |      \\|
`;

const logger = pino({ level: "silent" })

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

let sock
let botPhoneNumber = null
let isBroadcasting = false

// Prompt masukin nomor HP
function askPhoneNumber() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        const ask = () => {
            rl.question("Masukkan nomor WhatsApp bot (contoh: 62812...): ", (answer) => {
                let num = String(answer).replace(/[^0-9]/g, "")
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
        logger: logger,
        printQRInTerminal: false,
        auth: {
            creds: authState.creds,
            // Ini kuncinya biar Bad MAC gak sering muncul
            keys: makeCacheableSignalKeyStore(authState.keys, logger),
        },
        browser: ["Ubuntu", "Chrome", "122.0.0.0"],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr && !authState.creds.registered && !botPhoneNumber) {
            botPhoneNumber = await askPhoneNumber()
            try {
                const code = await sock.requestPairingCode(botPhoneNumber)
                console.log(`\n=========================================`)
                console.log(` PAIRING CODE: ${code} `)
                console.log(`=========================================\n`)
            } catch (err) {
                console.log("Gagal minta code:", err.message)
            }
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                connectToWhatsApp()
            } else {
                console.log("Bot logout. Hapus folder auth_info buat pairing ulang.")
                process.exit(1)
            }
        } else if (connection === "open") {
            console.log(BANNER)
            console.log("[+] BOT TERSAMBUNG KE WHATSAPP")
            console.log("[*] Chat NOMOR BOT SENDIRI, ketik '!start' buat mulai blast.")
            console.log("[*] Ketik '!stop' buat berenti.\n")
            listenCommands()
        }
    })
}

// Nangkep perintah start / stop
function listenCommands() {
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0]
        if (!msg.message || !msg.key.fromMe) return

        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim()
        
        if (text === "!start") {
            if (isBroadcasting) return sock.sendMessage(msg.key.remoteJid, { text: "Bot udah jalan." })
            isBroadcasting = true
            sock.sendMessage(msg.key.remoteJid, { text: "MULAI BLAST KE SEMUA GRUP..." })
            startBroadcast()
        } 
        else if (text === "!stop") {
            if (!isBroadcasting) return
            isBroadcasting = false
            sock.sendMessage(msg.key.remoteJid, { text: "BLAST DIHENTIKAN." })
        }
    })
}

// Fungsi blast
async function startBroadcast() {
    try {
        const groups = await sock.groupFetchAllParticipating()
        const groupList = Object.values(groups).filter(g => g.participants.length > 1)
        
        console.log(`\n[*] Ketemu ${groupList.length} grup/komunitas yang valid.`)
        let sukses = 0
        let gagal = 0

        for (let i = 0; i < groupList.length; i++) {
            if (!isBroadcasting) {
                console.log("[!] Dihentikan oleh user.")
                break
            }

            const group = groupList[i]
            console.log(`[${i+1}/${groupList.length}] Ngirim ke: ${group.subject || "Tanpa Nama"}`)

            try {
                await sock.sendMessage(group.id, { text: config.message })
                sukses++
                
                const delay = Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000
                await sleep(delay)
            } catch (err) {
                console.log(`[X] Gagal: ${err.message}`)
                gagal++
                await sleep(3000)
            }
        }

        console.log(`\n[+] Selesai! Sukses: ${sukses}, Gagal: ${gagal}`)
        isBroadcasting = false
    } catch (err) {
        console.log("[!] Error ambil grup:", err.message)
        isBroadcasting = false
    }
}

connectToWhatsApp()
