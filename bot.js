/**
 * ============================================================================
 * Stars Plus / نوا شاپ TELEGRAM BOT - V8 (FINAL SYNTAX FIX)
 * ============================================================================
 */

process.on('uncaughtException', (err) => {
    console.error('[FATAL-GUARD] Uncaught Exception:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL-GUARD] Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
});

let TelegramModule;
try {
    TelegramModule = require('node-telegram-bot-api');
} catch (e) {
    console.error('[FATAL] پکیج node-telegram-bot-api نصب نیست.');
    process.exit(1);
}

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

// ============================================================================
// SAFE DYNAMIC IMPORTS FOR TON MODULES
// ============================================================================
let TonClient, WalletContractV4, internal, toNano, beginCell, mnemonicToPrivateKey, Address;

try {
    const tonSdk = require('@ton/ton');
    TonClient = tonSdk.TonClient;
    WalletContractV4 = tonSdk.WalletContractV4;
    internal = tonSdk.internal;
    toNano = tonSdk.toNano;
    beginCell = tonSdk.beginCell;

    const tonCrypto = require('@ton/crypto');
    mnemonicToPrivateKey = tonCrypto.mnemonicToPrivateKey;

    const tonCore = require('@ton/core');
    Address = tonCore.Address;
} catch (err) {
    console.warn('[WARNING] ماژول‌های @ton در پروژه یافت نشدند یا کامل نصب نشده‌اند:', err.message);
}

// ============================================================================
// TON WALLET & BOT CONFIG
// ============================================================================

const TOKEN = '8696660217:AAEBI6iOD-OAZpWbCIGy2KU-s-Fc5OQwwVE';
const WALLET_MNEMONIC = 'keen achieve minute mule device text lonely vacuum door crystal month wreck agent bottom force minimum spy guess want plug opera protect away burden';
const TONCENTER_API_KEY = (process.env.TONCENTER_API_KEY || '').trim();

const TON_FEE_RESERVE = 0.05;
const TON_ENDPOINTS = [
    'https://toncenter.com/api/v2/jsonRPC',
    'https://tonhub.com/api/v2/jsonRPC'
];
const TON_NET_TIMEOUT_MS = 8000;

let tonKeyPair = null;
let tonCachedSeqno = null;
let tonQueue = Promise.resolve();

function enqueueTon(task) {
    const run = tonQueue.then(task, task);
    tonQueue = run.catch(() => {});
    return run;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, rej) => {
            timer = setTimeout(() => rej(new Error(`${label} timeout`)), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

async function getTonKeyPair() {
    if (tonKeyPair) return tonKeyPair;
    if (!mnemonicToPrivateKey || !WalletContractV4) {
        SystemLogger.error('TON', 'ماژول‌های مربوط به TON نصب نیستند.');
        return null;
    }
    const words = WALLET_MNEMONIC.split(/\s+/).filter(Boolean);
    if (words.length < 12) return null;
    const key = await mnemonicToPrivateKey(words);
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    tonKeyPair = { key, wallet };
    return tonKeyPair;
}

function isValidTonAddress(addr) {
    try {
        if (!Address) return true;
        Address.parse(String(addr || '').trim());
        return true;
    } catch (e) {
        return false;
    }
}

async function sendTonFromBot(toAddress, amountTon, memo) {
    if (!TonClient || !WalletContractV4 || !internal || !toNano || !beginCell) {
        return { success: false, manual: true, reason: 'ماژول‌های شبکه TON بر روی سرور نصب نیستند' };
    }

    const pair = await getTonKeyPair();
    if (!pair) {
        return { success: false, manual: true, reason: 'ولت ربات (WALLET_MNEMONIC) تنظیم نشده است' };
    }

    const amountNano = toNano(String(amountTon));
    const needNano = amountNano + toNano(String(TON_FEE_RESERVE));
    let lastErr = '';

    for (const endpoint of TON_ENDPOINTS) {
        try {
            const client = new TonClient({
                endpoint,
                apiKey: endpoint.includes('toncenter') && TONCENTER_API_KEY ? TONCENTER_API_KEY : undefined
            });
            const contract = client.open(pair.wallet);

            const balance = await withTimeout(client.getBalance(pair.wallet.address), TON_NET_TIMEOUT_MS, 'balance');
            if (balance < needNano) {
                const have = (Number(balance) / 1e9).toFixed(4);
                return { success: false, manual: true, reason: `موجودی ولت ربات کافی نیست (موجودی فعلی: ${have} TON)` };
            }

            const seqno = tonCachedSeqno !== null
                ? tonCachedSeqno
                : await withTimeout(contract.getSeqno(), TON_NET_TIMEOUT_MS, 'seqno');

            const body = beginCell()
                .storeUint(0, 32)
                .storeStringTail(memo && memo !== 'ندارد' ? memo : 'Stars Plus Payout')
                .endCell();

            const transfer = contract.createTransfer({
                seqno,
                secretKey: pair.key.secretKey,
                messages: [
                    internal({
                        to: Address.parse(toAddress.trim()),
                        value: amountNano,
                        bounce: false,
                        body
                    })
                ]
            });

            await withTimeout(contract.send(transfer), TON_NET_TIMEOUT_MS, 'send');
            tonCachedSeqno = seqno + 1;

            const txHash = transfer.hash().toString('hex');
            return {
                success: true,
                txHash,
                txLink: `https://tonviewer.com/transaction/${txHash}`,
                verify: { contract, expected: seqno + 1 }
            };
        } catch (err) {
            tonCachedSeqno = null;
            lastErr = err.message || String(err);
            SystemLogger.error('TON', `endpoint ${endpoint} failed`, err);
        }
    }

    return { success: false, manual: true, reason: `خطا در ارتباط با شبکه TON: ${lastErr}` };
}

function verifyTonLater(verify, trackingCode) {
    if (!verify) return;
    (async () => {
        try {
            for (let i = 0; i < 10; i++) {
                await sleep(3000);
                const s = await verify.contract.getSeqno();
                if (s >= verify.expected) return;
            }
            await notifyAdmins(`⚠️ تأیید تراکنش سفارش <code>${trackingCode}</code> بعد از ۳۰ ثانیه نهایی نشد. لطفاً در TON Viewer بررسی کنید.`);
        } catch (e) {
            SystemLogger.error('TON', 'verify failed', e);
        }
    })();
}

// ============================================================================
// RENDER WEB SERVICE PORT BINDING SERVER
// ============================================================================
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Stars Plus Bot Web Service is running successfully!\n');
});
server.on('error', (err) => {
    console.error(`[Server] HTTP server error (${err && err.code}): ${err && err.message}`);
});
server.listen(PORT, () => {
    console.log(`[Server] HTTP server is listening on port ${PORT}`);
});

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const TOKEN_LOOKS_VALID = /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(TOKEN);
const ADMIN_ID_USERNAME = '@shantiaNFT';
const ADMIN_NUMERIC_ID = 8750484397;
const EXTRA_ADMIN_ID = '8942987641';
const DB_FILE = path.join(__dirname, 'database.json');

const FORCE_JOIN_CHANNELS = ['@nova1_shopp'];
const REPORT_CHANNEL = '@nova1_shopp';

const CARD_NUMBER = '6219861452862914';
const CARD_OWNER = 'شنتیا زاهد پور';

const STAR_USD = 0.015;
const FALLBACK_USDT_TOMAN = 65000;
const FALLBACK_GRAM_TOMAN = 311591;

const BTN = {
    ADD: '➕ افزایش موجودی کاربر',
    SUB: '➖ کاهش موجودی کاربر',
    BAN: '🚫 بن کردن کاربر',
    UNBAN: '✅ آنبن کردن کاربر',
    CREATE_DISCOUNT: '🏷️ ساخت کد تخفیف',
    LIST_DISCOUNT: '📋 کد های تخفیف فعال و تمام شده',
    ACTIVITY: '📊 فعالیت ها',
    SECOND: '👑 تنظیم مالک دوم',
    TON: '💎 تنظیم قیمت دستی (تون)',
    STAR: '⭐ تنظیم قیمت دستی استارز',
    GIFT: '🎁 تنظیم قیمت دستی گیفت استارزی',
    BACK: '🔙 بازگشت به منوی اصلی'
};

function norm(s) {
    return (s || '').toString().replace(/[\uFE0E\uFE0F\u200B-\u200F\u202A-\u202E]/g, '').replace(/\s+/g, ' ').trim();
}
function isBtn(text, label) {
    return !!text && norm(text) === norm(label);
}

class SystemLogger {
    static info(context, message) {
        console.log(`[INFO] [${new Date().toISOString()}] [${context}] - ${message}`);
    }
    static error(context, message, err = null) {
        console.error(`[ERROR] [${new Date().toISOString()}] [${context}] - ${message}`);
        if (err && err.message) console.error(`       Details: ${err.message}`);
    }
}

const TelegramBot = typeof TelegramModule === 'function'
    ? TelegramModule
    : (
        TelegramModule.default ||
        TelegramModule.TelegramBot ||
        Object.values(TelegramModule).find(v => typeof v === 'function') ||
        TelegramModule
    );

if (!TOKEN_LOOKS_VALID) {
    SystemLogger.error('Token', '❌ توکن ربات نامعتبر یا تنظیم نشده است!');
}

const bot = new TelegramBot(TOKEN, {
    polling: TOKEN_LOOKS_VALID ? {
        interval: 300,
        autoStart: true,
        params: { timeout: 30, allowed_updates: JSON.stringify(['message', 'callback_query']) }
    } : false,
    filepath: false
});

let BOT_USERNAME = '';

function pickButtonStyle(label) {
    const t = String(label || '');
    if (/❌|لغو|برگشت|بازگشت/.test(t)) return 'danger';
    if (/✅|تایید|تأیید|خرید|انجام|عضویت|مشاهده/.test(t)) return 'success';
    return 'primary';
}

function styleButtons(markup) {
    const out = { ...markup };
    if (Array.isArray(markup.keyboard)) {
        out.keyboard = markup.keyboard.map(row => row.map(btn => {
            if (typeof btn !== 'object' || btn.style) return btn;
            return { ...btn, style: pickButtonStyle(btn.text) };
        }));
    }
    if (Array.isArray(markup.inline_keyboard)) {
        out.inline_keyboard = markup.inline_keyboard.map(row => row.map(btn => {
            if (btn.style) return btn;
            return { ...btn, style: pickButtonStyle(btn.text) };
        }));
    }
    return out;
}

['sendMessage', 'sendPhoto', 'editMessageText', 'editMessageCaption'].forEach(fn => {
    const original = bot[fn].bind(bot);
    bot[fn] = (...args) => {
        const styled = args.map(a => (a && typeof a === 'object' && a.reply_markup && typeof a.reply_markup === 'object')
            ? { ...a, reply_markup: styleButtons(a.reply_markup) }
            : a);
        return original(...styled);
    };
});

let fatalPollingHandled = false;
let lastPollingErrorLog = 0;
bot.on('polling_error', (err) => {
    const m = (err && err.message) ? err.message : String(err);
    if (/\b(404|401)\b/.test(m)) {
        if (!fatalPollingHandled) {
            fatalPollingHandled = true;
            SystemLogger.error('Polling', '❌ تلگرام توکن را رد کرد.', err);
            try { bot.stopPolling(); } catch (e) {}
        }
        return;
    }
    if (/\b409\b/.test(m)) {
        const now = Date.now();
        if (now - lastPollingErrorLog > 30000) {
            lastPollingErrorLog = now;
            SystemLogger.error('Polling', '⚠️ تداخل 409: ربات همزمان در جای دیگری هم اجرا شده.');
        }
        return;
    }
    const now = Date.now();
    if (now - lastPollingErrorLog > 10000) {
        lastPollingErrorLog = now;
        SystemLogger.error('Polling', 'Polling error', err);
    }
});

if (TOKEN_LOOKS_VALID) {
    try {
        if (typeof bot.deleteWebHook === 'function') {
            Promise.resolve(bot.deleteWebHook()).catch(() => {});
        }
    } catch (e) {}
    try {
        Promise.resolve(bot.getMe())
            .then(me => {
                BOT_USERNAME = me.username;
                SystemLogger.info('Token', `✅ توکن معتبر است. ربات: @${me.username}`);
            })
            .catch(() => {});
    } catch (e) {}
}

process.removeAllListeners('uncaughtException');
process.removeAllListeners('unhandledRejection');
process.on('uncaughtException', (err) => {
    SystemLogger.error('Process', 'Uncaught Exception', err);
});
process.on('unhandledRejection', (reason, promise) => {
    SystemLogger.error('Process', `Unhandled Rejection at: ${promise}`, new Error(String(reason)));
});

// ============================================================================
// DATABASE
// ============================================================================

let db = {
    users: {},
    orders: {},
    discountCodes: {},
    approvedReceiptsHistory: [],
    processedReceipts: {},
    secondaryAdmin: null,
    manualTonPrice: 0,
    manualStarPrice: 0,
    manualGiftBasePrice: 0
};

function getUserDataTemplate() {
    return {
        firstName: 'کاربر',
        phone: 'ثبت نشده',
        verified: 'انجام نشده',
        cardVerified: false,
        isBanned: false,
        level: 'سطح 1',
        wallet: 0,
        discountWallet: 1766,

        waitingForAmount: false,
        waitingForTicket: false,
        waitingForReceipt: false,
        waitingForDiscountInput: false,
        waitingForRecipient: false,
        waitingForComment: false,
        waitingForTrackingInput: false,
        waitingForSmartSupport: false,

        waitingForGramAmount: false,
        waitingForGramWallet: false,
        waitingForGramMemoChoice: false,
        waitingForGramMemoInput: false,

        waitingForStarCount: false,
        waitingForStarRecipient: false,

        starCount: 50,
        starRecipient: '',
        starPricePerUnit: 0,

        lastAmount: 0,
        appliedDiscountCode: null,
        appliedDiscountPercent: 0,
        currentShopState: null,

        selectedGiftName: '',
        selectedGiftStars: 0,
        recipientUsername: '',
        commentText: 'تنظیم نشده',
        lastInvoiceMessageId: null,

        gramAmount: 0,
        gramPricePerUnit: 0,
        gramWalletAddress: '',
        gramMemo: 'ندارد',
        tonOrderMode: 'wallet',

        lastReceiptPhotoId: null,
        lastReceiptCode: null,
        lastReceiptAmount: 0,
        lastReceiptTime: '',
        pendingOrderToAutoPlace: null,

        waitingForAdminUserSearch: false,
        waitingForAdminAmount: false,
        waitingForRejectReason: false,
        waitingForOrderRejectReason: false,
        waitingForReceiptRejectReason: false,
        waitingForManualPrice: false,
        waitingForManualStarPrice: false,
        waitingForManualGiftBasePrice: false,
        rejectOrderCode: null,
        adminAction: null,
        targetUserId: null,
        rejectTargetId: null,
        rejectReceiptCode: null,
        adminReplyingTo: null,

        tempDiscount: { percent: 0, capacity: 0, expiryHour: 0, restriction: null },
        waitingForDiscountPercent: false,
        waitingForDiscountCapacity: false,
        waitingForDiscountExpiry: false,
        waitingForDiscountRestriction: false
    };
}

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const loadedDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

            if (loadedDb.users) {
                for (const [userId, userData] of Object.entries(loadedDb.users)) {
                    db.users[userId] = { ...getUserDataTemplate(), ...userData };
                }
            }
            if (loadedDb.orders) db.orders = loadedDb.orders;
            if (loadedDb.discountCodes) db.discountCodes = loadedDb.discountCodes;
            if (loadedDb.approvedReceiptsHistory) db.approvedReceiptsHistory = loadedDb.approvedReceiptsHistory;
            if (loadedDb.processedReceipts) db.processedReceipts = loadedDb.processedReceipts;
            if (loadedDb.secondaryAdmin) db.secondaryAdmin = loadedDb.secondaryAdmin;
            if (typeof loadedDb.manualTonPrice !== 'undefined') db.manualTonPrice = loadedDb.manualTonPrice;
            if (typeof loadedDb.manualStarPrice !== 'undefined') db.manualStarPrice = loadedDb.manualStarPrice;
            if (typeof loadedDb.manualGiftBasePrice !== 'undefined') db.manualGiftBasePrice = loadedDb.manualGiftBasePrice;

            (db.approvedReceiptsHistory || []).forEach(r => {
                if (r.receiptCode) db.processedReceipts[r.receiptCode] = 'approved';
            });
            SystemLogger.info('Database', 'Successfully loaded records from disk.');
        } else {
            SystemLogger.info('Database', 'No existing database found. Initializing new storage.');
            saveDatabase();
        }
    } catch (e) {
        SystemLogger.error('Database', 'Failed to load database file.', e);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        SystemLogger.error('Database', 'Failed to write database file.', e);
    }
}

