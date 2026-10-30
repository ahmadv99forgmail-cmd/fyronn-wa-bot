const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const readline = require("readline")
const config = require("./config")

// Banner Fyronn Gradient (Merah ke Biru)
const BANNER = `
\x1b[31m _____                      _   _   ____        _   \x1b[0m
\x1b[31m|  ___|   _ _ __ ___  _ __ | \\ | | | __ )  ___ | |_ \x1b[0m
\x1b[35m| |_ | | | | '__/ _ \\| '_ \\|  \\| | |  _ \\ / _ \\| __|\x1b[0m
\x1b[34m|  _|| |_| | | | (_) | | | | |\\  | | |_) | (_) | |_ \x1b[0m
\x1b[34m|_|   \\__, |_|  \\___/|_| |_|_| \\_| |____/ \\___/ \\__|\x1b[0m
\x1b[34m       |___/                                       \x1b[0m
`;

const logger = pino({ level: "silent" })

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

let sock
let botPhoneNumber = null
let isBroadcasting = false

function askPhoneNumber() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        const ask = () => {
            rl.question("No whatsApp: ", (answer) => {
                let num = String(answer).replace(/[^0-9]/g, "")
                if (num.startsWith("0")) num = "62" + num.slice(1)
                if (num.startsWith("8")) num = "62" + num
                if (num.length < 8) {
                    console.log("Salah")
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
            keys: makeCacheableSignalKeyStore(authState.keys, logger),
        },
        browser: ["Ubuntu", "Chrome", "122.0.0.0"],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        getMessage: async () => { return { conversation: 'pong' } } // ANTI BAD MAC SPAM
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr && !authState.creds.registered && !botPhoneNumber) {
            botPhoneNumber = config.phoneNumber || await askPhoneNumber()
            try {
                const code = await sock.requestPairingCode(botPhoneNumber)
                console.log(BANNER) 
                console.log(` PAIRING CODE: ${code} `) 
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
            console.log("[+] Fyronn Bot Help")
            console.log("[*] Type'!start' for start message")
            console.log("[*] Type'!stop' for stop message\n")
            listenCommands()
        }
    })
}

function listenCommands() {
    sock.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0]
            if (!msg.message || !msg.key.fromMe) return

            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim()
            
            if (text === "!start") {
                if (isBroadcasting) return sock.sendMessage(msg.key.remoteJid, { text: "Bot udah jalan." })
                isBroadcasting = true
                sock.sendMessage(msg.key.remoteJid, { text: "Fyronn Bot Activated" })
                startBroadcast()
            } 
            eelseif (text === "!stop") {
                if (!isBroadcasting) return
                isBroadcasting = false
                sock.sendMessage(msg.key.remoteJid, { text: "Fyronn Bot Unactivated" })
            }
        } catch (e) {
            // Silent catch untuk error dekripsi (Bad MAC)
        }
    })
}

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
