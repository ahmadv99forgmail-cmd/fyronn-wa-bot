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

const logStream = fs.createWriteStream(
    path.join(config.logFolder, `bot-${new Date().toISOString().split("T")[0]}.log`),
    { flags: "a" }
)

function log(level, ...args) {
    const line = `[${new Date().toISOString()}] [${level}] ${args.join(" ")}`
    console.log(line)
    logStream.write(line + "\n")
}

function loadState() {
    if (fs.existsSync(config.stateFile)) {
        try {
            return JSON.parse(fs.readFileSync(config.stateFile, "utf-8"))
        } catch (e) {
            log("ERROR", "Failed to parse state.json:", e.message)
        }
    }
    return { sentGroups: {}, lastRoundAt: 0, totalSent: 0 }
}

function saveState(state) {
    fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2))
}

function randomJitter() {
    return Math.floor(Math.random() * config.jitterMs)
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}j ${m}m ${s}d`
    if (m > 0) return `${m}m ${s}d`
    return `${s}d`
}

function normalizeNumber(raw) {
    let num = String(raw).replace(/[^0-9]/g, "")
    if (num.startsWith("0")) num = "62" + num.slice(1)
    if (num.startsWith("8")) num = "62" + num
    return num
}

function isValidNumber(num) {
    if (num.length < 8 || num.length > 15) return false
    if (num.startsWith("0")) return false
    return true
}

function loadSavedPhone() {
    if (config.phoneNumber && isValidNumber(normalizeNumber(config.phoneNumber))) {
        return normalizeNumber(config.phoneNumber)
    }
    if (fs.existsSync(config.phoneFile)) {
        try {
            const saved = fs.readFileSync(config.phoneFile, "utf-8").trim()
            if (isValidNumber(saved)) return saved
        } catch (_) {}
    }
    return null
}

function savePhone(num) {
    fs.writeFileSync(config.phoneFile, num)
}

function askPhoneNumber() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        })

        console.log("\n╔═══════════════════════════════════════════════╗")
        console.log("║         SETUP NOMOR WHATSAPP BOT             ║")
        console.log("╚═══════════════════════════════════════════════╝\n")

        const ask = () => {
            rl.question("Masukkan nomor WhatsApp bot (contoh: 6281287048664): ", (answer) => {
                const cleaned = answer.trim()

                if (!cleaned) {
                    console.log("[!] Nomor tidak boleh kosong. Coba lagi.\n")
                    return ask()
                }

                const normalized = normalizeNumber(cleaned)

                if (!isValidNumber(normalized)) {
                    console.log(`[!] Format nomor tidak valid: "${cleaned}"`)
                    console.log("    Harus 8-15 digit, diawali kode negara (62 untuk Indonesia)")
                    console.log("    Contoh: 6281287048664 atau 081287048664\n")
                    return ask()
                }

                console.log(`\n[✓] Nomor diterima: ${normalized}\n`)

                rl.question("Simpan nomor ini untuk next run? (y/n): ", (save) => {
                    const shouldSave = save.trim().toLowerCase() === "y"
                    rl.close()

                    if (shouldSave) {
                        savePhone(normalized)
                        console.log(`[✓] Nomor disimpan di ${config.phoneFile}\n`)
                    }

                    resolve(normalized)
                })
            })
        }

        ask()
    })
}

async function resolvePhoneNumber() {
    if (process.env.PHONE_NUMBER) {
        const normalized = normalizeNumber(process.env.PHONE_NUMBER)
        if (isValidNumber(normalized)) {
            console.log(`[i] Nomor dari env var: ${normalized}\n`)
            return normalized
        }
    }

    const saved = loadSavedPhone()

    if (saved) {
        console.log(`\n[i] Menggunakan nomor tersimpan: ${saved}`)
        console.log(`[i] Kalau mau ganti, hapus file ${config.phoneFile} lalu restart\n`)
        return saved
    }

    return await askPhoneNumber()
}

let sock
let state = loadState()
let isRunning = false
let pairingRequested = false
let pairingTimer = null
let botPhoneNumber = null

async function connectToWhatsApp() {
    const { state: authState, saveCreds } = await useMultiFileAuthState(config.authFolder)
    const { version } = await fetchLatestBaileysVersion()

    const isRegistered = authState.creds.registered

    sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: authState,
        browser: ["Fyronn Bot", "Chrome", "1.0.0"],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
    })

    sock.ev.on("creds.update", saveCreds)

    if (!isRegistered && botPhoneNumber && !pairingRequested) {
        pairingRequested = true

        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(botPhoneNumber)

                console.log("\n╔═══════════════════════════════════════════════╗")
                console.log("║         PAIRING CODE WHATSAPP BOT            ║")
                console.log("╠═══════════════════════════════════════════════╣")
                console.log("║                                               ║")
                console.log(`║         Kode  :  ${code}                  ║`)
                console.log("║                                               ║")
                console.log("╠═══════════════════════════════════════════════╣")
                console.log("║  Cara pakai:                                  ║")
                console.log("║  1. Buka WhatsApp di HP                       ║")
                console.log("║  2. Perangkat Tertaut → Tautkan Perangkat     ║")
                console.log("║  3. Pilih 'Tautkan dengan nomor telepon'      ║")
                console.log("║  4. Masukkan 8 digit kode di atas             ║")
                console.log("║                                               ║")
                console.log("║  Kode berlaku ~60 detik. Kalau expired,       ║")
                console.log("║  bot auto-generate kode baru tiap 45 detik.   ║")
                console.log("╚═══════════════════════════════════════════════╝\n")

                log("PAIRING", `Kode dikirim: ${code}`)

                pairingTimer = setInterval(async () => {
                    if (sock.authState.creds.registered) {
                        clearInterval(pairingTimer)
                        pairingTimer = null
                        return
                    }

                    try {
                        const newCode = await sock.requestPairingCode(botPhoneNumber)
                        console.log(`\n[PAIRING] Kode baru: ${newCode}\n`)
                        log("PAIRING", `Retry kode: ${newCode}`)
                    } catch (err) {
                        log("PAIRING_ERR", err.message)
                    }
                }, 45000)
            } catch (err) {
                log("PAIRING_ERR", `Gagal minta pairing code: ${err.message}`)
                pairingRequested = false
            }
        }, 2000)
    }

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update

        if (connection === "close") {
            if (pairingTimer) {
                clearInterval(pairingTimer)
                pairingTimer = null
            }

            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

            if (shouldReconnect) {
                log("RECONNECT", "Koneksi terputus, reconnect dalam 5 detik...")
                pairingRequested = false
                setTimeout(connectToWhatsApp, 5000)
            } else {
                log("LOGOUT", "Bot di-logout. Hapus folder auth_info lalu jalankan ulang.")
                process.exit(1)
            }
        } else if (connection === "open") {
            if (pairingTimer) {
                clearInterval(pairingTimer)
                pairingTimer = null
            }

            log("CONNECTED", "Bot terhubung ke WhatsApp")

            if (!isRunning) {
                isRunning = true
                setTimeout(startBroadcast, 3000)
            }
        }
    })
}

async function getAllGroups() {
    const groups = await sock.groupFetchAllParticipating()
    const list = []

    for (const [jid, metadata] of Object.entries(groups)) {
        if (!jid.endsWith("@g.us")) continue

        let activityAt = 0
        try {
            activityAt = metadata.lastMessageRecvTimestamp
                ? metadata.lastMessageRecvTimestamp * 1000
                : 0
        } catch (_) {}

        const isInactive =
            config.skipInactive &&
            activityAt > 0 &&
            Date.now() - activityAt > config.inactiveThresholdMs

        if (isInactive) {
            log("SKIP", `Grup tidak aktif: ${metadata.subject}`)
            continue
        }

        list.push({
            jid,
            subject: metadata.subject || "Unknown Group",
            participants: metadata.participants?.length || 0,
        })
    }

    return list
}

async function sendToGroup(group) {
    const key = group.jid

    if (state.sentGroups[key]) {
        const cooldownEnd = state.sentGroups[key] + config.cooldownMs

        if (Date.now() < cooldownEnd) {
            const remaining = cooldownEnd - Date.now()
            log("COOLDOWN", `Skip ${group.subject} (${formatDuration(remaining)} lagi)`)
            return "skip"
        }
    }

    try {
        await sock.sendMessage(group.jid, { text: config.message })
        state.sentGroups[key] = Date.now()
        state.totalSent = (state.totalSent || 0) + 1
        saveState(state)

        log("SENT", `${group.subject} (${group.participants} members) — total terkirim: ${state.totalSent}`)
        return "sent"
    } catch (err) {
        log("ERROR", `Gagal kirim ke ${group.subject}: ${err.message}`)
        return "error"
    }
}

async function runRound() {
    log("ROUND", "Mulai round broadcast")
    const allGroups = await getAllGroups()
    log("GROUPS", `Total grup ditemukan: ${allGroups.length}`)

    if (allGroups.length === 0) {
        log("ROUND", "Tidak ada grup, tunggu 10 menit lagi")
        return
    }

    let target = allGroups
    if (config.maxGroupsPerRound > 0) {
        target = target.slice(0, config.maxGroupsPerRound)
    }

    let sentCount = 0
    let skipCount = 0
    let errorCount = 0

    if (config.cooldownMode === "per-group") {
        for (let i = 0; i < target.length; i++) {
            const group = target[i]
            log("PROGRESS", `[${i + 1}/${target.length}] ${group.subject}`)

            const result = await sendToGroup(group)

            if (result === "sent") {
                sentCount++
                const waitMs = config.cooldownMs + randomJitter()
                const waitUntil = new Date(Date.now() + waitMs)
                log("WAIT", `Cooldown ${formatDuration(waitMs)} — lanjut jam ${waitUntil.toLocaleTimeString()}`)
                await sleep(waitMs)
            } else if (result === "skip") {
                skipCount++
            } else {
                errorCount++
                await sleep(5000)
            }
        }
    } else {
        for (let i = 0; i < target.length; i++) {
            const group = target[i]
            log("PROGRESS", `[${i + 1}/${target.length}] ${group.subject}`)

            const result = await sendToGroup(group)

            if (result === "sent") {
                sentCount++
                const delay =
                    config.messageDelayMinMs +
                    Math.random() * (config.messageDelayMaxMs - config.messageDelayMinMs)
                await sleep(delay)
            } else if (result === "skip") {
                skipCount++
            } else {
                errorCount++
                await sleep(5000)
            }
        }
    }

    state.lastRoundAt = Date.now()
    saveState(state)

    log("ROUND", `Selesai — sent: ${sentCount}, skip: ${skipCount}, error: ${errorCount}`)
}

async function startBroadcast() {
    while (true) {
        try {
            await runRound()
        } catch (err) {
            log("ERROR", `Round error: ${err.message}`)
            await sleep(10000)
            continue
        }

        if (config.cooldownMode === "per-round") {
            const waitMs = config.cooldownMs + randomJitter()
            const waitUntil = new Date(Date.now() + waitMs)
            log("WAIT", `Round selesai. Round berikutnya jam ${waitUntil.toLocaleTimeString()}`)
            await sleep(waitMs)
        } else {
            log("ROUND", "Round selesai, mulai dari awal lagi")
            await sleep(5000)
        }
    }
}

process.on("SIGINT", () => {
    log("SHUTDOWN", "Bot dimatikan oleh user")
    saveState(state)
    process.exit(0)
})

process.on("unhandledRejection", (err) => {
    log("UNHANDLED", err.message || String(err))
})

;(async () => {
    let alreadyRegistered = false
    try {
        const authPath = path.join(config.authFolder, "creds.json")
        if (fs.existsSync(authPath)) {
            const creds = JSON.parse(fs.readFileSync(authPath, "utf-8"))
            alreadyRegistered = creds.me && creds.me.id
        }
    } catch (_) {}

    if (alreadyRegistered) {
        console.log("[i] Session ditemukan, langsung connect tanpa pairing\n")
    } else {
        botPhoneNumber = await resolvePhoneNumber()
    }

    connectToWhatsApp()
})()