loadDatabase();

function getUserDataById(userId) {
    if (!db.users[userId]) {
        db.users[userId] = getUserDataTemplate();
        saveDatabase();
    }
    return db.users[userId];
}

function getUserData(msg) {
    if (!msg.from) return getUserDataById(msg.chat.id);
    const user = msg.from;
    const userData = getUserDataById(user.id);
    if (user.first_name && userData.firstName === 'کاربر') {
        userData.firstName = user.first_name;
        saveDatabase();
    }
    return userData;
}

function resetUserWaiting(userData) {
    userData.waitingForAmount = false;
    userData.waitingForTicket = false;
    userData.waitingForReceipt = false;
    userData.waitingForDiscountInput = false;
    userData.waitingForRecipient = false;
    userData.waitingForComment = false;
    userData.waitingForTrackingInput = false;
    userData.waitingForSmartSupport = false;

    userData.waitingForGramAmount = false;
    userData.waitingForGramWallet = false;
    userData.waitingForGramMemoChoice = false;
    userData.waitingForGramMemoInput = false;

    userData.waitingForStarCount = false;
    userData.waitingForStarRecipient = false;
    userData.lastInvoiceMessageId = null;
}

function resetAdminFlags(adminData) {
    adminData.adminAction = null;
    adminData.targetUserId = null;
    adminData.adminReplyingTo = null;
    adminData.waitingForAdminUserSearch = false;
    adminData.waitingForAdminAmount = false;
    adminData.waitingForRejectReason = false;
    adminData.waitingForOrderRejectReason = false;
    adminData.waitingForReceiptRejectReason = false;
    adminData.waitingForDiscountPercent = false;
    adminData.waitingForDiscountCapacity = false;
    adminData.waitingForDiscountExpiry = false;
    adminData.waitingForDiscountRestriction = false;
    adminData.waitingForManualPrice = false;
    adminData.waitingForManualStarPrice = false;
    adminData.waitingForManualGiftBasePrice = false;
}

function escapeHTML(text) {
    if (text === undefined || text === null) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function safeDeleteMessage(chatId, messageId) {
    try {
        if (messageId) await bot.deleteMessage(chatId, messageId);
    } catch (err) {}
}

async function safeSendMessage(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
    } catch (err) {
        SystemLogger.error('TelegramAPI', `Failed to send message to ${chatId}`, err);
    }
}

async function safeSendPhoto(chatId, photo, options = {}) {
    try {
        const finalOptions = { parse_mode: 'HTML', ...options };
        let photoData = photo;
        if (typeof photo === 'string') {
            if (fs.existsSync(photo)) {
                photoData = fs.createReadStream(photo);
            } else {
                return await safeSendMessage(chatId, options.caption, { reply_markup: options.reply_markup });
            }
        }
        return await bot.sendPhoto(chatId, photoData, finalOptions);
    } catch (err) {
        if (options.caption) {
            return await safeSendMessage(chatId, options.caption, { reply_markup: options.reply_markup });
        }
    }
}

async function safeAnswer(callbackId, options = {}) {
    try {
        await bot.answerCallbackQuery(callbackId, options);
    } catch (e) {}
}

function isUserAdmin(chatId) {
    const idStr = chatId.toString();
    return idStr === ADMIN_NUMERIC_ID.toString() ||
           idStr === EXTRA_ADMIN_ID.toString() ||
           (db.secondaryAdmin && idStr === db.secondaryAdmin.toString());
}

function getAdminIds() {
    const ids = [ADMIN_NUMERIC_ID.toString(), EXTRA_ADMIN_ID.toString()];
    if (db.secondaryAdmin) ids.push(db.secondaryAdmin.toString());
    return [...new Set(ids)];
}

async function notifyAdmins(text, options = {}) {
    for (const id of getAdminIds()) {
        await safeSendMessage(id, text, options);
    }
}

async function notifyAdminsPhoto(photoId, options = {}) {
    for (const id of getAdminIds()) {
        try {
            await bot.sendPhoto(id, photoId, options);
        } catch (e) {
            SystemLogger.error('TelegramAPI', `Failed to send photo to admin ${id}`, e);
        }
    }
}

async function editAdminMessage(msg, text) {
    try {
        if (msg.photo || msg.caption !== undefined) {
            await bot.editMessageCaption(text, {
                chat_id: msg.chat.id, message_id: msg.message_id,
                parse_mode: 'HTML', reply_markup: { inline_keyboard: [] }
            });
        } else {
            await bot.editMessageText(text, {
                chat_id: msg.chat.id, message_id: msg.message_id,
                parse_mode: 'HTML', reply_markup: { inline_keyboard: [] }
            });
        }
    } catch (e) {}
}

async function setReaction(chatId, messageId) {
    try {
        if (bot.setMessageReaction) {
            const reactionsList = ['❤️‍🔥', '💥', '💫', '⚡', '🔥', '❤', '🎉', '🤩', '🏆', '🌟', '✨'];
            const randomEmoji = reactionsList[Math.floor(Math.random() * reactionsList.length)];
            await bot.setMessageReaction(chatId, messageId, {
                reaction: [{ type: 'emoji', emoji: randomEmoji }]
            });
        }
    } catch (err) {}
}

function getTehranDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }));
}

function getFormattedTime() {
    const t = getTehranDate();
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}/${p(t.getMonth() + 1)}/${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
}

async function sendChannelReport(order, txLink = null) {
    try {
        const userIdStr = order.userId.toString();
        let maskedUserId = userIdStr;
        if (userIdStr.length >= 6) {
            maskedUserId = userIdStr.substring(0, 2) + '....' + userIdStr.slice(-2);
        } else if (userIdStr.length > 2) {
            maskedUserId = userIdStr[0] + '..' + userIdStr.slice(-1);
        }

        let reportMsg =
            `گزارشات | نوا شاپ\n` +
            `گزارش #خرید_موفق 🛍\n\n` +
            `👤 خریدار: <code>${maskedUserId}</code>\n` +
            `🛒 سفارش: ${escapeHTML(order.giftName)}\n` +
            `💳 مبلغ پرداخت شده: ${order.amount.toLocaleString()} تومان\n\n`;

        if (txLink) {
            reportMsg += `🔗 <a href="${txLink}">مشاهده تراکنش در TON Viewer</a>\n\n`;
        }
        reportMsg += `🕰 ${getFormattedTime()}\n🐺 @nova1_shopp`;

        const botLink = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=buy` : 'https://t.me/nova1_shopp';
        const inlineKb = [[{ text: '🤖 | برای خرید اقدام کن!', url: botLink }]];
        if (txLink) inlineKb.unshift([{ text: '🔍 مشاهده تراکنش (Tonviewer)', url: txLink }]);

        await bot.sendMessage(REPORT_CHANNEL, reportMsg, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: inlineKb }
        });
        return null;
    } catch (err) {
        SystemLogger.error('ChannelReport', 'Failed to send report to channel', err);
        return (err && err.message) ? err.message : 'unknown error';
    }
}

async function checkMembership(userId) {
    try {
        for (const channel of FORCE_JOIN_CHANNELS) {
            const chatMember = await bot.getChatMember(channel, userId);
            if (!['creator', 'administrator', 'member', 'restricted'].includes(chatMember.status)) {
                return false;
            }
        }
        return true;
    } catch (e) {
        return false;
    }
}

function discountTypeForState(state) {
    if (state === 'star_invoice') return 'stars';
    if (state === 'gift_invoice') return 'gift_stars';
    return null;
}

function isDiscountFinished(obj) {
    if (!obj) return true;
    if (obj.expiresAt && Date.now() > obj.expiresAt) return true;
    if (obj.capacity && obj.usedCount >= obj.capacity) return true;
    return false;
}

function validateDiscount(codeInput, userData) {
    const obj = db.discountCodes[codeInput];
    if (!obj) return { ok: false, error: 'کد تخفیف وارد شده نامعتبر است.' };
    if (obj.expiresAt && Date.now() > obj.expiresAt) return { ok: false, error: 'مهلت استفاده از این کد تخفیف تمام شده است.' };
    if (obj.capacity && obj.usedCount >= obj.capacity) return { ok: false, error: 'ظرفیت این کد تخفیف تمام شده است.' };
    const type = discountTypeForState(userData.currentShopState);
    if (obj.restriction && type && obj.restriction !== type) {
        return { ok: false, error: 'این کد تخفیف برای این بخش قابل استفاده نیست.' };
    }
    return { ok: true, obj };
}

function consumeDiscount(userData) {
    if (userData.appliedDiscountCode && db.discountCodes[userData.appliedDiscountCode]) {
        db.discountCodes[userData.appliedDiscountCode].usedCount =
            (db.discountCodes[userData.appliedDiscountCode].usedCount || 0) + 1;
    }
    userData.appliedDiscountCode = null;
    userData.appliedDiscountPercent = 0;
    saveDatabase();
}

const BRSAPI_URL = 'https://Api.BrsApi.ir/Market/Cryptocurrency.php?key=BrcH3cX7vcbuX9tE7Pr8dJGsjkeKKJTt';
const PRICE_MARGIN = 1.08;
const MARKET_CACHE_TTL_MS = 2000;
const MARKET_FETCH_TIMEOUT_MS = 4000;

const MARKET_MATCH = {
    tether: { en: ['tether'], fa: ['تتر'] },
    ton: { en: ['toncoin'], fa: ['تونکوین', 'تون'] },
    usdc: { en: ['usd coin'], fa: ['یواسدیکوین'] }
};

let marketCache = { data: null, time: 0 };
let marketInFlight = null;

function fetchBrsApiJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 StarsPlusBot', 'Cache-Control': 'no-cache' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(MARKET_FETCH_TIMEOUT_MS, () => req.destroy(new Error('BrsApi timeout')));
    });
}

function toNumber(v) {
    const n = parseFloat(String(v ?? '').replace(/[,\s]/g, ''));
    return isNaN(n) ? 0 : n;
}

function normalizeFa(s) {
    return String(s || '').replace(/[\u200c\s]/g, '').trim();
}

function findMarketItem(list, matcher) {
    return list.find(item => {
        const en = String(item.name_en || '').trim().toLowerCase();
        const fa = normalizeFa(item.name);
        return matcher.en.includes(en) || matcher.fa.includes(fa);
    }) || null;
}

function parseMarket(payload) {
    const list = Array.isArray(payload)
        ? payload
        : ((payload && (payload.data || payload.result || payload.items)) || []);
    if (!Array.isArray(list) || list.length === 0) throw new Error('BrsApi response is empty');

    const tether = findMarketItem(list, MARKET_MATCH.tether);
    const ton = findMarketItem(list, MARKET_MATCH.ton);
    const usdc = findMarketItem(list, MARKET_MATCH.usdc);

    let usdtToman = tether ? toNumber(tether.price_toman) : 0;
    if (usdtToman <= 0 && tether && usdc && toNumber(usdc.price) > 0 && toNumber(usdc.price_toman) > 0) {
        usdtToman = toNumber(tether.price) * (toNumber(usdc.price_toman) / toNumber(usdc.price));
    }
    usdtToman = Math.round(usdtToman);
    if (usdtToman <= 0) throw new Error('Tether toman price not available');

    let tonToman = ton ? toNumber(ton.price_toman) : 0;
    if (tonToman <= 0 && ton) tonToman = toNumber(ton.price) * usdtToman;

    return {
        usdtToman,
        tonToman: Math.round(tonToman),
        tonUsd: ton ? toNumber(ton.price) : 0,
        time: Date.now()
    };
}

async function getMarket() {
    if (marketCache.data && Date.now() - marketCache.time < MARKET_CACHE_TTL_MS) {
        return marketCache.data;
    }
    if (marketInFlight) return marketInFlight;

    marketInFlight = (async () => {
        try {
            const fresh = parseMarket(await fetchBrsApiJson(BRSAPI_URL));
            marketCache = { data: fresh, time: Date.now() };
            return fresh;
        } catch (e) {
            SystemLogger.error('MarketPrice', 'BrsApi fetch failed', e);
            return marketCache.data;
        } finally {
            marketInFlight = null;
        }
    })();

    return marketInFlight;
}

async function getUsdtTomanPrice() {
    const m = await getMarket();
    return m && m.usdtToman > 0 ? m.usdtToman : FALLBACK_USDT_TOMAN;
}

async function getBinanceTONPriceInToman() {
    if (db.manualTonPrice && db.manualTonPrice > 0) return db.manualTonPrice;
    const m = await getMarket();
    if (m && m.tonToman > 0) return Math.round(m.tonToman * PRICE_MARGIN);
    return FALLBACK_GRAM_TOMAN;
}

async function fetchStarsPrice() {
    if (db.manualStarPrice && db.manualStarPrice > 0) return db.manualStarPrice;
    const usdtToman = await getUsdtTomanPrice();
    return Math.round(STAR_USD * usdtToman * PRICE_MARGIN);
}

async function fetchGramData() {
    const finalPrice = await getBinanceTONPriceInToman();
    const m = await getMarket();
    return {
        gramUsd: m ? m.tonUsd.toFixed(2) : '0.00',
        finalPrice,
        usdtToman: m ? m.usdtToman : FALLBACK_USDT_TOMAN
    };
}

async function gramTotal(amountTon) {
    const price = await getBinanceTONPriceInToman();
    return Math.round(Number(amountTon) * price);
}

function getMainKeyboard(isAdmin) {
    const rows = [
        [{ text: '🛒 خرید محصول' }],
        [{ text: '➕ افزایش موجودی' }, { text: '💳 حساب کاربری' }],
        [{ text: '📞 پشتیبانی' }, { text: '📦 پیگیری سفارش' }],
        [{ text: '❤️ چطوری میتوانم به شما اعتماد کنم' }]
    ];
    if (isAdmin) rows.push([{ text: '🔧 پنل مدیریت' }]);
    return { reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true } };
}

function getShopKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: 'سفارش های اخیر من 📥' }],
                [{ text: 'خرید ارز تون 💎' }],
                [{ text: 'استارز ⭐️' }],
                [{ text: 'گیفت استارزی 🎁' }],
                [{ text: 'شارژ تون بالانس ⚡' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
}

function getBackKeyboard() {
    return { reply_markup: { keyboard: [[{ text: 'برگشت ↩️' }]], resize_keyboard: true } };
}

function getAccountKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '📦 سفارش های معلق من' }, { text: '📦 سفارش های اخیر من' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
}

function getAdminPanelKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: BTN.ADD }, { text: BTN.SUB }],
                [{ text: BTN.BAN }, { text: BTN.UNBAN }],
                [{ text: BTN.CREATE_DISCOUNT }, { text: BTN.LIST_DISCOUNT }],
                [{ text: BTN.ACTIVITY }, { text: BTN.SECOND }],
                [{ text: BTN.TON }, { text: BTN.STAR }],
                [{ text: BTN.GIFT }],
                [{ text: BTN.BACK }]
            ],
            resize_keyboard: true
        }
    };
}

function clearDiscount(userData) {
    userData.appliedDiscountCode = null;
    userData.appliedDiscountPercent = 0;
}

function getActiveDiscountPercent(userData, type) {
    if (!userData.appliedDiscountCode || !userData.appliedDiscountPercent) return 0;
    const codeObj = db.discountCodes[userData.appliedDiscountCode];
    if (!codeObj) return 0;
    if (codeObj.restriction && codeObj.restriction !== type) return 0;
    return userData.appliedDiscountPercent;
}

function buildTotals(total, percent) {
    const discount = percent > 0 ? Math.round(total * (percent / 100)) : 0;
    return { total, percent, discount, final: Math.max(0, total - discount) };
}

async function calcStar(userData) {
    const unitPrice = userData.starPricePerUnit || await fetchStarsPrice();
    const total = Math.round(unitPrice * userData.starCount);
    return buildTotals(total, getActiveDiscountPercent(userData, 'stars'));
}

async function calcGift(userData) {
    let starziTomanPerUnit;
    if (db.manualGiftBasePrice && db.manualGiftBasePrice > 0) {
        starziTomanPerUnit = Math.round((db.manualGiftBasePrice / 15) * userData.selectedGiftStars);
    } else {
        const usdtToman = await getUsdtTomanPrice();
        starziTomanPerUnit = Math.round(userData.selectedGiftStars * STAR_USD * usdtToman * PRICE_MARGIN);
    }
    return buildTotals(Math.round(starziTomanPerUnit), getActiveDiscountPercent(userData, 'gift_stars'));
}

function priceBlock(c, label) {
    if (c.discount > 0) {
        return `${label}: <s>${c.total.toLocaleString()}</s> تومان\n` +
               `🎫 تخفیف کد (${c.percent}%): ${c.discount.toLocaleString()} تومان\n`;
    }
    return `${label}: ${c.total.toLocaleString()} تومان\n`;
}

function starInvoiceKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: 'تأیید ✅' }, { text: 'لغو خرید ❌' }],
                [{ text: 'اعمال تخفیف 🎁' }, { text: 'اعمال کد تخفیف 🎫' }],
                [{ text: '🔙 بازگشت به پکیج‌ها' }, { text: '🏠 منوی اصلی' }]
            ],
            resize_keyboard: true
        }
    };
}

function giftInvoiceKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید' }, { text: 'لغو خرید ❌' }],
                [{ text: '💳 اعمال کد تخفیف' }],
                [{ text: '💬 تنظیم کامنت' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
}

function gramInvoiceKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید گرام' }, { text: 'لغو خرید ❌' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
}

function getInvoiceKeyboardForState(state) {
    if (state === 'star_invoice') return starInvoiceKeyboard();
    if (state === 'gift_invoice') return giftInvoiceKeyboard();
    if (state === 'gram_invoice') return gramInvoiceKeyboard();
    return null;
}

function getInvoiceShowerForState(state) {
    if (state === 'star_invoice') return showStarInvoice;
    if (state === 'gift_invoice') return showGiftInvoice;
    return null;
}

async function tryEditInvoice(chatId, messageId, text) {
    if (!messageId) return false;
    const opts = { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' };
    try {
        await bot.editMessageCaption(text, opts);
        return true;
    } catch (e1) {
        if (/not modified/i.test((e1 && e1.message) || '')) return true;
        try {
            await bot.editMessageText(text, opts);
            return true;
        } catch (e2) {
            if (/not modified/i.test((e2 && e2.message) || '')) return true;
            return false;
        }
    }
}

async function revalidateAppliedDiscount(chatId, userData, showFn) {
    if (!userData.appliedDiscountCode) return true;
    const r = validateDiscount(userData.appliedDiscountCode, userData);
    if (r.ok) return true;
    clearDiscount(userData);
    saveDatabase();
    await safeSendMessage(chatId, `⚠️ ${r.error}\nکد تخفیف از فاکتور حذف شد، لطفاً فاکتور جدید را بررسی کنید.`);
    await showFn(chatId, userData, false);
    return false;
}

async function showStarInvoice(chatId, userData, edit = false) {
    const c = await calcStar(userData);
    const availableDiscountWallet = userData.discountWallet || 1766;
    userData.lastAmount = c.final;
    saveDatabase();

    const invoiceMsg =
        `<b>فاکتور خرید استارز</b>\n\n` +
        `💫 مقدار خرید: ${userData.starCount}\n` +
        `👤 یوزر دریافت‌کننده: @${escapeHTML(userData.starRecipient)}\n\n` +
        priceBlock(c, '💰 مبلغ فاکتور') +
        `🎁 کل موجودی تخفیف: ${availableDiscountWallet.toLocaleString()} تومان\n\n` +
        `🩵 مبلغ نهایی: <b>${c.final.toLocaleString()} تومان</b>\n\n` +
        `💼 در صورتی که جزئیات بالا مورد تأیید شماست ✓ روی دکمه تأیید کلیک کنید.`;

    if (edit && await tryEditInvoice(chatId, userData.lastInvoiceMessageId, invoiceMsg)) return;

    await safeDeleteMessage(chatId, userData.lastInvoiceMessageId);
    const sent = await safeSendPhoto(chatId, '1000002626.jpg', { caption: invoiceMsg, reply_markup: starInvoiceKeyboard().reply_markup });
    if (sent && sent.message_id) {
        userData.lastInvoiceMessageId = sent.message_id;
        saveDatabase();
    }
}

async function showGiftInvoice(chatId, userData, edit = false) {
    const c = await calcGift(userData);
    userData.lastAmount = c.final;
    saveDatabase();

    const invoiceMsg =
        `<b>فاکتور خرید گیفت</b>\n\n` +
        `محصول: ${escapeHTML(userData.selectedGiftName)} (${userData.selectedGiftStars} استارز)\n` +
        `یوزر دریافت‌‌کننده: @${escapeHTML(userData.recipientUsername)}\n\n` +
        `کامنت: ${escapeHTML(userData.commentText)}\n\n` +
        priceBlock(c, '💰 مبلغ فاکتور') +
        `\nمبلغ نهایی: <b>${c.final.toLocaleString()} تومان</b>\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه تایید کلیک کنید.`;

    if (edit && await tryEditInvoice(chatId, userData.lastInvoiceMessageId, invoiceMsg)) return;

    await safeDeleteMessage(chatId, userData.lastInvoiceMessageId);
    const sent = await safeSendMessage(chatId, invoiceMsg, giftInvoiceKeyboard());
    if (sent && sent.message_id) {
        userData.lastInvoiceMessageId = sent.message_id;
        saveDatabase();
    }
}

async function showGramInvoice(chatId, userData) {
    const price = await getBinanceTONPriceInToman();
    userData.gramPricePerUnit = price;
    const total = Math.round(userData.gramAmount * price);
    userData.lastAmount = total;
    saveDatabase();

    const isAccount = userData.tonOrderMode === 'account';
    const dest = isAccount ? 'شارژ اکانت تلگرام' : `<code>${escapeHTML(userData.gramWalletAddress)}</code>`;

    const invoiceMsg =
        `<b>[ فاکتور خرید ارز تون ( TON ) ]</b>\n\n` +
        `🔹 نوع خدمات: خرید ارز تون\n` +
        `🔹 تعداد: ${userData.gramAmount} تون\n` +
        `🔹 آدرس ولت: ${dest}\n` +
        `🔹 کامنت (ممو): ${escapeHTML(userData.gramMemo)}\n\n` +
        `💰 مبلغ نهایی: <b>${total.toLocaleString()} تومان</b>\n\n` +
        `در صورت تأیید جزئیات بالا، روی دکمه «✅ تایید گرام» کلیک کنید.`;

    await safeSendMessage(chatId, invoiceMsg, gramInvoiceKeyboard());
}

function tonCompletedText(order, trackingCode) {
    return `✅ <b>سفارش شما با موفقیت تکمیل شد!</b>\n\n` +
        `📋 <b>اطلاعات سفارش:</b>\n\n` +
        `🔹 نوع خدمات: خرید ارز تون\n` +
        `🔹 تعداد: ${order.count} تون\n` +
        `🔹 آدرس ولت: <code>${escapeHTML(order.recipient)}</code>\n` +
        `🔹 مبلغ نهایی پرداخت شده: ${order.amount.toLocaleString()} تومان\n` +
        `🔹 کد پیگیری: <code>${trackingCode}</code>\n` +
        `🔹 زمان انجام: ${order.paidAt}\n\n` +
        `⚡ ارز تون به ولت شما ارسال شد.\nاز اعتماد و انتخاب شما سپاسگزاریم!`;
}

async function deliverTonOrder(order, trackingCode) {
    safeSendMessage(order.userId,
        `⏳ <b>در حال پردازش سفارش شما...</b>\n\n🏷️ کد پیگیری: <code>${trackingCode}</code>`);

    let result;
    if (order.tonMode === 'account') {
        result = { success: false, manual: true, reason: 'شارژ مستقیم اکانت تلگرام (نیاز به بررسی دستی)' };
    } else if (!isValidTonAddress(order.recipient)) {
        result = { success: false, manual: true, reason: 'آدرس ولت وارد شده معتبر نیست' };
    } else {
        result = await enqueueTon(() => sendTonFromBot(order.recipient, order.count, order.comment));
    }

    if (result.success) {
        order.status = 'completed';
        order.txHash = result.txHash;
        order.txLink = result.txLink;
        order.paidAt = getFormattedTime();
        saveDatabase();

        await safeSendMessage(order.userId, tonCompletedText(order, trackingCode), {
            reply_markup: {
                inline_keyboard: [[{ text: '🔍 مشاهده تراکنش', url: result.txLink }]]
            }
        });

        verifyTonLater(result.verify, trackingCode);
        await sendChannelReport(order, result.txLink);
        return true;
    }

    order.status = 'manual_pending';
    saveDatabase();

    await safeSendMessage(order.userId,
        `⚠️ <b>ولت ربات در حال حاضر موجودی کافی ندارد</b>\n\n` +
        `🏷️ کد پیگیری: <code>${trackingCode}</code>\n\n` +
        `سفارش شما به حالت دستی منتقل شد. پس از واریز توسط ادمین، پیام تکمیل سفارش و لینک تراکنش برای شما ارسال می‌شود.`);

    await notifyAdmins(
        `<b>[ ⚠️ سفارش TON نیاز به انتقال دستی دارد ]</b>\n\n` +
        `👤 نام کاربر: ${escapeHTML(order.firstName)}\n` +
        `🆔 آیدی: <code>${order.userId}</code>\n` +
        `🏷️ کد پیگیری: <code>${trackingCode}</code>\n` +
        `💎 مقدار: ${order.count} TON\n` +
        `📫 مقصد: <code>${escapeHTML(order.recipient)}</code>\n` +
        `💬 ممو: ${escapeHTML(order.comment)}\n` +
        `❌ علت: ${escapeHTML(result.reason)}`,
        {
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                    { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                ]]
            }
        }
    );
    return false;
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

bot.on('message', async (msg) => {
    try {
        await handleMessage(msg);
    } catch (err) {
        SystemLogger.error('MessageHandler', 'Error while handling message', err);
    }
});

async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const contact = msg.contact;
    const photo = msg.photo;

    if (msg.message_id) await setReaction(chatId, msg.message_id);

    const isAdmin = isUserAdmin(chatId);
    const userData = getUserData(msg);
    const adminData = userData;

    if (userData.isBanned) {
        await safeSendMessage(chatId, 'حساب کاربری شما توسط ادمین مسدود شده است.');
        return;
    }

    if (!isAdmin) {
        const isMember = await checkMembership(msg.from.id);
        if (!isMember) {
            const joinMarkup = {
                inline_keyboard: [
                    [{ text: '📢 عضویت در کانال ربات', url: 'https://t.me/nova1_shopp' }],
                    [{ text: '✅ تایید عضویت', callback_data: 'check_join' }]
                ]
            };
            await safeSendMessage(chatId, '❌ <b>برای استفاده از ربات و دریافت خدمات، ابتدا باید در کانال ما عضو شوید.</b>', { reply_markup: joinMarkup });
            return;
        }
    }

    const mainKeyboard = getMainKeyboard(isAdmin);
    const backKeyboard = getBackKeyboard();
    const accountKeyboard = getAccountKeyboard();
    const adminPanelMarkup = getAdminPanelKeyboard();

    if (text && text.startsWith('/start')) {
        resetUserWaiting(userData);
        if (isAdmin) resetAdminFlags(adminData);
        userData.currentShopState = null;
        saveDatabase();
        const welcomeText = `به ربات نوا شاپ خوش آمدید ! 🌟\nمجموعه‌ای کامل برای خدمات تلگرامی شما.`;
        await safeSendPhoto(chatId, '1000002624.jpg', { caption: welcomeText, reply_markup: mainKeyboard.reply_markup });
        return;
    }

    if (text === 'لغو خرید ❌' || text === '❌ لغو خرید') {
        userData.currentShopState = null;
        userData.lastInvoiceMessageId = null;
        userData.appliedDiscountCode = null;
        userData.appliedDiscountPercent = 0;
        userData.pendingOrderToAutoPlace = null;
        resetUserWaiting(userData);
        saveDatabase();
        await safeSendMessage(chatId, 'خرید شما لغو شد.', mainKeyboard);
        return;
    }

    const backCommands = [
        '🔙 بازگشت', 'برگشت ↩️', '🔙 برگشت', '🏠 منوی اصلی',
        'انصراف', '↶ برگشت', '🔙 بازگشت به منوی اصلی', '🔙 بازگشت به پکیج‌ها'
    ];

    if (text && backCommands.some(c => norm(c) === norm(text))) {
        resetUserWaiting(userData);
        if (isAdmin) resetAdminFlags(adminData);
        saveDatabase();

        if (text === '🏠 منوی اصلی' || text === '🔙 بازگشت به منوی اصلی' || !userData.currentShopState || userData.currentShopState === 'main_shop' || userData.currentShopState === 'star_menu') {
            userData.currentShopState = null;
            saveDatabase();
            await safeSendMessage(chatId, 'به منوی اصلی برگشتید.', mainKeyboard);
            return;
        }

        if (text === '🔙 بازگشت به پکیج‌ها' || userData.currentShopState === 'star_recipient' || userData.currentShopState === 'star_invoice') {
            clearDiscount(userData);
            userData.currentShopState = 'star_menu';
            userData.waitingForStarCount = true;
            saveDatabase();
            userData.starPricePerUnit = await fetchStarsPrice();
            saveDatabase();

            const starMsg =
                `💥 وقت درخشیدن با استارز تلگرامه !\n\n` +
                `🎯 کاربردهای استارز :\n` +
                `✨ فعال‌سازی ری‌اکشن‌های استارز در چت‌ها\n` +
                `🎯 خرید یا تمدید اکانت پرمیوم تلگرام\n` +
                `💸 پرداخت هزینه تبلیغات تلگرام\n\n` +
                `🪐 لطفاً تعداد استارز مورد نظر خود را ارسال کنید:`;

            await safeSendPhoto(chatId, '1000002624.jpg', {
                caption: starMsg,
                reply_markup: { keyboard: [[{ text: 'محاسبه با موجودی من 🔄' }], [{ text: 'برگشت ↩️' }]], resize_keyboard: true }
            });
            return;
        } else {
            userData.currentShopState = 'main_shop';
            saveDatabase();
            const shopMsg =
                `🛒 **وقتشه محصولت رو انتخاب کنی !**\n\n` +
                `🚀 تمامی سفارشات با بالاترین سرعت و همراه با پشتیبانی کامل انجام می‌شن تا تجربه‌ای مطمئن و بی‌دغدغه داشته باشی !\n\n` +
                `🫶 **از لیست زیر ، گزینه مورد نظرت رو انتخاب کن :**`;
            await safeSendMessage(chatId, shopMsg, getShopKeyboard());
            return;
        }
    }

    if (isAdmin && text) {
        const adminButtonTexts = getAdminPanelKeyboard().reply_markup.keyboard.flat().map(b => b.text);
        const isAdminButton = adminButtonTexts.some(b => isBtn(text, b)) || text === '🔧 پنل مدیریت' || text === '/admin';
        if (isAdminButton) {
            resetAdminFlags(adminData);
            saveDatabase();
        }
    }

    if (isAdmin && (text === '🔧 پنل مدیریت' || text === '/admin')) {
        await safeSendMessage(chatId, 'پنل مدیریت:', adminPanelMarkup);
        return;
    }

    if (isAdmin && text === '/diag') {
        try {
            const info = await bot.getWebHookInfo();
            const pair = await getTonKeyPair();
            let walletStatusText = '🔴 غیرفعال / تنظیم نشده';
            if (pair) {
                try {
                    const client = new TonClient({ endpoint: TON_ENDPOINTS[0] });
                    const balanceNano = await client.getBalance(pair.wallet.address);
                    const balanceTon = (Number(balanceNano) / 1e9).toFixed(4);
                    walletStatusText = `🟢 فعال\n💎 آدرس ولت: <code>${pair.wallet.address.toString()}</code>\n💰 موجودی ولت: <b>${balanceTon} TON</b>`;
                } catch (err) {
                    walletStatusText = `🟢 فعال (آدرس: <code>${pair.wallet.address.toString()}</code>)\n⚠️ خطا در دریافت موجودی آنلاین`;
                }
            }

            await safeSendMessage(chatId,
                `<b>🔎 تشخیص و وضعیت ربات</b>\n\n` +
                `Webhook: <code>${escapeHTML(info.url || 'ندارد')}</code>\n` +
                `پیام‌های در انتظار: ${info.pending_update_count}\n` +
                `آخرین خطا: ${escapeHTML(info.last_error_message || 'ندارد')}\n\n` +
                `<b>💎 وضعیت ولت TON:</b>\n${walletStatusText}`,
                adminPanelMarkup);
        } catch (e) {
            await safeSendMessage(chatId, `❌ خطا در تشخیص: ${escapeHTML(e.message)}`, adminPanelMarkup);
        }
        return;
    }

    if (isAdmin && adminData.waitingForManualPrice && text) {
        const newPrice = parseInt(text.replace(/,/g, '').trim());
        if (isNaN(newPrice) || newPrice < 0) {
            await safeSendMessage(chatId, '❌ لطفاً یک عدد معتبر به تومان وارد کنید:');
            return;
        }
        db.manualTonPrice = newPrice;
        adminData.waitingForManualPrice = false;
        saveDatabase();
        const statusMsg = newPrice === 0
            ? '✅ قیمت دستی غیرفعال شد.'
            : `✅ قیمت دستی به مبلغ <b>${newPrice.toLocaleString()} تومان</b> ذخیره شد.`;
        await safeSendMessage(chatId, `<b>[ بروزرسانی قیمت ]</b>\n\n${statusMsg}`, adminPanelMarkup);
        return;
    }

    if (isAdmin && adminData.waitingForManualStarPrice && text) {
        const newPrice = parseInt(text.replace(/,/g, '').trim());
        if (isNaN(newPrice) || newPrice < 0) {
            await safeSendMessage(chatId, '❌ لطفاً یک عدد معتبر وارد کنید:');
            return;
        }
        db.manualStarPrice = newPrice;
        adminData.waitingForManualStarPrice = false;
        saveDatabase();
        const statusMsg = newPrice === 0
            ? '✅ قیمت دستی استارز غیرفعال شد.'
            : `✅ قیمت دستی هر واحد استارز به مبلغ <b>${newPrice.toLocaleString()} تومان</b> ذخیره شد.`;
        await safeSendMessage(chatId, `<b>[ بروزرسانی قیمت استارز ]</b>\n\n${statusMsg}`, adminPanelMarkup);
        return;
    }

    if (isAdmin && adminData.waitingForManualGiftBasePrice && text) {
        const newPrice = parseInt(text.replace(/,/g, '').trim());
        if (isNaN(newPrice) || newPrice < 0) {
            await safeSendMessage(chatId, '❌ لطفاً یک مبلغ معتبر وارد کنید:');
            return;
        }
        db.manualGiftBasePrice = newPrice;
        adminData.waitingForManualGiftBasePrice = false;
        saveDatabase();
        const statusMsg = newPrice === 0
            ? '✅ قیمت دستی گیفت غیرفعال شد.'
            : `✅ قیمت دستی گیفت ۱۵ استارزی به مبلغ <b>${newPrice.toLocaleString()} تومان</b> تنظیم شد.`;
        await safeSendMessage(chatId, `<b>[ تنظیم قیمت دستی گیفت‌های استارزی ]</b>\n\n${statusMsg}`, adminPanelMarkup);
        return;
    }

    if (isAdmin && adminData.waitingForOrderRejectReason && text) {
        const orderCode = adminData.rejectOrderCode;
        const reason = escapeHTML(text);
        adminData.waitingForOrderRejectReason = false;
        adminData.rejectOrderCode = null;
        saveDatabase();

        const order = db.orders[orderCode];
        if (order && (order.status === 'pending' || order.status === 'manual_pending')) {
            order.status = 'rejected';
            const orderUser = getUserDataById(order.userId);
            orderUser.wallet += order.amount;
            saveDatabase();
            await safeSendMessage(order.userId,
                `❌ سفارش شما با کد پیگیری <code>${escapeHTML(orderCode)}</code> توسط مدیریت رد شد.\n\n` +
                `دلیل: ${reason}\n\n` +
                `💰 مبلغ ${order.amount.toLocaleString()} تومان به موجودی حساب شما برگردانده شد.`);
            await safeSendMessage(chatId, `✅ دلیل رد سفارش برای کاربر ارسال شد و مبلغ برگشت.`, adminPanelMarkup);
        } else {
            await safeSendMessage(chatId, `این سفارش قبلاً بررسی شده است.`, adminPanelMarkup);
        }
        return;
    }

    if (isAdmin && adminData.waitingForReceiptRejectReason && text) {
        const targetUserId = adminData.rejectTargetId;
        const receiptCode = adminData.rejectReceiptCode;
        const reason = escapeHTML(text);
        adminData.waitingForReceiptRejectReason = false;
        adminData.rejectTargetId = null;
        adminData.rejectReceiptCode = null;

        if (receiptCode && db.processedReceipts[receiptCode]) {
            saveDatabase();
            await safeSendMessage(chatId, `این رسید قبلاً بررسی شده است.`, adminPanelMarkup);
            return;
        }
        if (receiptCode) db.processedReceipts[receiptCode] = 'rejected';

        const targetUserObj = getUserDataById(targetUserId);
        targetUserObj.pendingOrderToAutoPlace = null;
        saveDatabase();

        await safeSendMessage(targetUserId, `❌ رسید پرداخت شما توسط مدیریت رد شد.\n\nدلیل: ${reason}`);
        await safeSendMessage(chatId, `✅ دلیل رد رسید برای کاربر ارسال شد.`, adminPanelMarkup);
        return;
    }

    if (isAdmin) {
        if (adminData.waitingForDiscountPercent && text) {
            const percent = parseInt(text);
            if (isNaN(percent) || percent <= 0 || percent > 100) {
                await safeSendMessage(chatId, 'لطفاً یک عدد معتبر بین 1 تا 100 وارد کنید:');
                return;
            }
            adminData.tempDiscount.percent = percent;
            adminData.waitingForDiscountPercent = false;
            adminData.waitingForDiscountCapacity = true;
            saveDatabase();
            await safeSendMessage(chatId, 'ظرفیت این کد را وارد کنید:');
            return;
        }

        if (adminData.waitingForDiscountCapacity && text) {
            const capacity = parseInt(text);
            if (isNaN(capacity) || capacity <= 0) {
                await safeSendMessage(chatId, 'لطفاً یک عدد صحیح بزرگتر از صفر وارد کنید:');
                return;
            }
            adminData.tempDiscount.capacity = capacity;
            adminData.waitingForDiscountCapacity = false;
            adminData.waitingForDiscountExpiry = true;
            saveDatabase();
            await safeSendMessage(chatId, 'ساعت اتمام اعتبار کد به وقت تهران را وارد کنید (0 تا 23):');
            return;
        }

        if (adminData.waitingForDiscountExpiry && text) {
            const expiryHour = parseInt(text);
            if (isNaN(expiryHour) || expiryHour < 0 || expiryHour > 23) {
                await safeSendMessage(chatId, 'لطفاً یک ساعت معتبر بین 0 تا 23 وارد کنید:');
                return;
            }
            adminData.tempDiscount.expiryHour = expiryHour;
            adminData.waitingForDiscountExpiry = false;
            adminData.waitingForDiscountRestriction = true;
            saveDatabase();
            await safeSendMessage(chatId, 'لطفاً نوع محدودیت کد تخفیف را انتخاب کنید:', {
                reply_markup: {
                    keyboard: [
                        [{ text: '🌐 بدون محدودیت' }, { text: '⭐ محدودیت برای استارز' }],
                        [{ text: '🎁 محدودیت برای گیفت‌ها' }],
                        [{ text: 'برگشت ↩️' }]
                    ],
                    resize_keyboard: true
                }
            });
            return;
        }

        if (adminData.waitingForDiscountRestriction && text) {
            const t = norm(text);
            let restriction = null;
            if (t.includes('محدودیت برای استارز')) restriction = 'stars';
            else if (t.includes('محدودیت برای گیفت')) restriction = 'gift_stars';
            else if (t.includes('بدون محدودیت')) restriction = null;
            else {
                await safeSendMessage(chatId, 'لطفاً یکی از دکمه‌های محدودیت را انتخاب کنید.');
                return;
            }

            adminData.waitingForDiscountRestriction = false;
            adminData.tempDiscount.restriction = restriction;

            const th = getTehranDate();
            let hoursUntil = (adminData.tempDiscount.expiryHour - th.getHours() + 24) % 24;
            if (hoursUntil === 0) hoursUntil = 24;
            const msIntoHour = th.getMinutes() * 60000 + th.getSeconds() * 1000;
            const expiresAt = Date.now() + hoursUntil * 3600000 - msIntoHour;

            let code;
            do {
                code = 'PLUS-' + Math.floor(1000 + Math.random() * 9000);
            } while (db.discountCodes[code]);

            db.discountCodes[code] = {
                percent: adminData.tempDiscount.percent,
                capacity: adminData.tempDiscount.capacity,
                usedCount: 0,
                expiryHour: adminData.tempDiscount.expiryHour,
                expiresAt,
                restriction: adminData.tempDiscount.restriction
            };
            saveDatabase();

            await safeSendMessage(chatId,
                `<b>✅ کد تخفیف ساخته شد</b>\n\n` +
                `کد تخفیف: <tg-spoiler>${code}</tg-spoiler>\n` +
                `کد قابل کپی: <code>${code}</code>\n` +
                `درصد: ${adminData.tempDiscount.percent}%\n` +
                `ظرفیت: ${adminData.tempDiscount.capacity}\n` +
                `اعتبار تا ساعت: ${adminData.tempDiscount.expiryHour}:00 (وقت تهران)\n` +
                `محدودیت: ${adminData.tempDiscount.restriction || 'بدون محدودیت'}`,
                adminPanelMarkup);
            return;
        }
    }

    if (isAdmin && adminData.adminReplyingTo) {
        const targetUserToReply = adminData.adminReplyingTo;
        adminData.adminReplyingTo = null;
        saveDatabase();
        if (text) {
            await safeSendMessage(targetUserToReply, `پاسخ پشتیبانی از طرف مدیریت:\n\n${escapeHTML(text)}`);
            await safeSendMessage(chatId, `✅ پاسخ شما با موفقیت ارسال شد.`, adminPanelMarkup);
            return;
        }
    }

    if (isAdmin && adminData.adminAction) {
        if (adminData.waitingForAdminUserSearch && text) {
            const targetId = text.trim();
            if (!/^\d+$/.test(targetId)) {
                await safeSendMessage(chatId, '❌ آیدی عددی معتبر وارد کنید:');
                return;
            }
            adminData.waitingForAdminUserSearch = false;
            adminData.targetUserId = targetId;
            saveDatabase();

            if (adminData.adminAction === 'BAN') {
                const targetUser = getUserDataById(targetId);
                targetUser.isBanned = true;
                resetAdminFlags(adminData);
                saveDatabase();
                await safeSendMessage(chatId, `کاربر <code>${targetId}</code> بن شد.`, adminPanelMarkup);
                return;
            } else if (adminData.adminAction === 'UNBAN') {
                const targetUser = getUserDataById(targetId);
                targetUser.isBanned = false;
                resetAdminFlags(adminData);
                saveDatabase();
                await safeSendMessage(chatId, `کاربر <code>${targetId}</code> آنبن شد.`, adminPanelMarkup);
                return;
            } else if (adminData.adminAction === 'SECOND') {
                db.secondaryAdmin = targetId;
                resetAdminFlags(adminData);
                saveDatabase();
                await safeSendMessage(chatId, `کاربر <code>${targetId}</code> به عنوان مالک دوم ثبت شد.`, adminPanelMarkup);
                return;
            }

            adminData.waitingForAdminAmount = true;
            saveDatabase();
            if (adminData.adminAction === 'ADD') await safeSendMessage(chatId, `مبلغ افزایشی (تومان):`);
            else if (adminData.adminAction === 'SUB') await safeSendMessage(chatId, `مبلغ کاهشی (تومان):`);
            return;
        }

        if (adminData.waitingForAdminAmount && adminData.targetUserId && text) {
            const targetId = adminData.targetUserId;
            const targetUser = getUserDataById(targetId);
            const action = adminData.adminAction;
            const amount = parseInt(text.replace(/,/g, ''));

            if (isNaN(amount) || amount <= 0) {
                await safeSendMessage(chatId, '❌ یک عدد معتبر وارد کنید:');
                return;
            }

            if (action === 'ADD') {
                targetUser.wallet += amount;
                saveDatabase();
                await safeSendMessage(chatId, `${amount.toLocaleString()} تومان افزوده شد.`, adminPanelMarkup);
                await safeSendMessage(targetId, `مبلغ ${amount.toLocaleString()} تومان توسط مدیریت به حساب شما واریز شد.`);
            } else if (action === 'SUB') {
                targetUser.wallet = Math.max(0, targetUser.wallet - amount);
                saveDatabase();
                await safeSendMessage(chatId, `${amount.toLocaleString()} تومان کسر شد.`, adminPanelMarkup);
            }

            resetAdminFlags(adminData);
            saveDatabase();
            return;
        }
    }

    // ---------------- استارز ----------------
    if (userData.waitingForStarCount && text && text !== 'محاسبه با موجودی من 🔄') {
        const countInput = parseInt(text);
        if (isNaN(countInput) || countInput < 50 || countInput > 100000) {
            await safeSendMessage(chatId, '❌ تعداد استارز باید عددی بین ۵۰ تا ۱۰۰,۰۰۰ باشد:', backKeyboard);
            return;
        }

        userData.starCount = countInput;
        userData.waitingForStarCount = false;
        userData.currentShopState = 'star_recipient';
        saveDatabase();

        const selfName = escapeHTML(msg.from.first_name) || 'کاربر';
        const recipientKeyboard = {
            reply_markup: {
                keyboard: [[{ text: `برای خودم ( ${selfName} ) 🪪` }], [{ text: 'برگشت ↩️' }]],
                resize_keyboard: true
            }
        };
        const recipientMsg =
            `🔗 انتخاب اکانت دریافت‌‌کننده\n\n` +
            `✔️ اگر برای خودتان است، روی «برای خودم» کلیک کنید.\n` +
            `✔️ اگر برای شخص دیگری است، یوزرنیم او را بدون @ بفرستید.`;

        await safeSendPhoto(chatId, '1000002625.jpg', { caption: recipientMsg, reply_markup: recipientKeyboard.reply_markup });
        return;
    }

    if (userData.currentShopState === 'star_recipient' && text) {
        let usernameInput = text.trim();
        if (usernameInput.includes('برای خودم')) {
            usernameInput = msg.from.username || msg.from.id.toString();
        } else if (usernameInput.startsWith('@')) {
            usernameInput = usernameInput.substring(1);
        }
        userData.starRecipient = usernameInput;
        userData.currentShopState = 'star_invoice';
        saveDatabase();
        await showStarInvoice(chatId, userData);
        return;
    }

    // ---------------- TON ----------------
    if (userData.waitingForGramAmount && text) {
        if (text === 'محاسبه با موجودی من 🔄') {
            const liveGramData = await fetchGramData();
            userData.gramPricePerUnit = liveGramData.finalPrice;
            saveDatabase();
            const balanceGram = (userData.wallet / userData.gramPricePerUnit).toFixed(2);
            await safeSendMessage(chatId, `موجودی شما: ${userData.wallet.toLocaleString()} تومان\nمعادل ${balanceGram} TON.\nلطفاً تعداد تون را وارد کنید:`, backKeyboard);
            return;
        }

        const gramInput = parseFloat(text);
        if (isNaN(gramInput) || gramInput < 0.1) {
            await safeSendMessage(chatId, '❌ حداقل خرید ۰.۱ TON است.', backKeyboard);
            return;
        }
        userData.gramAmount = gramInput;
        userData.waitingForGramAmount = false;
        clearDiscount(userData);

        if (userData.tonOrderMode === 'account') {
            userData.gramWalletAddress = msg.from.username || msg.from.id.toString();
            userData.gramMemo = 'واریز به اکانت تلگرام';
            userData.currentShopState = 'gram_invoice';
            saveDatabase();
            await showGramInvoice(chatId, userData);
            return;
        }

        userData.waitingForGramWallet = true;
        saveDatabase();
        await safeSendMessage(chatId, `لطفاً آدرس ولت (Tonkeeper) خود را ارسال کنید:`, backKeyboard);
        return;
    }

    if (userData.waitingForGramWallet && text) {
        const walletInput = text.trim();
        if (!isValidTonAddress(walletInput)) {
            await safeSendMessage(chatId, '❌ آدرس ولت وارد شده معتبر نیست. لطفاً آدرس صحیح TON را ارسال کنید.', backKeyboard);
            return;
        }

        userData.gramWalletAddress = walletInput;
        userData.waitingForGramWallet = false;
        userData.waitingForGramMemoChoice = true;
        saveDatabase();

        await safeSendMessage(chatId, 'آیا برای واریز TON کامنت (ممو) دارید؟', {
            reply_markup: {
                keyboard: [[{ text: '💬 بله، کامنت دارم' }, { text: '❌ رد کردن' }], [{ text: 'برگشت ↩️' }]],
                resize_keyboard: true
            }
        });
        return;
    }

    if (userData.waitingForGramMemoChoice && text) {
        if (text === '❌ رد کردن') {
            userData.gramMemo = 'ندارد';
            userData.waitingForGramMemoChoice = false;
            userData.currentShopState = 'gram_invoice';
            saveDatabase();
            await showGramInvoice(chatId, userData);
            return;
        } else if (text === '💬 بله، کامنت دارم') {
            userData.waitingForGramMemoChoice = false;
            userData.waitingForGramMemoInput = true;
            saveDatabase();
            await safeSendMessage(chatId, 'لطفاً متن کامنت خود را وارد کنید:', backKeyboard);
            return;
        }
    }

    if (userData.waitingForGramMemoInput && text) {
        userData.gramMemo = text.trim();
        userData.waitingForGramMemoInput = false;
        userData.currentShopState = 'gram_invoice';
        saveDatabase();
        await showGramInvoice(chatId, userData);
        return;
    }

    if (text === '✅ تایید گرام' && userData.currentShopState === 'gram_invoice') {
        const total = await gramTotal(userData.gramAmount);
        userData.lastAmount = total;
        saveDatabase();

        if (userData.wallet < total) {
            const shortage = total - userData.wallet;
            userData.pendingOrderToAutoPlace = {
                type: 'gram',
                gramAmount: userData.gramAmount,
                gramWalletAddress: userData.gramWalletAddress,
                gramMemo: userData.gramMemo,
                tonOrderMode: userData.tonOrderMode
            };
            saveDatabase();
            await safeSendMessage(chatId,
                `❌ موجودی حساب شما کافی نیست!\n\n💳 مبلغ کسری: ${shortage.toLocaleString()} تومان\n\nبا کلیک بر روی دکمه زیر می‌توانید مبلغ کسری را شارژ کنید تا پس از تأیید مدیریت، سفارش شما به صورت خودکار ثبت شود:`,
                { reply_markup: { inline_keyboard: [[{ text: `➕ افزایش موجودی (${shortage.toLocaleString()} تومان)`, callback_data: `add_balance_${shortage}` }]] } });
            return;
        }

        userData.wallet -= total;
        const trackingCode = 'TON-' + Math.floor(10000 + Math.random() * 90000);
        const order = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: `ارز تون (${userData.gramAmount} TON)`,
            count: userData.gramAmount,
            recipient: userData.gramWalletAddress,
            comment: userData.gramMemo,
            amount: total,
            time: getFormattedTime(),
            status: 'pending',
            tonMode: userData.tonOrderMode
        };
        db.orders[trackingCode] = order;
        userData.lastInvoiceMessageId = null;
        userData.pendingOrderToAutoPlace = null;
        userData.currentShopState = null;
        saveDatabase();

        await deliverTonOrder(order, trackingCode);
        return;
    }

    // ---------------- استارز: تأیید ----------------
    if (text === 'تأیید ✅' && userData.currentShopState === 'star_invoice') {
        if (!(await revalidateAppliedDiscount(chatId, userData, showStarInvoice))) return;
        userData.lastAmount = (await calcStar(userData)).final;
        saveDatabase();
        if (userData.wallet < userData.lastAmount) {
            const shortage = userData.lastAmount - userData.wallet;
            userData.pendingOrderToAutoPlace = { type: 'star', starCount: userData.starCount, starRecipient: userData.starRecipient };
            saveDatabase();
            await safeSendMessage(chatId,
                `❌ موجودی حساب شما کافی نیست!\n\n💳 مبلغ کسری: ${shortage.toLocaleString()} تومان`,
                { reply_markup: { inline_keyboard: [[{ text: `➕ افزایش موجودی (${shortage.toLocaleString()} تومان)`, callback_data: `add_balance_${shortage}` }]] } });
            return;
        }

        userData.wallet -= userData.lastAmount;
        const trackingCode = 'STR-' + Math.floor(10000 + Math.random() * 90000);
        const now = getFormattedTime();

        db.orders[trackingCode] = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: `استارز تلگرام (${userData.starCount} عدد)`,
            count: userData.starCount,
            recipient: userData.starRecipient,
            comment: 'ندارد',
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        userData.lastInvoiceMessageId = null;
        userData.pendingOrderToAutoPlace = null;
        saveDatabase();
        consumeDiscount(userData);

        await safeSendMessage(chatId,
            `سفارش ثبت شد و مبلغ از حساب شما کسر گردید.\n\nکد پیگیری: <code>${trackingCode}</code>\nمقدار: ${userData.starCount} استارز\nمبلغ: ${db.orders[trackingCode].amount.toLocaleString()} تومان`,
            mainKeyboard);

        await notifyAdmins(
            `<b>[ سفارش جدید استارز ]</b>\n\n` +
            `👤 نام کاربر: ${escapeHTML(userData.firstName)}\n` +
            `🆔 آیدی عددی: <code>${chatId}</code>\n` +
            `🏷️ کد پیگیری: <code>${trackingCode}</code>\n` +
            `💫 تعداد استارز: ${userData.starCount}\n` +
            `📥 دریافت‌کننده: @${escapeHTML(userData.starRecipient)}\n` +
            `💰 مبلغ کل: ${db.orders[trackingCode].amount.toLocaleString()} تومان\n` +
            `⏰ زمان ثبت: ${now}`,
            { reply_markup: { inline_keyboard: [[
                { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
            ]] } });
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    if (text === '✅ تایید' && userData.currentShopState === 'gift_invoice') {
        if (!(await revalidateAppliedDiscount(chatId, userData, showGiftInvoice))) return;
        userData.lastAmount = (await calcGift(userData)).final;
        saveDatabase();
        if (userData.wallet < userData.lastAmount) {
            const shortage = userData.lastAmount - userData.wallet;
            userData.pendingOrderToAutoPlace = {
                type: 'gift',
                selectedGiftName: userData.selectedGiftName,
                selectedGiftStars: userData.selectedGiftStars,
                recipientUsername: userData.recipientUsername,
                commentText: userData.commentText
            };
            saveDatabase();
            await safeSendMessage(chatId,
                `❌ موجودی حساب شما کافی نیست!\n\n💳 مبلغ کسری: ${shortage.toLocaleString()} تومان`,
                { reply_markup: { inline_keyboard: [[{ text: `➕ افزایش موجودی (${shortage.toLocaleString()} تومان)`, callback_data: `add_balance_${shortage}` }]] } });
            return;
        }

        userData.wallet -= userData.lastAmount;
        const trackingCode = 'STZ-' + Math.floor(10000 + Math.random() * 90000);
        const now = getFormattedTime();

        db.orders[trackingCode] = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: userData.selectedGiftName,
            count: 1,
            recipient: userData.recipientUsername,
            comment: userData.commentText,
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        userData.lastInvoiceMessageId = null;
        userData.pendingOrderToAutoPlace = null;
        saveDatabase();
        consumeDiscount(userData);

        await safeSendMessage(chatId,
            `سفارش گیفت ثبت شد و مبلغ کسر گردید.\n\nکد پیگیری: <code>${trackingCode}</code>\nمبلغ: ${db.orders[trackingCode].amount.toLocaleString()} تومان`,
            mainKeyboard);

        await notifyAdmins(
            `<b>[ سفارش جدید گیفت استارزی ]</b>\n\n` +
            `👤 نام کاربر: ${escapeHTML(userData.firstName)}\n` +
            `🆔 آیدی عددی: <code>${chatId}</code>\n` +
            `🏷️ کد پیگیری: <code>${trackingCode}</code>\n` +
            `🎁 نام گیفت: ${escapeHTML(userData.selectedGiftName)} (${userData.selectedGiftStars} استارز)\n` +
            `📥 دریافت‌کننده: @${escapeHTML(userData.recipientUsername)}\n` +
            `💬 کامنت: ${escapeHTML(userData.commentText)}\n` +
            `💰 مبلغ کل: ${db.orders[trackingCode].amount.toLocaleString()} تومان\n` +
            `⏰ زمان ثبت: ${now}`,
            { reply_markup: { inline_keyboard: [[
                { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
            ]] } });
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    // ---------------- رسید ----------------
    if (photo && userData.waitingForReceipt) {
        const photoId = photo[photo.length - 1].file_id;
        userData.waitingForReceipt = false;

        const amount = userData.lastAmount;
        const receiptCode = 'RCP-' + Math.floor(1000 + Math.random() * 9000);

        userData.lastReceiptPhotoId = photoId;
        userData.lastReceiptCode = receiptCode;
        userData.lastReceiptAmount = amount;
        userData.lastReceiptTime = getFormattedTime();
        saveDatabase();

        const uname = msg.from.username ? '@' + escapeHTML(msg.from.username) : 'ندارد';
        const adminCaption =
            `<b>[ رسید پرداخت جدید ]</b>\n\n` +
            `👤 نام کاربر: ${escapeHTML(userData.firstName)}\n` +
            `🔗 یوزرنیم: ${uname}\n` +
            `🆔 آیدی عددی: <code>${chatId}</code>\n` +
            `📱 شماره: ${escapeHTML(userData.phone)}\n` +
            `💼 موجودی فعلی: ${userData.wallet.toLocaleString()} تومان\n` +
            `🏷 شماره رسید: <code>${receiptCode}</code>\n` +
            `💰 مبلغ: ${amount.toLocaleString()} تومان\n` +
            `⏰ زمان: ${userData.lastReceiptTime}`;

        const adminMarkup = {
            inline_keyboard: [
                [
                    { text: '✅ تایید', callback_data: `approve_receipt_${chatId}_${amount}_${receiptCode}` },
                    { text: '❌ رد', callback_data: `reject_receipt_${chatId}_${receiptCode}` }
                ],
                [{ text: '💬 پاسخ به کاربر', callback_data: `reply_${chatId}` }]
            ]
        };

        await notifyAdminsPhoto(photoId, { caption: adminCaption, parse_mode: 'HTML', reply_markup: adminMarkup });

        await safeSendMessage(chatId,
            `✅ <b>رسید شما دریافت شد</b>\n\n` +
            `🏷️ شماره رسید: <code>${receiptCode}</code>\n` +
            `💰 مبلغ: ${amount.toLocaleString()} تومان\n\n` +
            `⏳ لطفاً منتظر تایید رسید توسط مدیریت باشید.`,
            { reply_markup: { inline_keyboard: [[{ text: '💬 پیگیری رسید', callback_data: 'track_receipt_main' }]] } });
        return;
    }

    if (contact) {
        let phoneNum = contact.phone_number;
        if (!phoneNum.startsWith('+')) phoneNum = '+' + phoneNum;
        if (phoneNum.startsWith('+98')) {
            userData.phone = phoneNum;
            userData.verified = 'انجام شده';
            saveDatabase();
            await safeSendMessage(chatId, `شماره موبایل شما تایید شد!`, mainKeyboard);
        }
        return;
    }

    if (userData.waitingForTicket && text) {
        userData.waitingForTicket = false;
        saveDatabase();
        await safeSendMessage(chatId, 'تیکت شما ارسال شد.', backKeyboard);
        await notifyAdmins(
            `تیکت جدید:\nنام: ${escapeHTML(userData.firstName)}\nآیدی: <code>${chatId}</code>\nمتن:\n${escapeHTML(text)}`,
            { reply_markup: { inline_keyboard: [[{ text: '💬 پاسخ به کاربر', callback_data: `reply_${chatId}` }]] } });
        return;
    }

    if (userData.waitingForTrackingInput && text) {
        userData.waitingForTrackingInput = false;
        saveDatabase();
        const trackingCode = text.trim();
        const order = db.orders[trackingCode];

        if (!order || String(order.userId) !== String(chatId)) {
            await safeSendMessage(chatId, 'سفارشی با این کد پیگیری یافت نشد.', backKeyboard);
            return;
        }

        let statusStr = 'در حال بررسی توسط مدیریت';
        if (order.status === 'completed') statusStr = 'انجام شده و تکمیل شده';
        if (order.status === 'rejected') statusStr = 'رد شده توسط مدیریت';
        if (order.status === 'manual_pending') statusStr = 'در انتظار انتقال دستی توسط ادمین';

        let trackResultMsg = `<b>[ نتیجه پیگیری سفارش ]</b>\n\nکد: <code>${escapeHTML(trackingCode)}</code>\nمحصول: ${escapeHTML(order.giftName)}\nمبلغ: ${order.amount.toLocaleString()} تومان\nوضعیت: ${statusStr}`;
        if (order.txLink) {
            trackResultMsg += `\n\n🔗 <a href="${order.txLink}">مشاهده لینک تراکنش (Tonviewer)</a>`;
        }
        await safeSendMessage(chatId, trackResultMsg, backKeyboard);
        return;
    }

    if (userData.waitingForComment && text) {
        userData.waitingForComment = false;
        userData.commentText = text.trim();
        saveDatabase();
        await showGiftInvoice(chatId, userData);
        return;
    }

    if (userData.waitingForSmartSupport && text) {
        if (text === '🔙 بازگشت به منوی اصلی' || text === 'برگشت ↩️') {
            userData.waitingForSmartSupport = false;
            saveDatabase();
            await safeSendMessage(chatId, 'به منوی اصلی برگشتید.', mainKeyboard);
            return;
        }

        const userQ = text.toLowerCase();
        let aiReply = 'سلام! من پشتیبانی هوشمند نوا شاپ هستم. سوال یا مشکل خود را دقیق بفرمایید تا راهنمایی‌تان کنم.';
        if (userQ.includes('استارز') || userQ.includes('star')) {
            aiReply = '⭐ برای خرید استارز، از منوی اصلی به بخش «خرید محصول» و سپس «استارز» بروید.';
        } else if (userQ.includes('گرام') || userQ.includes('gram') || userQ.includes('تون')) {
            aiReply = '💠 برای خرید ارز تون (TON)، به بخش محصولات رفته، روش دریافت را انتخاب کرده، مقدار را وارد کنید تا فاکتور صادر شود.';
        } else if (userQ.includes('گیفت') || userQ.includes('gift')) {
            aiReply = '🎁 گیفت‌های استارزی را از بخش «گیفت استارزی» انتخاب و سفارش دهید.';
        } else if (userQ.includes('رسید') || userQ.includes('واریز') || userQ.includes('افزایش موجودی')) {
            aiReply = '💳 برای افزایش موجودی، از «➕ افزایش موجودی» استفاده کنید، مبلغ را واریز و عکس رسید را ارسال کنید.';
        } else if (userQ.includes('پیگیری') || userQ.includes('سفارش')) {
            aiReply = '📦 برای پیگیری سفارش، از «📦 پیگیری سفارش» کد پیگیری خود را ارسال کنید.';
        }

        await safeSendMessage(chatId, `🤖 <b>پشتیبانی هوشمند نوا شاپ:</b>\n\n${aiReply}`, {
            reply_markup: { keyboard: [[{ text: '🔙 بازگشت به منوی اصلی' }]], resize_keyboard: true }
        });
        return;
    }

    if (userData.waitingForDiscountInput && text) {
        userData.waitingForDiscountInput = false;
        saveDatabase();

        const state = userData.currentShopState;
        const showFn = getInvoiceShowerForState(state);
        const invoiceKb = getInvoiceKeyboardForState(state) || backKeyboard;

        if (!showFn) {
            await safeSendMessage(chatId, 'ابتدا یک محصول انتخاب کنید و به مرحله فاکتور برسید.', mainKeyboard);
            return;
        }

        const codeInput = text.trim().toUpperCase();
        const result = validateDiscount(codeInput, userData);
        if (!result.ok) {
            await safeSendMessage(chatId, `❌ ${result.error}`, invoiceKb);
            return;
        }

        userData.appliedDiscountCode = codeInput;
        userData.appliedDiscountPercent = result.obj.percent;
        saveDatabase();

        await showFn(chatId, userData, true);
        await safeSendMessage(chatId, `✅ کد تخفیف ${result.obj.percent}% با موفقیت روی فاکتور شما اعمال شد.`, invoiceKb);
        return;
    }

    if (text === 'محاسبه با موجودی من 🔄' && userData.currentShopState === 'star_menu') {
        const maxStars = Math.floor(userData.wallet / (userData.starPricePerUnit || await fetchStarsPrice()));
        await safeSendMessage(chatId, `موجودی شما: ${userData.wallet.toLocaleString()} تومان\nحداکثر ${maxStars} استارز می‌توانید بخرید.`, backKeyboard);
        return;
    }

    if (text === 'اعمال تخفیف 🎁' && userData.currentShopState === 'star_invoice') {
        const availableDiscountWallet = userData.discountWallet || 1766;
        if (availableDiscountWallet <= 0) {
            await safeSendMessage(chatId, 'موجودی کیف پول تخفیف کافی نیست.', backKeyboard);
        } else {
            await safeSendMessage(chatId, `تخفیف به مبلغ ${availableDiscountWallet.toLocaleString()} تومان اعمال شد.`);
        }
        return;
    }

    if (text === 'اعمال کد تخفیف 🎫' && userData.currentShopState === 'star_invoice') {
        userData.waitingForDiscountInput = true;
        saveDatabase();
        await safeSendMessage(chatId, 'لطفاً کد تخفیف خود را ارسال کنید:', backKeyboard);
        return;
    }

    if (isAdmin && isBtn(text, BTN.ACTIVITY)) {
        let actMsg = `<b>📊 بخش فعالیت‌های پنل مدیریت</b>\n\n<b>✔️ رسیدهای تایید شده:</b>\n`;
        if (db.approvedReceiptsHistory && db.approvedReceiptsHistory.length > 0) {
            db.approvedReceiptsHistory.slice(-10).forEach((rec, idx) => {
                actMsg += `${idx + 1}. کاربر: <code>${rec.userId}</code> | مبلغ: ${Number(rec.amount).toLocaleString()} تومان | رسید: ${rec.receiptCode} | تاریخ: ${rec.time}\n`;
            });
        } else {
            actMsg += `هنوز رسیدی تایید نشده است.\n`;
        }

        actMsg += `\n<b>🛍 تفکیک فاکتورها و سفارشات:</b>\n`;
        const ordersList = Object.entries(db.orders);
        if (ordersList.length > 0) {
            ordersList.slice(-10).forEach(([code, ord], idx) => {
                actMsg += `${idx + 1}. کد: <code>${code}</code> | محصول: ${escapeHTML(ord.giftName)} | مبلغ: ${ord.amount.toLocaleString()} تومان | وضعیت: ${ord.status}\n`;
            });
        } else {
            actMsg += `سفارشی ثبت نشده است.\n`;
        }
        await safeSendMessage(chatId, actMsg, adminPanelMarkup);
        return;
    }

    if (isAdmin && isBtn(text, BTN.LIST_DISCOUNT)) {
        let codesMsg = `<b>🏷️ لیست کدهای تخفیف سیستم:</b>\n\n`;
        const codes = Object.entries(db.discountCodes);
        if (codes.length === 0) {
            codesMsg += `هیچ کد تخفیفی ساخته نشده است.`;
        } else {
            codes.forEach(([cName, cObj], idx) => {
                const status = isDiscountFinished(cObj) ? '🔴 تمام شده' : '🟢 فعال';
                codesMsg += `${idx + 1}. کد: <code>${cName}</code> ${status}\n   درصد: ${cObj.percent}%\n   ظرفیت: ${cObj.capacity} | استفاده شده: ${cObj.usedCount}\n   محدودیت: ${cObj.restriction || 'ندارد'}\n\n`;
            });
        }
        await safeSendMessage(chatId, codesMsg, adminPanelMarkup);
        return;
    }

    if (isAdmin && isBtn(text, BTN.TON)) {
        adminData.waitingForManualPrice = true;
        saveDatabase();
        const currentPriceText = db.manualTonPrice > 0
            ? `<b>${db.manualTonPrice.toLocaleString()} تومان (دستی)</b>`
            : `<b>خودکار</b>`;
        await safeSendMessage(chatId, `<b>[ تنظیم قیمت دستی تون ]</b>\n\nوضعیت فعلی: ${currentPriceText}\n\nلطفاً قیمت پایه جدید را به تومان وارد کنید (0 برای حالت آنلاین):`, backKeyboard);
        return;
    }

    if (isAdmin && isBtn(text, BTN.STAR)) {
        adminData.waitingForManualStarPrice = true;
        saveDatabase();
        const currentPriceText = db.manualStarPrice > 0
            ? `<b>${db.manualStarPrice.toLocaleString()} تومان (دستی)</b>`
            : `<b>خودکار</b>`;
        await safeSendMessage(chatId, `<b>[ تنظیم قیمت دستی استارز ]</b>\n\nوضعیت فعلی: ${currentPriceText}\n\nلطفاً قیمت هر واحد استارز را وارد کنید (0 برای حالت خودکار):`, backKeyboard);
        return;
    }

    if (isAdmin && isBtn(text, BTN.GIFT)) {
        adminData.waitingForManualGiftBasePrice = true;
        saveDatabase();
        const currentBasePriceText = db.manualGiftBasePrice > 0
            ? `<b>${db.manualGiftBasePrice.toLocaleString()} تومان (15 استارز)</b>`
            : `<b>محاسبه خودکار</b>`;
        await safeSendMessage(chatId, `<b>[ تنظیم قیمت دستی گیفت‌های استارزی ]</b>\n\nوضعیت فعلی: ${currentBasePriceText}\n\nقیمت گیفت 15 استارزی را وارد کنید (0 برای حالت خودکار):`, backKeyboard);
        return;
    }

    if (isAdmin && text) {
        const actionMap = [
            ['ADD', BTN.ADD], ['SUB', BTN.SUB], ['BAN', BTN.BAN],
            ['UNBAN', BTN.UNBAN], ['SECOND', BTN.SECOND]
        ];
        const found = actionMap.find(([, label]) => isBtn(text, label));
        if (found) {
            adminData.adminAction = found[0];
            adminData.waitingForAdminUserSearch = true;
            saveDatabase();
            await safeSendMessage(chatId, `آیدی عددی کاربر مورد نظر را وارد کنید:`, backKeyboard);
            return;
        }
    }

    if (isAdmin && text && (isBtn(text, BTN.CREATE_DISCOUNT) || norm(text).includes('ساخت کد تخفیف'))) {
        adminData.tempDiscount = { percent: 0, capacity: 0, expiryHour: 0, restriction: null };
        adminData.waitingForDiscountPercent = true;
        saveDatabase();
        await safeSendMessage(chatId, 'درصد تخفیف (عدد بین 1 تا 100):', backKeyboard);
        return;
    }

    if (text === '🛒 خرید محصول') {
        userData.currentShopState = 'main_shop';
        saveDatabase();
        const shopMsg =
            `🛒 **وقتشه محصولت رو انتخاب کنی !**\n\n` +
            `🚀 تمامی سفارشات با بالاترین سرعت و همراه با پشتیبانی کامل انجام می‌شن تا تجربه‌ای مطمئن و بی‌دغدغه داشته باشی !\n\n` +
            `🫶 **از لیست زیر ، گزینه مورد نظرت رو انتخاب کن :**`;
        await safeSendMessage(chatId, shopMsg, getShopKeyboard());
    }
    else if (text === 'خرید ارز تون 💎' || isBtn(text, 'خرید ارز تون 💎')) {
        clearDiscount(userData);
        userData.currentShopState = 'ton_select_mode';
        saveDatabase();

        const tonMsg =
            `🚀 **خرید ارز تون ( GRAM )**\n\n` +
            `💎 با خرید TON از استارزیفای ، پرداخت سرویس‌های تلگرام را بدون دردسر انجام دهید.\n\n` +
            `• لطفاً یکی از 2 روش خرید زیر را انتخاب کنید :\n\n` +
            `💎 **واریز به ولت شخصی**\n` +
            `ارسال مستقیم ارز TON به کیف پول ( ولت ) شخصی شما (مانند Tonkeeper)\n\n` +
            `🌐 **شارژ مستقیم اکانت تلگرام**\n` +
            `واریز مستقیم ارز TON به موجودی حساب ( اکانت ) تلگرام شما\n\n` +
            `⚡ **برای ادامه خرید ، روش دریافت TON را انتخاب کنید :**`;

        await safeSendMessage(chatId, tonMsg, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💎 واریز به ولت شخصی', callback_data: 'ton_mode_wallet' }],
                    [{ text: '⚡ شارژ مستقیم اکانت تلگرام', callback_data: 'ton_mode_account' }]
                ]
            }
        });
    }
    else if (text === 'شارژ تون بالانس ⚡' || isBtn(text, 'شارژ تون بالانس ⚡')) {
        clearDiscount(userData);
        userData.currentShopState = 'gram_wallet_flow';
        userData.tonOrderMode = 'account';
        saveDatabase();

        const freshData = await fetchGramData();
        const balanceMsg =
            `⚡ **شارژ تون بالانس**\n\n` +
            `🔴 با شارژ تون بالانس ، می‌توانید موجودی تون اکانت خود را افزایش دهید.\n\n` +
            `📊 **قیمت هر تون:** ${freshData.finalPrice.toLocaleString()} تومان\n` +
            `📊 **حداقل خرید:** 1 تون\n\n` +
            `🎶 **لطفاً تعداد تون مورد نظر خود را وارد کنید :**`;

        userData.waitingForGramAmount = true;
        saveDatabase();
        await safeSendMessage(chatId, balanceMsg, {
            reply_markup: { keyboard: [[{ text: 'محاسبه با موجودی من 🔄' }], [{ text: 'برگشت ↩️' }]], resize_keyboard: true }
        });
    }
    else if (text === 'استارز ⭐️' || text === '⭐️ استارز' || isBtn(text, 'استارز ⭐️')) {
        clearDiscount(userData);
        userData.currentShopState = 'star_menu';
        userData.waitingForStarCount = true;
        userData.starPricePerUnit = await fetchStarsPrice();
        saveDatabase();

        const starMsg =
            `💥 وقت درخشیدن با استارز تلگرامه !\n\n` +
            `🎯 کاربردهای استارز :\n` +
            `✨ فعال‌سازی ری‌‌اکشن‌ها\n` +
            `🎯 خرید اکانت پرمیوم\n\n` +
            `🪐 لطفاً تعداد استارز مورد نظر خود را ارسال کنید:`;

        await safeSendPhoto(chatId, '1000002624.jpg', {
            caption: starMsg,
            reply_markup: { keyboard: [[{ text: 'محاسبه با موجودی من 🔄' }], [{ text: 'برگشت ↩️' }]], resize_keyboard: true }
        });
    }
    else if (text === 'گیفت استارزی 🎁' || text === '🎁 گیفت استارزی') {
        userData.currentShopState = 'gift_category';
        saveDatabase();
        await safeSendMessage(chatId,
            `🎁 هدیه دادن گیفت ، تجربه‌ای خاص در تلگرام!\n\nلطفاً دسته‌بندی گیفت مورد نظر خود را انتخاب کنید :`,
            { reply_markup: { keyboard: [[{ text: '🧸 گیفت های عادی' }], [{ text: 'برگشت ↩️' }]], resize_keyboard: true } });
    }
    else if (text === '🧸 گیفت های عادی') {
        clearDiscount(userData);
        userData.currentShopState = 'gift_list';
        saveDatabase();
        await safeSendMessage(chatId, `🎁 گیفت های عادی\n\n💫 لطفاً گیفت مورد نظر خود را انتخاب کنید :`, {
            reply_markup: {
                keyboard: [
                    [{ text: '💖 گیفت قلب ( 15 )' }, { text: '🧸 گیفت تدی ( 15 )' }],
                    [{ text: '🎁 گیفت کادو ( 25 )' }, { text: '🌹 گیفت گل رز ( 25 )' }],
                    [{ text: '🎂 گیفت کیک ( 50 )' }, { text: '🌷 گیفت گل ( 50 )' }],
                    [{ text: '🍾 گیفت بطری ( 50 )' }, { text: '🚀 گیفت سفینه ( 50 )' }],
                    [{ text: '🏆 گیفت جام ( 100 )' }, { text: '💍 گیفت حلقه ( 100 )' }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        });
    }
    else if (userData.currentShopState === 'gift_list' && text && text.includes('گیفت')) {
        userData.selectedGiftName = text;
        if (text.includes('15')) userData.selectedGiftStars = 15;
        else if (text.includes('25')) userData.selectedGiftStars = 25;
        else if (text.includes('50')) userData.selectedGiftStars = 50;
        else if (text.includes('100')) userData.selectedGiftStars = 100;
        else userData.selectedGiftStars = 15;

        userData.currentShopState = 'gift_recipient';
        saveDatabase();

        const selfName = escapeHTML(msg.from.first_name) || 'کاربر';
        await safeSendMessage(chatId, `انتخاب اکانت دریافت‌کننده گیفت`, {
            reply_markup: { keyboard: [[{ text: `برای خودم ( ${selfName} ) 🪪` }], [{ text: 'برگشت ↩️' }]], resize_keyboard: true }
        });
    }
    else if (userData.currentShopState === 'gift_recipient' && text) {
        let usernameInput = text.trim();
        if (usernameInput.includes('برای خودم')) {
            usernameInput = msg.from.username || msg.from.id.toString();
        } else if (usernameInput.startsWith('@')) {
            usernameInput = usernameInput.substring(1);
        }
        userData.recipientUsername = usernameInput;
        userData.currentShopState = 'gift_invoice';
        saveDatabase();
        await showGiftInvoice(chatId, userData);
    }
    else if (text === '💳 اعمال کد تخفیف' && userData.currentShopState === 'gift_invoice') {
        userData.waitingForDiscountInput = true;
        saveDatabase();
        await safeSendMessage(chatId, 'کد تخفیف خود را ارسال کنید:', backKeyboard);
    }
    else if (text === '💬 تنظیم کامنت') {
        userData.waitingForComment = true;
        saveDatabase();
        await safeSendMessage(chatId, 'کامنت دلخواه خود را بفرستید:', backKeyboard);
    }
    else if (text === '❤️ چطوری میتوانم به شما اعتماد کنم' || isBtn(text, '❤️ چطوری میتوانم به شما اعتماد کنم')) {
        await safeSendMessage(chatId, `نوا شاپ با رضایت هزاران مشتری فعال در خدمت شماست.\n\nکانال اعتماد:\n@nova1_shopp`, backKeyboard);
    }
    else if (text === '📦 پیگیری سفارش') {
        userData.waitingForTrackingInput = true;
        saveDatabase();
        await safeSendMessage(chatId, `کد پیگیری سفارش خود را ارسال کنید:`, backKeyboard);
    }
    else if (text === '💳 حساب کاربری') {
        await safeSendMessage(chatId,
            `<b>حساب کاربری شما</b>\n\nنام: ${escapeHTML(userData.firstName)}\nآیدی: <code>${chatId}</code>\nموجودی اصلی: ${userData.wallet.toLocaleString()} تومان`,
            accountKeyboard);
    }
    else if (text === '➕ افزایش موجودی') {
        await safeSendMessage(chatId, `افزایش موجودی حساب...`, {
            reply_markup: { keyboard: [[{ text: '💳 پرداخت ریالی' }], [{ text: '🔙 بازگشت به منوی اصلی' }]], resize_keyboard: true }
        });
    }
    else if (text === '💳 پرداخت ریالی') {
        userData.waitingForAmount = true;
        saveDatabase();
        await safeSendMessage(chatId, `مبلغی که می‌‌خواهید حساب را شارژ کنید وارد نمایید (تومان - فقط عدد):`, backKeyboard);
    }
    else if (userData.waitingForAmount && text && /^\d+$/.test(text)) {
        const enteredAmount = parseInt(text);
        userData.waitingForAmount = false;
        userData.lastAmount = enteredAmount;
        userData.waitingForReceipt = true;
        saveDatabase();

        const rialAmount = enteredAmount * 10;
        await safeSendMessage(chatId,
            `💳 <b>افزایش موجودی</b>\n\n` +
            `مبلغ انتخابی: ${enteredAmount.toLocaleString()} تومان\n` +
            `مبلغ قابل واریز: <b>${rialAmount.toLocaleString()} ریال</b>\n\n` +
            `شماره کارت:\n<code>${CARD_NUMBER}</code>\n` +
            `به نام: ${CARD_OWNER}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 کپی شماره کارت', copy_text: { text: CARD_NUMBER } }],
                        [{ text: '📋 کپی دقیق مبلغ (ریال)', copy_text: { text: String(rialAmount) } }]
                    ]
                }
            });
        await safeSendMessage(chatId, '📸 پس از واریز، عکس رسید را همین‌جا ارسال کنید.', backKeyboard);
    }
    else if (text === '📞 پشتیبانی') {
        await safeSendMessage(chatId, `بخش پشتیبانی:`, {
            reply_markup: {
                keyboard: [
                    [{ text: '👤 پشتیبانی مستقیم' }, { text: '🤖 پشتیبانی هوشمند' }],
                    [{ text: '🎫 ارسال تیکت (غیرمستقیم)' }],
                    [{ text: '🔙 بازگشت به منوی اصلی' }]
                ],
                resize_keyboard: true
            }
        });
    }
    else if (text === '👤 پشتیبانی مستقیم') {
        await safeSendMessage(chatId, `ارتباط با ادمین:\n${ADMIN_ID_USERNAME}`, backKeyboard);
    }
    else if (text === '🤖 پشتیبانی هوشمند') {
        userData.waitingForSmartSupport = true;
        saveDatabase();
        await safeSendMessage(chatId, `🤖 سلام! من پشتیبانی هوشمند نوا شاپ هستم.\nلطفاً سوال خود را بپرسید:`, backKeyboard);
    }
    else if (text === '🎫 ارسال تیکت (غیرمستقیم)') {
        userData.waitingForTicket = true;
        saveDatabase();
        await safeSendMessage(chatId, `پیام خود را ارسال کنید:`, backKeyboard);
    }
    else if (text === '📦 سفارش های اخیر من' || text === 'سفارش های اخیر من 📥') {
        const userOrders = Object.entries(db.orders).filter(([, order]) => String(order.userId) === String(chatId));
        if (userOrders.length === 0) {
            await safeSendMessage(chatId, 'شما سفارشی ثبت نکرده‌اید.', backKeyboard);
        } else {
            let msgText = `<b>[ سفارش‌های اخیر شما ]</b>\n\n`;
            userOrders.slice(-5).forEach(([code, order], idx) => {
                msgText += `${idx + 1}. 📦 کد: <code>${escapeHTML(code)}</code>\n   محصول: ${escapeHTML(order.giftName)}\n   مبلغ: ${order.amount.toLocaleString()} تومان\n\n`;
            });
            await safeSendMessage(chatId, msgText, backKeyboard);
        }
    }
    else if (text === '📦 سفارش های معلق من') {
        const userOrders = Object.entries(db.orders).filter(([, order]) =>
            String(order.userId) === String(chatId) && (order.status === 'pending' || order.status === 'manual_pending'));
        if (userOrders.length === 0) {
            await safeSendMessage(chatId, 'سفارش معلقی ندارید.', backKeyboard);
        } else {
            let msgText = `<b>[ سفارش‌های معلق شما ]</b>\n\n`;
            userOrders.forEach(([code, order], idx) => {
                msgText += `${idx + 1}. 📦 کد: <code>${escapeHTML(code)}</code>\n   محصول: ${escapeHTML(order.giftName)}\n\n`;
            });
            await safeSendMessage(chatId, msgText, backKeyboard);
        }
    }
}

// ============================================================================
// INLINE CALLBACK QUERY HANDLER
// ============================================================================

bot.on('callback_query', async (callbackQuery) => {
    try {
        await handleCallback(callbackQuery);
    } catch (err) {
        SystemLogger.error('CallbackHandler', `Error while handling callback "${callbackQuery && callbackQuery.data}"`, err);
        await safeAnswer(callbackQuery.id, { text: '⚠️ خطایی رخ داد، دوباره تلاش کنید.', show_alert: true });
    }
});

async function handleCallback(callbackQuery) {
    const action = callbackQuery.data || '';
    const msg = callbackQuery.message;
    const fromId = callbackQuery.from.id;
    SystemLogger.info('Callback', `received from=${fromId} data=${action}`);

    if (!msg) {
        await safeAnswer(callbackQuery.id);
        return;
    }

    const chatId = msg.chat.id;
    const userData = getUserDataById(fromId);
    const isAdmin = isUserAdmin(fromId);

    if (action === 'ton_mode_wallet' || action === 'ton_mode_account') {
        userData.tonOrderMode = action === 'ton_mode_wallet' ? 'wallet' : 'account';
        userData.currentShopState = 'gram_wallet_flow';
        userData.waitingForGramAmount = true;
        saveDatabase();

        await safeAnswer(callbackQuery.id);
        await safeSendMessage(chatId, 'تعداد تون ( TON ) مورد نظر را وارد کنید:', getBackKeyboard());
        return;
    }

    if (action === 'check_join') {
        const isMember = await checkMembership(fromId);
        if (isMember) {
            await safeAnswer(callbackQuery.id);
            await safeDeleteMessage(chatId, msg.message_id);
            await safeSendMessage(chatId, '✅ عضویت شما تایید شد!', getMainKeyboard(isAdmin));
        } else {
            await safeAnswer(callbackQuery.id, { text: '❌ شما هنوز در کانال ربات عضو نشده‌اید!', show_alert: true });
        }
        return;
    }

    if (!isAdmin) {
        const isMember = await checkMembership(fromId);
        if (!isMember) {
            await safeAnswer(callbackQuery.id, { text: '❌ لطفاً ابتدا در کانال عضو شوید!', show_alert: true });
            return;
        }
    }

    if (action.startsWith('add_balance_')) {
        const shortage = parseInt(action.replace('add_balance_', ''));
        if (isNaN(shortage) || shortage <= 0) {
            await safeAnswer(callbackQuery.id, { text: 'خطا در محاسبه مبلغ.', show_alert: true });
            return;
        }
        userData.waitingForAmount = false;
        userData.lastAmount = shortage;
        userData.waitingForReceipt = true;
        saveDatabase();

        const rialAmount = shortage * 10;
        await safeAnswer(callbackQuery.id);
        await safeSendMessage(chatId,
            `💳 <b>افزایش موجودی تکمیلی</b>\n\n` +
            `مبلغ انتخابی: ${shortage.toLocaleString()} تومان\n` +
            `مبلغ قابل واریز: <b>${rialAmount.toLocaleString()} ریال</b>\n\n` +
            `شماره کارت:\n<code>${CARD_NUMBER}</code>\n` +
            `به نام: ${CARD_OWNER}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 کپی شماره کارت', copy_text: { text: CARD_NUMBER } }],
                        [{ text: '📋 کپی دقیق مبلغ (ریال)', copy_text: { text: String(rialAmount) } }]
                    ]
                }
            });
        await safeSendMessage(chatId, '📸 پس از واریز، عکس رسید را همین‌جا ارسال کنید.', getBackKeyboard());
        return;
    }

    if (action === 'track_receipt_main') {
        await safeAnswer(callbackQuery.id);
        if (userData.lastReceiptCode) {
            const status = db.processedReceipts[userData.lastReceiptCode] || 'pending';
            let statusFa = 'در حال بررسی توسط مدیریت ⏳';
            if (status === 'approved') statusFa = 'تایید شده ✅';
            if (status === 'rejected') statusFa = 'رد شده ❌';

            await safeSendMessage(chatId,
                `<b>[ وضعیت آخرین رسید شما ]</b>\n\n` +
                `🏷️ شماره رسید: <code>${userData.lastReceiptCode}</code>\n` +
                `💰 مبلغ: ${userData.lastReceiptAmount.toLocaleString()} تومان\n` +
                `⏰ زمان ارسال: ${userData.lastReceiptTime}\n` +
                `📊 وضعیت: ${statusFa}`);
        } else {
            await safeSendMessage(chatId, 'شما هیچ رسید فعال یا در حال بررسی ندارید.');
        }
        return;
    }

    // ---------------- عملیات مدیریت (تایید/رد رسید و سفارش) ----------------
    if (isAdmin) {
        if (action.startsWith('approve_receipt_')) {
            const parts = action.replace('approve_receipt_', '').split('_');
            const targetUserId = parts[0];
            const amount = parseInt(parts[1]);
            const receiptCode = parts[2];

            if (db.processedReceipts[receiptCode]) {
                await safeAnswer(callbackQuery.id, { text: 'این رسید قبلاً بررسی شده است.', show_alert: true });
                return;
            }

            db.processedReceipts[receiptCode] = 'approved';
            const targetUser = getUserDataById(targetUserId);
            targetUser.wallet += amount;

            db.approvedReceiptsHistory.push({
                userId: targetUserId,
                amount: amount,
                receiptCode: receiptCode,
                time: getFormattedTime()
            });
            saveDatabase();

            await safeAnswer(callbackQuery.id, { text: 'رسید تایید و موجودی افزوده شد.' });
            await editAdminMessage(msg, (msg.caption || msg.text || '') + `\n\n✅ <b>توسط مدیریت تایید شد.</b>`);
            await safeSendMessage(targetUserId, `✅ رسید شما به مبلغ ${amount.toLocaleString()} تومان تایید شد و موجودی شما شارژ گردید.`);

            if (targetUser.pendingOrderToAutoPlace) {
                const pending = targetUser.pendingOrderToAutoPlace;
                targetUser.pendingOrderToAutoPlace = null;
                saveDatabase();

                if (pending.type === 'gram') {
                    const total = await gramTotal(pending.gramAmount);
                    if (targetUser.wallet >= total) {
                        targetUser.wallet -= total;
                        const trackingCode = 'TON-' + Math.floor(10000 + Math.random() * 90000);
                        const order = {
                            userId: targetUserId,
                            firstName: targetUser.firstName,
                            giftName: `ارز تون (${pending.gramAmount} TON)`,
                            count: pending.gramAmount,
                            recipient: pending.gramWalletAddress,
                            comment: pending.gramMemo,
                            amount: total,
                            time: getFormattedTime(),
                            status: 'pending',
                            tonMode: pending.tonOrderMode
                        };
                        db.orders[trackingCode] = order;
                        saveDatabase();

                        await safeSendMessage(targetUserId, `⚡ موجودی شما کافی شد و سفارش TON شما به صورت خودکار ثبت گردید.`);
                        await deliverTonOrder(order, trackingCode);
                    }
                } else if (pending.type === 'star') {
                    const unitPrice = await fetchStarsPrice();
                    const total = Math.round(unitPrice * pending.starCount);
                    if (targetUser.wallet >= total) {
                        targetUser.wallet -= total;
                        const trackingCode = 'STR-' + Math.floor(10000 + Math.random() * 90000);
                        const now = getFormattedTime();
                        db.orders[trackingCode] = {
                            userId: targetUserId,
                            firstName: targetUser.firstName,
                            giftName: `استارز تلگرام (${pending.starCount} عدد)`,
                            count: pending.starCount,
                            recipient: pending.starRecipient,
                            comment: 'ندارد',
                            amount: total,
                            time: now,
                            status: 'pending'
                        };
                        saveDatabase();

                        await safeSendMessage(targetUserId, `⭐ موجودی شما کافی شد و سفارش استارز شما ثبت گردید.\nکد پیگیری: <code>${trackingCode}</code>`);
                        await notifyAdmins(
                            `<b>[ سفارش خودکار استارز ]</b>\n\n` +
                            `👤 کاربر: ${escapeHTML(targetUser.firstName)}\n` +
                            `🆔 آیدی: <code>${targetUserId}</code>\n` +
                            `🏷️ کد: <code>${trackingCode}</code>\n` +
                            `💫 تعداد: ${pending.starCount}\n` +
                            `📥 دریافت‌کننده: @${escapeHTML(pending.starRecipient)}\n` +
                            `💰 مبلغ: ${total.toLocaleString()} تومان`,
                            { reply_markup: { inline_keyboard: [[
                                { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                                { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                            ]] } });
                    }
                } else if (pending.type === 'gift') {
                    const usdtToman = await getUsdtTomanPrice();
                    const total = Math.round(pending.selectedGiftStars * STAR_USD * usdtToman * PRICE_MARGIN);
                    if (targetUser.wallet >= total) {
                        targetUser.wallet -= total;
                        const trackingCode = 'STZ-' + Math.floor(10000 + Math.random() * 90000);
                        const now = getFormattedTime();
                        db.orders[trackingCode] = {
                            userId: targetUserId,
                            firstName: targetUser.firstName,
                            giftName: pending.selectedGiftName,
                            count: 1,
                            recipient: pending.recipientUsername,
                            comment: pending.commentText,
                            amount: total,
                            time: now,
                            status: 'pending'
                        };
                        saveDatabase();

                        await safeSendMessage(targetUserId, `🎁 موجودی شما کافی شد و سفارش گیفت شما ثبت گردید.\nکد پیگیری: <code>${trackingCode}</code>`);
                        await notifyAdmins(
                            `<b>[ سفارش خودکار گیفت ]</b>\n\n` +
                            `👤 کاربر: ${escapeHTML(targetUser.firstName)}\n` +
                            `🆔 آیدی: <code>${targetUserId}</code>\n` +
                            `🏷️ کد: <code>${trackingCode}</code>\n` +
                            `🎁 نام: ${escapeHTML(pending.selectedGiftName)}\n` +
                            `📥 دریافت‌کننده: @${escapeHTML(pending.recipientUsername)}\n` +
                            `💰 مبلغ: ${total.toLocaleString()} تومان`,
                            { reply_markup: { inline_keyboard: [[
                                { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                                { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                            ]] } });
                    }
                }
            }
            return;
        }

        if (action.startsWith('reject_receipt_')) {
            const parts = action.replace('reject_receipt_', '').split('_');
            const targetUserId = parts[0];
            const receiptCode = parts[1];

            if (db.processedReceipts[receiptCode]) {
                await safeAnswer(callbackQuery.id, { text: 'این رسید قبلاً بررسی شده است.', show_alert: true });
                return;
            }

            const adminObj = getUserDataById(fromId);
            adminObj.waitingForReceiptRejectReason = true;
            adminObj.rejectTargetId = targetUserId;
            adminObj.rejectReceiptCode = receiptCode;
            saveDatabase();

            await safeAnswer(callbackQuery.id);
            await editAdminMessage(msg, (msg.caption || msg.text || '') + `\n\n❌ <b>توسط مدیریت رد شد. (در حال ارسال دلیل...)</b>`);
            await safeSendMessage(fromId, `لطفاً دلیل رد رسید <code>${receiptCode}</code> را ارسال کنید:`, getBackKeyboard());
            return;
        }

        if (action.startsWith('reply_')) {
            const targetUserId = action.replace('reply_', '');
            const adminObj = getUserDataById(fromId);
            adminObj.adminReplyingTo = targetUserId;
            saveDatabase();

            await safeAnswer(callbackQuery.id);
            await safeSendMessage(fromId, `لطفاً پاسخ خود را برای کاربر <code>${targetUserId}</code> ارسال کنید:`, getBackKeyboard());
            return;
        }

        if (action.startsWith('order_done_')) {
            const trackingCode = action.replace('order_done_', '');
            const order = db.orders[trackingCode];

            if (!order) {
                await safeAnswer(callbackQuery.id, { text: 'سفارش یافت نشد.', show_alert: true });
                return;
            }

            if (order.status === 'completed') {
                await safeAnswer(callbackQuery.id, { text: 'این سفارش قبلاً تکمیل شده است.', show_alert: true });
                return;
            }

            order.status = 'completed';
            order.paidAt = getFormattedTime();
            saveDatabase();

            await safeAnswer(callbackQuery.id, { text: 'سفارش به‌عنوان انجام‌شده علامت زده شد.' });
            await editAdminMessage(msg, (msg.text || msg.caption || '') + `\n\n✅ <b>تکمیل و ارسال شد.</b>`);
            await safeSendMessage(order.userId, `✅ سفارش شما با کد پیگیری <code>${trackingCode}</code> با موفقیت انجام شد.`);
            await sendChannelReport(order, order.txLink || null);
            return;
        }

            if (action.startsWith('order_reject_')) {
            const trackingCode = action.replace('order_reject_', '');
            const order = db.orders[trackingCode];

            if (!order) {
                await safeAnswer(callbackQuery.id, { text: 'سفارش یافت نشد.', show_alert: true });
                return;
            }

            if (order.status === 'rejected') {
                await safeAnswer(callbackQuery.id, { text: 'این سفارش قبلاً رد شده است.', show_alert: true });
                return;
            }

            const adminObj = getUserDataById(fromId);
            adminObj.waitingForOrderRejectReason = true;
            adminObj.rejectOrderCode = trackingCode;
            saveDatabase();

            await safeAnswer(callbackQuery.id);
            await editAdminMessage(msg, (msg.text || msg.caption || '') + `\n\n❌ <b>توسط مدیریت رد شد. (در حال ثبت دلیل...)</b>`);
            await safeSendMessage(fromId, `لطفاً دلیل رد سفارش <code>${trackingCode}</code> را ارسال کنید:`, getBackKeyboard());
            return;
        }
    }

    await safeAnswer(callbackQuery.id);
}
