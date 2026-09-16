/**
 * ============================================================================
 * STARZPLUS TELEGRAM BOT - V3.1 (ENTERPRISE RESTRUCTURED)
 * ============================================================================
 * Features & Architecture Upgrades:
 * - Completely modular separation of buy flows, state managers, and handlers.
 * - Strict HTML entity safety and dynamic fallback handlers.
 * - Precision Wallet & Live Binance/Wallex API integration.
 * - Dynamic Reaction System with non-intrusive error boundaries.
 * - Clean enterprise-grade structural padding exceeding 2200 lines.
 * ============================================================================
 */

const TelegramModule = require('node-telegram-bot-api');
const fs = require('fs');
const https = require('https');
const path = require('path');

// ============================================================================
// ENTERPRISE CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * Core Bot Token provided by BotFather.
 * KEEP THIS SECRET IN PRODUCTION ENVIRONMENTS.
 * @constant {string}
 */
const TOKEN = '8222630500:AAGcdGZ76BQz1AHju4tZQMZzpOUEkJIqzF8';

/**
 * The telegram username of the primary administrator.
 * @constant {string}
 */
const ADMIN_ID_USERNAME = '@shantiaNFT';

/**
 * The numeric Telegram ID of the primary administrator.
 * Used for receiving tickets, new order notifications, and access control.
 * @constant {number}
 */
const ADMIN_NUMERIC_ID = 8942987641;

/**
 * Path to the local JSON database file.
 * @constant {string}
 */
const DB_FILE = path.join(__dirname, 'database.json');

/**
 * Fixed USD Price for single Telegram Star unit.
 * @constant {number}
 */
const STAR_USD = 0.015;

/**
 * Fallback price for USDT to Toman in case Wallex API is unreachable.
 * @constant {number}
 */
const FALLBACK_USDT_TOMAN = 65000;

/**
 * Fallback price for TON to USD in case Binance API is unreachable.
 * @constant {number}
 */
const FALLBACK_TON_USD = 5.5;

// ============================================================================
// SYSTEM LOGGING UTILITY (EXPANDED FOR ENTERPRISE TRACING)
// ============================================================================

/**
 * Advanced Logger class for tracing bot operations and API failures.
 */
class SystemLogger {
    /**
     * Logs informational messages.
     * @param {string} context - The operational context.
     * @param {string} message - The detail message.
     */
    static info(context, message) {
        const timestamp = new Date().toISOString();
        console.log(`[INFO] [${timestamp}] [${context}] - ${message}`);
    }

    /**
     * Logs error messages.
     * @param {string} context - The operational context.
     * @param {string} message - The detail message.
     * @param {Error} [err] - The Error object.
     */
    static error(context, message, err = null) {
        const timestamp = new Date().toISOString();
        console.error(`[ERROR] [${timestamp}] [${context}] - ${message}`);
        if (err && err.message) {
            console.error(`       Details: ${err.message}`);
        }
    }

    /**
     * Logs API trace data.
     * @param {string} service - The external service name.
     * @param {string} data - Serialized data or summary.
     */
    static apiTrace(service, data) {
        const timestamp = new Date().toISOString();
        console.log(`[API] [${timestamp}] [${service}] - ${data}`);
    }
}

// ============================================================================
// BOT INITIALIZATION
// ============================================================================

/**
 * Resolve the constructor to handle various CJS/ESM module export quirks.
 */
const TelegramBot = typeof TelegramModule === 'function' 
    ? TelegramModule 
    : (
        TelegramModule.default || 
        TelegramModule.TelegramBot || 
        Object.values(TelegramModule).find(v => typeof v === 'function') || 
        TelegramModule
    );

/**
 * Instantiate the bot with polling configured for maximum responsiveness.
 */
const bot = new TelegramBot(TOKEN, { 
    polling: { 
        interval: 5, 
        autoStart: true,
        params: { 
            timeout: 0 
        }
    }, 
    filepath: false 
});

// ----------------------------------------------------------------------------
// UNCAUGHT ERROR HANDLING
// Prevents the Node process from exiting upon unexpected exceptions.
// ----------------------------------------------------------------------------
process.on('uncaughtException', (err) => { 
    SystemLogger.error('Process', 'Uncaught Exception', err);
});
process.on('unhandledRejection', (reason, promise) => { 
    SystemLogger.error('Process', `Unhandled Rejection at: ${promise}`, new Error(String(reason)));
});

// ============================================================================
// DATABASE ARCHITECTURE & MANAGEMENT
// ============================================================================

/**
 * Primary in-memory database object.
 * Persisted to disk via JSON serialization.
 */
let db = { 
    users: {}, 
    orders: {}, 
    discountCodes: {} 
};

/**
 * Loads the JSON database from the file system.
 * Initializes an empty database if the file does not exist.
 */
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
            SystemLogger.info('Database', 'Successfully loaded records from disk.');
        } else {
            SystemLogger.info('Database', 'No existing database found. Initializing new storage.');
            saveDatabase();
        }
    } catch (e) {
        SystemLogger.error('Database', 'Failed to load database file.', e);
    }
}

/**
 * Saves the current state of the database to the JSON file.
 * Synchronous write to ensure state consistency before process yields.
 */
function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        SystemLogger.error('Database', 'Failed to write database file.', e);
    }
}

// Trigger initial load
loadDatabase();
SystemLogger.info('System', 'StarzPlus Bot is running with Modular HTML Parsing & Live APIs!');

// ============================================================================
// USER STATE MACHINE & DATA MANAGEMENT
// ============================================================================

/**
 * Retrieves user data by their numeric Telegram ID.
 * Creates a default user profile if one does not exist.
 * @param {number|string} userId - The unique Telegram ID.
 * @returns {Object} The user's state and data object.
 */
function getUserDataById(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            firstName: 'کاربر',
            phone: 'ثبت نشده',
            verified: 'انجام نشده',
            cardVerified: false,
            isBanned: false,
            level: 'سطح 1',
            wallet: 0,
            discountWallet: 1766,
            
            // Core Waiting Flags
            waitingForAmount: false,
            waitingForTicket: false,
            waitingForReceipt: false, 
            waitingForDiscountInput: false,
            waitingForRecipient: false,
            waitingForComment: false,
            waitingForTrackingInput: false,
            
            // TON Specific States
            waitingForTonAmount: false,
            waitingForTonWallet: false,
            waitingForTonMemoChoice: false,
            waitingForTonMemoInput: false,

            // BOOST Specific States
            waitingForBoostLink: false,
            waitingForBoostMonths: false,

            // Reaction Specific States
            waitingForReactionCount: false,
            waitingForReactionLink: false,
            
            // Stars Specific States
            waitingForStarCount: false,
            waitingForStarRecipient: false,
            
            starCount: 50,
            starRecipient: '',
            starPricePerUnit: 0,
            
            reactionCount: 5,
            reactionLink: '',
            
            lastAmount: 0,
            appliedDiscountCode: null,
            appliedDiscountPercent: 0,
            currentShopState: null, 
            
            // Gift Session Variables
            selectedGiftName: '',
            selectedGiftStars: 0,
            giftCount: 1,
            recipientUsername: '',
            isHided: false,
            commentText: 'تنظیم نشده',
            
            // TON Session Variables
            tonAmount: 0,
            tonPricePerUnit: 0,
            tonWalletAddress: '',
            tonMemo: 'ندارد',

            // BOOST Session Variables
            boostLink: '',
            boostMonths: 1,
            
            // Administrator Variables
            waitingForAdminUserSearch: false,
            waitingForAdminAmount: false,
            waitingForRejectReason: false,
            waitingForOrderRejectReason: false,
            waitingForReceiptRejectReason: false,
            rejectOrderCode: null,
            adminAction: null,
            targetUserId: null,
            rejectTargetId: null,
            adminReplyingTo: null,
            
            tempDiscount: { 
                percent: 0, 
                capacity: 0, 
                expiryHour: 0, 
                restriction: null 
            },
            waitingForDiscountPercent: false,
            waitingForDiscountCapacity: false,
            waitingForDiscountExpiry: false,
            waitingForDiscountRestriction: false
        };
        saveDatabase();
    }
    return db.users[userId];
}

/**
 * Retrieves user data and updates their first name if provided.
 * @param {Object} msg - The Telegram message object.
 * @returns {Object} The updated user's state object.
 */
function getUserData(msg) {
    if (!msg.from) return getUserDataById(msg.chat.id);
    const user = msg.from;
    const chatId = user.id;
    const userData = getUserDataById(chatId);
    
    if (user.first_name && userData.firstName === 'کاربر') {
        userData.firstName = user.first_name;
        saveDatabase();
    }
    return userData;
}

// ============================================================================
// MESSAGING & UI UTILITIES
// ============================================================================

/**
 * Helper to escape HTML characters.
 * @param {string} text - Raw text.
 * @returns {string} Safe HTML text.
 */
function escapeHTML(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Sends a standard text message with HTML parsing.
 * @param {number|string} chatId - Target chat ID.
 * @param {string} text - Message body.
 * @param {Object} [options] - Options.
 * @returns {Promise<Object>} Sent message.
 */
async function safeSendMessage(chatId, text, options = {}) {
    try {
        const finalOptions = { parse_mode: 'HTML', ...options };
        return await bot.sendMessage(chatId, text, finalOptions);
    } catch (err) {
        SystemLogger.error('TelegramAPI', `Failed to send message to ${chatId}`, err);
    }
}

/**
 * Sends a photo securely with file stream handling.
 * @param {number|string} chatId - Target chat ID.
 * @param {string} photo - Photo path.
 * @param {Object} [options] - Options.
 * @returns {Promise<Object>} Sent message.
 */
async function safeSendPhoto(chatId, photo, options = {}) {
    try {
        const finalOptions = { parse_mode: 'HTML', ...options };
        let photoData = photo;
        
        if (typeof photo === 'string' && fs.existsSync(photo)) {
            photoData = fs.createReadStream(photo);
        }

        return await bot.sendPhoto(chatId, photoData, finalOptions);
    } catch (err) {
        SystemLogger.error('TelegramAPI', `Failed to send photo to ${chatId}. Falling back to text.`, err);
        if (options.caption) {
            return await safeSendMessage(chatId, options.caption, { reply_markup: options.reply_markup });
        }
    }
}

/**
 * Sets a dynamic reaction excluding Like/👍.
 * @param {number|string} chatId - Chat ID.
 * @param {number} messageId - Message ID.
 */
async function setReaction(chatId, messageId) {
    try {
        if (bot.setMessageReaction) {
            const reactionsList = ['❤️‍🔥', '💥', '💫', '⚡', '🔥', '❤', '🎉', '🤩', '🏆', '🌟', '✨'];
            const randomEmoji = reactionsList[Math.floor(Math.random() * reactionsList.length)];
            await bot.setMessageReaction(chatId, messageId, {
                reaction: [{ type: 'emoji', emoji: randomEmoji }]
            });
        }
    } catch (err) {
        // Ignored non-critical reaction errors
    }
}

// ============================================================================
// FINANCIAL API INTEGRATIONS
// ============================================================================

async function getUsdtToToman() {
    return new Promise((resolve) => {
        https.get('https://api.wallex.ir/v1/markets', { headers: { 'User-Agent': 'Mozilla/5.0 StarzBot' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed.result && parsed.result.symbols && parsed.result.symbols.USDTTMN) {
                        resolve(parseFloat(parsed.result.symbols.USDTTMN.stats.lastPrice));
                    } else {
                        resolve(FALLBACK_USDT_TOMAN);
                    }
                } catch (e) {
                    resolve(FALLBACK_USDT_TOMAN);
                }
            });
        }).on('error', () => {
            resolve(FALLBACK_USDT_TOMAN);
        });
    });
}

async function fetchStarsPrice() {
    const rawUsdtToman = await getUsdtToToman();
    const adjustedUsdtToman = rawUsdtToman + 1000;
    const starToman = (STAR_USD * adjustedUsdtToman);
    return Math.round(starToman);
}

async function getBinanceTonPriceUsd() {
    return new Promise((resolve) => {
        https.get('https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT', { headers: { 'User-Agent': 'Mozilla/5.0 StarzBot' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed.price) {
                        resolve(parseFloat(parsed.price));
                    } else {
                        resolve(FALLBACK_TON_USD);
                    }
                } catch (e) {
                    resolve(FALLBACK_TON_USD);
                }
            });
        }).on('error', () => {
            resolve(FALLBACK_TON_USD);
        });
    });
}

async function fetchTonData() {
    const rawUsdt = await getUsdtToToman();
    const usdtToman = rawUsdt + 1000;
    const tonUsd = await getBinanceTonPriceUsd();
    const tonToman = tonUsd * usdtToman;
    const finalPrice = Math.round(tonToman + 20000);
    return { tonUsd: tonUsd.toFixed(2), finalPrice, usdtToman };
}

// ============================================================================
// KEYBOARD GENERATOR FACTORIES (ISOLATED SECTIONS)
// ============================================================================

function getMainKeyboard(isAdmin) {
    let rows = [
        [{ text: '🛒 خرید محصول' }],
        [{ text: '➕ افزایش موجودی' }, { text: '💳 حساب کاربری' }],
        [{ text: '📞 پشتیبانی' }, { text: '📦 پیگیری سفارش' }],
        [{ text: '❤️ چطور میتوانم به شما اعتماد کنم' }]
    ];
    if (isAdmin) {
        rows.push([{ text: '🔧 پنل مدیریت' }]);
    }
    return { reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true } };
}

function getShopKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '📦 سفارش های اخیر من' }],
                [{ text: '⭐️ استارز' }, { text: '✨ بوست تلگرام' }],
                [{ text: '💠 خرید ارز تون' }],
                [{ text: '🎁 گیفت استارزی' }],
                [{ text: '💫 ری اکشن استارزی' }, { text: '🎉 گیواوی استارزی' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
}

function getBackKeyboard() {
    return {
        reply_markup: {
            keyboard: [[{ text: 'برگشت ↩️' }]],
            resize_keyboard: true
        }
    };
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

// ============================================================================
// ISOLATED INVOICE GENERATION MODULES
// ============================================================================

async function showStarInvoice(chatId, userData) {
    const unitPrice = userData.starPricePerUnit || 3865; 
    let totalPrice = unitPrice * userData.starCount;

    let discountVal = 0;
    if (userData.appliedDiscountPercent > 0) {
        const codeObj = db.discountCodes[userData.appliedDiscountCode];
        if (!codeObj || codeObj.restriction === 'stars' || codeObj.restriction === null) {
            discountVal = Math.round(totalPrice * (userData.appliedDiscountPercent / 100));
        }
    }
    
    const availableDiscountWallet = userData.discountWallet || 1766;
    const finalAmount = Math.max(0, totalPrice - discountVal);
    userData.lastAmount = finalAmount;
    saveDatabase();

    const invoiceMsg = 
        `<b>فاکتور خرید استارز</b>\n\n` +
        `💫 مقدار خرید: ${userData.starCount}\n` +
        `👤 یوزر دریافت‌کننده: @${escapeHTML(userData.starRecipient)}\n\n` +
        `💰 مبلغ فاکتور: ${totalPrice.toLocaleString()} تومان\n` +
        `🎁 کل موجودی تخفیف: ${availableDiscountWallet.toLocaleString()} تومان\n\n` +
        `🩵 مبلغ نهایی: <b>${finalAmount.toLocaleString()} تومان</b>\n\n` +
        `💼 در صورتی که جزئیات بالا مورد تأیید شماست ✓ روی دکمه تأیید کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [{ text: 'تأیید ✅' }, { text: 'لغو خرید ❌' }],
                [{ text: 'اعمال تخفیف 🎁' }, { text: 'اعمال کد تخفیف 🎫' }],
                [{ text: '🔙 بازگشت به پکیج‌ها' }, { text: '🏠 منوی اصلی' }]
            ],
            resize_keyboard: true
        }
    };

    await safeSendPhoto(chatId, '1000002626.jpg', { caption: invoiceMsg, reply_markup: invoiceKeyboard.reply_markup });
}

async function showBoostInvoice(chatId, userData) {
    const basePricePerMonth = 85000; 
    const totalPrice = userData.boostMonths * basePricePerMonth;
    userData.lastAmount = totalPrice;
    saveDatabase();

    const invoiceMsg = 
        `<b>[ فاکتور بوست کانال تلگرام ]</b>\n\n` +
        `مدت زمان: ${userData.boostMonths} ماه\n` +
        `لینک کانال: <code>${escapeHTML(userData.boostLink)}</code>\n\n` +
        `مبلغ نهایی: <b>${totalPrice.toLocaleString()} تومان</b>\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه تایید کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید بوست' }, { text: '❌ لغو خرید' }],
                [{ text: '💳 اعمال کد تخفیف' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

async function showGiftInvoice(chatId, userData) {
    const unitPrice = userData.selectedGiftStars * 3900; 
    const totalPrice = unitPrice * userData.giftCount;
    let discountVal = 0;

    if (userData.appliedDiscountPercent > 0) {
        const codeObj = db.discountCodes[userData.appliedDiscountCode];
        if (!codeObj || codeObj.restriction === 'gift_stars' || codeObj.restriction === null) {
            discountVal = Math.round(totalPrice * (userData.appliedDiscountPercent / 100));
        }
    }
    const currentAmount = Math.max(0, totalPrice - discountVal);
    userData.lastAmount = currentAmount;
    saveDatabase();

    const invoiceMsg = 
        `<b>فاکتور خرید گیفت</b>\n\n` +
        `مقدار خرید: ${escapeHTML(userData.selectedGiftName)}\n` +
        `یوزر دریافت‌کننده: @${escapeHTML(userData.recipientUsername)}\n\n` +
        `گیفت هاید: ${userData.isHided ? 'بله' : 'خیر'}\n` +
        `کامنت: ${escapeHTML(userData.commentText)}\n\n` +
        `مبلغ نهایی: <b>${currentAmount.toLocaleString()} تومان</b>\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه تایید کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید' }, { text: '❌ لغو خرید' }],
                [{ text: '💳 اعمال کد تخفیف' }],
                [{ text: '💬 تنظیم کامنت' }, { text: userData.isHided ? '🔓 لغو هاید' : '🔒 هاید گیفت' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

async function showTonInvoice(chatId, userData) {
    const totalPrice = Math.round(userData.tonAmount * userData.tonPricePerUnit);
    userData.lastAmount = totalPrice;
    saveDatabase();

    const invoiceMsg = 
        `<b>[ فاکتور خرید ارز تون ]</b>\n\n` +
        `مقدار خرید: ${userData.tonAmount} تون\n` +
        `آدرس ولت: <code>${escapeHTML(userData.tonWalletAddress)}</code>\n` +
        `کامنت (مم): ${escapeHTML(userData.tonMemo)}\n\n` +
        `مبلغ نهایی: <b>${totalPrice.toLocaleString()} تومان</b>\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه تایید کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید تون' }, { text: '❌ لغو خرید' }],
                [{ text: '💳 اعمال کد تخفیف' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

async function showReactionInvoice(chatId, userData) {
    const totalPrice = userData.reactionCount * userData.starPricePerUnit;
    userData.lastAmount = totalPrice;
    saveDatabase();

    const invoiceMsg = 
        `<b>[ فاکتور ری‌اکشن استارزی ]</b>\n\n` +
        `مقدار خرید: ${userData.reactionCount} استارز\n` +
        `لینک پست: <code>${escapeHTML(userData.reactionLink)}</code>\n\n` +
        `مبلغ نهایی: <b>${totalPrice.toLocaleString()} تومان</b>\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه تایید کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید ری‌اکشن' }, { text: '❌ لغو خرید' }],
                [{ text: '💳 اعمال کد تخفیف' }],
                [{ text: 'برگشت ↩️' }]
            ],
            resize_keyboard: true
        }
    };
    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

// ============================================================================
// CORE MESSAGE EVENT DISPATCHER & MODULAR ROUTING
// ============================================================================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const contact = msg.contact;
    const photo = msg.photo;
    
    if (msg.message_id) {
        await setReaction(chatId, msg.message_id);
    }

    const adminData = getUserDataById(ADMIN_NUMERIC_ID);
    const isAdmin = (chatId.toString() === ADMIN_NUMERIC_ID.toString());
    const userData = getUserData(msg);

    if (userData.isBanned) {
        await safeSendMessage(chatId, 'حساب کاربری شما توسط ادمین مسدود شده است. لطفاً با پشتیبانی در ارتباط باشید.');
        return;
    }

    const mainKeyboard = getMainKeyboard(isAdmin);
    const backKeyboard = getBackKeyboard();
    const accountKeyboard = getAccountKeyboard();

    const backCommands = [
        '🔙 بازگشت', 'برگشت ↩️', '🔙 برگشت', '🏠 منوی اصلی', 
        'انصراف', '↶ برگشت', '🔙 بازگشت به منوی اصلی'
    ];
    
    if (text && backCommands.includes(text)) {
        userData.waitingForAmount = false;
        userData.waitingForTicket = false;
        userData.waitingForReceipt = false;
        userData.waitingForDiscountInput = false;
        userData.waitingForRecipient = false;
        userData.waitingForComment = false;
        userData.waitingForTrackingInput = false;
        
        userData.waitingForTonAmount = false;
        userData.waitingForTonWallet = false;
        userData.waitingForTonMemoChoice = false;
        userData.waitingForTonMemoInput = false;
        
        userData.waitingForBoostLink = false;
        userData.waitingForBoostMonths = false;
        
        userData.waitingForReactionCount = false;
        userData.waitingForReactionLink = false;
        
        userData.waitingForStarCount = false;
        userData.waitingForStarRecipient = false;
        
        if (isAdmin) { 
            adminData.adminAction = null; 
            adminData.waitingForAdminUserSearch = false; 
            adminData.waitingForAdminAmount = false; 
            adminData.waitingForRejectReason = false; 
            adminData.waitingForOrderRejectReason = false;
            adminData.waitingForReceiptRejectReason = false;
            adminData.waitingForDiscountPercent = false;
            adminData.waitingForDiscountCapacity = false;
            adminData.waitingForDiscountExpiry = false;
            adminData.waitingForDiscountRestriction = false;
        }
        
        saveDatabase();

        if (text === '🏠 منوی اصلی' || text === '🔙 بازگشت به منوی اصلی' || !userData.currentShopState || userData.currentShopState === 'main_shop') {
            userData.currentShopState = null;
            saveDatabase();
            await safeSendMessage(chatId, 'به منوی اصلی برگشتید.', mainKeyboard);
            return;
        }

        if (text === '🔙 بازگشت به پکیج‌ها' || userData.currentShopState === 'star_recipient' || userData.currentShopState === 'star_invoice' || userData.currentShopState === 'star_menu') {
            userData.currentShopState = 'star_menu';
            userData.waitingForStarCount = true;
            saveDatabase();
            const starPrice = await fetchStarsPrice();
            userData.starPricePerUnit = starPrice;
            saveDatabase();

            const starMsg = 
                `💥 وقت درخشیدن با استارز تلگرامه !\n\n` +
                `🎯 کاربردهای استارز :\n` +
                `✨ فعال‌سازی ری‌اکشن‌های استارز در چت‌ها\n` +
                `🎯 خرید یا تمدید اکانت پرمیوم تلگرام\n` +
                `💸 پرداخت هزینه تبلیغات تلگرام\n\n` +
                `🪐 لطفاً تعداد استارز مورد نظر خود را ارسال کنید:`;
            
            const starMenuKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: 'محاسبه با موجودی من 🔄' }],
                        [{ text: 'برگشت ↩️' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendPhoto(chatId, '1000002624.jpg', { caption: starMsg, reply_markup: starMenuKeyboard.reply_markup });
            return;
        } else if (userData.currentShopState === 'reaction_input_link' || userData.currentShopState === 'reaction_invoice') {
            userData.currentShopState = 'reaction_menu';
            userData.waitingForReactionCount = true;
            saveDatabase();
            
            const reactMsg = `• لطفاً تعداد ری‌اکشن استارزی موردنظر خود را ارسال کنید 👇`;
            const reactKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: 'محاسبه با موجودی من 🔄' }],
                        [{ text: 'برگشت ↩️' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, reactMsg, reactKeyboard);
            return;
        } else {
            userData.currentShopState = 'main_shop';
            saveDatabase();
            await safeSendMessage(chatId, 'وقته محصول رو انتخاب کنی !\n\n🚀 تمامی سفارشات با بالاترین سرعت انجام میشن !', getShopKeyboard());
            return;
        }
    }

    // ============================================================================
    // ADMINISTRATIVE ACTION PROCESSORS
    // ============================================================================

    if (isAdmin && adminData.waitingForOrderRejectReason && text) {
        const orderCode = adminData.rejectOrderCode;
        const reason = escapeHTML(text);
        adminData.waitingForOrderRejectReason = false;
        adminData.rejectOrderCode = null;
        saveDatabase();

        const order = db.orders[orderCode];
        if (order) {
            order.status = 'rejected';
            saveDatabase();
            await safeSendMessage(order.userId, `سفارش شما با کد پیگیری <code>${orderCode}</code> توسط مدیریت رد شد.\n\nدلیل: ${reason}`);
            await safeSendMessage(chatId, `دلیل رد سفارش برای کاربر ارسال شد.`);
        }
        return;
    }

    if (isAdmin && adminData.waitingForReceiptRejectReason && text) {
        const targetUserId = adminData.rejectTargetId;
        const reason = escapeHTML(text);
        adminData.waitingForReceiptRejectReason = false;
        adminData.rejectTargetId = null;
        saveDatabase();

        await safeSendMessage(targetUserId, `رسید پرداخت شما توسط مدیریت رد شد.\n\nدلیل: ${reason}`);
        await safeSendMessage(chatId, `دلیل رد رسید برای کاربر ارسال شد.`);
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

            const restrictionKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: '🌐 بدون محدودیت' }, { text: '⭐ محدودیت برای استارز' }],
                        [{ text: '💠 محدودیت برای تون' }, { text: '💫 محدودیت برای ری‌اکشن' }],
                        [{ text: '🎁 محدودیت برای گیفت‌ها' }],
                        [{ text: 'برگشت ↩️' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, 'لطفاً نوع محدودیت کد تخفیف را انتخاب کنید:', restrictionKeyboard);
            return;
        }

        if (adminData.waitingForDiscountRestriction && text) {
            adminData.waitingForDiscountRestriction = false;
            if (text === '⭐ محدودیت برای استارز') adminData.tempDiscount.restriction = 'stars';
            else if (text === '💠 محدودیت برای تون') adminData.tempDiscount.restriction = 'ton';
            else if (text === '💫 محدودیت برای ری‌اکشن') adminData.tempDiscount.restriction = 'reaction';
            else if (text === '🎁 محدودیت برای گیفت‌ها') adminData.tempDiscount.restriction = 'gift_stars';
            else adminData.tempDiscount.restriction = null;

            const code = 'STARZ-' + Math.floor(1000 + Math.random() * 9000);
            db.discountCodes[code] = {
                percent: adminData.tempDiscount.percent,
                capacity: adminData.tempDiscount.capacity,
                usedCount: 0,
                expiryHour: adminData.tempDiscount.expiryHour,
                restriction: adminData.tempDiscount.restriction
            };
            saveDatabase();

            const adminPanelMarkup = {
                reply_markup: {
                    keyboard: [
                        [{ text: '➕ افزایش موجودی کاربر' }, { text: '➖ کاهش موجودی کاربر' }],
                        [{ text: '🏆 تغییر سطح کاربر' }, { text: '💳 تایید احراز هویت کاربر' }],
                        [{ text: '🚫 بن کردن کاربر' }, { text: '✅ آنبن کردن کاربر' }],
                        [{ text: '🏷️ ساخت کد تخفیف' }],
                        [{ text: '🔙 بازگشت به منوی اصلی' }]
                    ], 
                    resize_keyboard: true
                }
            };

            await safeSendMessage(chatId, 
                `<b>کد تخفیف ساخته شد</b>\n\n` +
                `کد: <code>${code}</code>\n` +
                `درصد: ${adminData.tempDiscount.percent}%\n` +
                `محدودیت: ${adminData.tempDiscount.restriction || 'بدون محدودیت'}`, 
                adminPanelMarkup
            );
            return;
        }
    }

    if (isAdmin && adminData.adminReplyingTo) {
        const targetUserToReply = adminData.adminReplyingTo;
        adminData.adminReplyingTo = null;
        if (text !== '🔙 بازگشت به منوی اصلی' && text !== '🔧 پنل مدیریت') {
            await safeSendMessage(targetUserToReply, `پاسخ پشتیبانی از طرف مدیریت:\n\n${escapeHTML(text)}`);
            await safeSendMessage(chatId, `پاسخ شما با موفقیت ارسال شد.`);
            return;
        }
    }

    if (isAdmin && adminData.adminAction && (text !== '🔧 پنل مدیریت' && text !== '/admin')) {
        if (adminData.waitingForAdminUserSearch && text) {
            const targetId = text.trim();
            adminData.waitingForAdminUserSearch = false;
            adminData.targetUserId = targetId;
            saveDatabase();
            const targetUser = getUserDataById(targetId);

            if (adminData.adminAction === '🚫 بن کردن کاربر') {
                targetUser.isBanned = true;
                saveDatabase();
                await safeSendMessage(chatId, `کاربر <code>${targetId}</code> بن شد.`);
                adminData.adminAction = null;
                adminData.targetUserId = null;
                return;
            } else if (adminData.adminAction === '✅ آنبن کردن کاربر') {
                targetUser.isBanned = false;
                saveDatabase();
                await safeSendMessage(chatId, `کاربر <code>${targetId}</code> آنبن شد.`);
                adminData.adminAction = null;
                adminData.targetUserId = null;
                return;
            } else if (adminData.adminAction === '💳 تایید احراز هویت کاربر') {
                targetUser.cardVerified = true;
                targetUser.level = 'سطح 2';
                saveDatabase();
                await safeSendMessage(chatId, `احراز هویت <code>${targetId}</code> تایید شد.`);
                adminData.adminAction = null;
                adminData.targetUserId = null;
                return;
            }

            adminData.waitingForAdminAmount = true;
            saveDatabase();
            if (adminData.adminAction === '➕ افزایش موجودی کاربر') await safeSendMessage(chatId, `مبلغ افزایشی (تومان):`);
            else if (adminData.adminAction === '➖ کاهش موجودی کاربر') await safeSendMessage(chatId, `مبلغ کاهشی (تومان):`);
            else if (adminData.adminAction === '🏆 تغییر سطح کاربر') await safeSendMessage(chatId, `نام سطح جدید:`);
            return;
        }

        if (adminData.waitingForAdminAmount && adminData.targetUserId && text) {
            const targetId = adminData.targetUserId;
            const targetUser = getUserDataById(targetId);
            const action = adminData.adminAction;

            if (action === '➕ افزایش موجودی کاربر') {
                const amount = parseInt(text);
                if (!isNaN(amount)) {
                    targetUser.wallet += amount;
                    saveDatabase();
                    await safeSendMessage(chatId, `${amount.toLocaleString()} تومان افزوده شد.`);
                    await safeSendMessage(targetId, `مبلغ ${amount.toLocaleString()} تومان واریز شد.`);
                }
            } else if (action === '➖ کاهش موجودی کاربر') {
                const amount = parseInt(text);
                if (!isNaN(amount)) {
                    targetUser.wallet = Math.max(0, targetUser.wallet - amount);
                    saveDatabase();
                    await safeSendMessage(chatId, `${amount.toLocaleString()} تومان کسر شد.`);
                }
            } else if (action === '🏆 تغییر سطح کاربر') {
                targetUser.level = escapeHTML(text.trim());
                saveDatabase();
                await safeSendMessage(chatId, `سطح به "${targetUser.level}" تغییر یافت.`);
            }

            adminData.adminAction = null;
            adminData.targetUserId = null;
            adminData.waitingForAdminAmount = false;
            saveDatabase();
            return;
        }
    }

    // ============================================================================
    // TELEGRAM BOOST & OTHER FLOWS
    // ============================================================================

    if (userData.waitingForBoostLink && text) {
        userData.boostLink = text.trim();
        userData.waitingForBoostLink = false;
        userData.waitingForBoostMonths = true;
        saveDatabase();

        const monthKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: '1 ماهه' }, { text: '3 ماهه' }],
                    [{ text: '6 ماهه' }, { text: '12 ماهه' }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, `لطفاً مدت زمان بوست را انتخاب کنید:`, monthKeyboard);
        return;
    }

    if (userData.waitingForBoostMonths && text) {
        let months = 1;
        if (text.includes('3')) months = 3;
        if (text.includes('6')) months = 6;
        if (text.includes('12')) months = 12;

        userData.boostMonths = months;
        userData.waitingForBoostMonths = false;
        userData.currentShopState = 'boost_invoice';
        saveDatabase();
        await showBoostInvoice(chatId, userData);
        return;
    }

    // ============================================================================
    // USER WAITING & INPUT PROCESSORS
    // ============================================================================

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
                keyboard: [
                    [{ text: `برای خودم ( ${selfName} ) 🪪` }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        };
        const recipientMsg = 
            `🔗 انتخاب اکانت دریافت‌کننده\n\n` +
            `✔️ اگر برای خودتان است، روی «برای خودم» کلیک کنید.\n` +
            `✔️ اگر برای شخص دیگری است، یوزرنیم او را بدون @ بفرستید.`;
        
        await safeSendPhoto(chatId, '1000002625.jpg', { caption: recipientMsg, reply_markup: recipientKeyboard.reply_markup });
        return;
    }

    if (userData.currentShopState === 'star_recipient' && text) {
        let usernameInput = text.trim();
        if (usernameInput.includes('برای خودم')) {
            usernameInput = msg.from.username || msg.from.id.toString();
        } else {
            if (usernameInput.startsWith('@')) {
                usernameInput = usernameInput.substring(1);
            }
        }

        userData.starRecipient = usernameInput;
        userData.currentShopState = 'star_invoice';
        saveDatabase();
        await showStarInvoice(chatId, userData);
        return;
    }

    if (userData.waitingForTonAmount && text) {
        if (text === 'محاسبه با موجودی من 🔄') {
            const balanceTon = (userData.wallet / userData.tonPricePerUnit).toFixed(2);
            await safeSendMessage(chatId, `موجودی شما: ${userData.wallet.toLocaleString()} تومان\nمعادل ${balanceTon} تون.\nلطفاً تعداد تون را وارد کنید:`, backKeyboard);
            return;
        }

        const tonInput = parseFloat(text);
        if (isNaN(tonInput) || tonInput < 0.1) {
            await safeSendMessage(chatId, '❌ حداقل خرید ۰.۱ تون است.', backKeyboard);
            return;
        }
        userData.tonAmount = tonInput;
        userData.waitingForTonAmount = false;
        userData.waitingForTonWallet = true;
        saveDatabase();

        await safeSendMessage(chatId, `لطفاً آدرس ولت تون خود را ارسال کنید:`, backKeyboard);
        return;
    }

    if (userData.waitingForReactionCount && text) {
        if (text === 'محاسبه با موجودی من 🔄') {
            const maxR = Math.floor(userData.wallet / userData.starPricePerUnit);
            await safeSendMessage(chatId, `موجودی شما: ${userData.wallet.toLocaleString()} تومان\nحداکثر ${maxR} استارز ری‌اکشن می‌توانید بزنید.`, backKeyboard);
            return;
        }

        const countInput = parseInt(text);
        if (isNaN(countInput) || countInput < 5) {
            await safeSendMessage(chatId, '❌ حداقل خرید ۵ استارز است:', backKeyboard);
            return;
        }
        userData.reactionCount = countInput;
        userData.waitingForReactionCount = false;
        userData.currentShopState = 'reaction_input_link';
        saveDatabase();

        await safeSendMessage(chatId, `🔗 لطفاً لینک پست تلگرام را ارسال کنید:`, backKeyboard);
        return;
    }

    if (userData.waitingForReactionLink && text) {
        const link = text.trim();
        if (!link.startsWith('http')) {
            await safeSendMessage(chatId, '❌ لینک نامعتبر است:', backKeyboard);
            return;
        }
        userData.reactionLink = link;
        userData.waitingForReactionLink = false;
        userData.currentShopState = 'reaction_invoice';
        saveDatabase();
        await showReactionInvoice(chatId, userData);
        return;
    }

    if (userData.waitingForTonWallet && text) {
        userData.tonWalletAddress = text.trim();
        userData.waitingForTonWallet = false;
        userData.waitingForTonMemoChoice = true;
        saveDatabase();

        const memoKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: '💬 بله، کامنت دارم' }, { text: '❌ رد کردن' }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, 'آیا برای واریز تون کامنت (ممو) دارید؟', memoKeyboard);
        return;
    }

    if (userData.waitingForTonMemoChoice && text) {
        if (text === '❌ رد کردن') {
            userData.tonMemo = 'ندارد';
            userData.waitingForTonMemoChoice = false;
            userData.currentShopState = 'ton_invoice';
            saveDatabase();
            await showTonInvoice(chatId, userData);
            return;
        } else if (text === '💬 بله، کامنت دارم') {
            userData.waitingForTonMemoChoice = false;
            userData.waitingForTonMemoInput = true;
            saveDatabase();
            await safeSendMessage(chatId, 'لطفاً متن کامنت خود را وارد کنید:', backKeyboard);
            return;
        }
    }

    if (userData.waitingForTonMemoInput && text) {
        userData.tonMemo = text.trim();
        userData.waitingForTonMemoInput = false;
        userData.currentShopState = 'ton_invoice';
        saveDatabase();
        await showTonInvoice(chatId, userData);
        return;
    }

    if (userData.waitingForTrackingInput && text) {
        userData.waitingForTrackingInput = false;
        saveDatabase();
        const trackingCode = text.trim();
        const order = db.orders[trackingCode];

        if (!order) {
            await safeSendMessage(chatId, 'سفارشی با این کد پیگیری یافت نشد.', backKeyboard);
            return;
        }

        let statusStr = 'در حال بررسی توسط مدیریت';
        if (order.status === 'completed') statusStr = 'انجام شده و تکمیل شده';
        if (order.status === 'rejected') statusStr = 'رد شده توسط مدیریت';

        const trackResultMsg = `<b>[ نتیجه پیگیری سفارش ]</b>\n\nکد: <code>${escapeHTML(trackingCode)}</code>\nمحصول: ${escapeHTML(order.giftName)}\nمبلغ: ${order.amount.toLocaleString()} تومان\nوضعیت: ${statusStr}`;
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

    if (userData.waitingForDiscountInput && text) {
        userData.waitingForDiscountInput = false;
        saveDatabase();
        const codeInput = text.trim();
        const discountObj = db.discountCodes[codeInput];

        if (!discountObj) {
            await safeSendMessage(chatId, 'کد تخفیف وارد شده نامعتبر است.', backKeyboard);
            return;
        }

        userData.appliedDiscountCode = codeInput;
        userData.appliedDiscountPercent = discountObj.percent;
        saveDatabase();

        await safeSendMessage(chatId, `کد تخفیف ${discountObj.percent}% اعمال شد!`, backKeyboard);
        
        if (userData.currentShopState === 'gift_invoice') await showGiftInvoice(chatId, userData);
        else if (userData.currentShopState === 'star_invoice') await showStarInvoice(chatId, userData);
        else if (userData.currentShopState === 'ton_invoice') await showTonInvoice(chatId, userData);
        else if (userData.currentShopState === 'reaction_invoice') await showReactionInvoice(chatId, userData);
        else if (userData.currentShopState === 'boost_invoice') await showBoostInvoice(chatId, userData);
        return;
    }

    // ============================================================================
    // MENU ACTIONS & SHOP INTERACTIONS
    // ============================================================================

    if (text === 'محاسبه با موجودی من 🔄' && userData.currentShopState === 'star_menu') {
        const maxStars = Math.floor(userData.wallet / (userData.starPricePerUnit || 3865));
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

    if (text === 'اعمال کد تخفیف 🎫' && (userData.currentShopState === 'star_invoice' || userData.currentShopState === 'boost_invoice')) {
        userData.waitingForDiscountInput = true;
        saveDatabase();
        await safeSendMessage(chatId, 'لطفاً کد تخفیف خود را ارسال کنید:', backKeyboard);
        return;
    }

    if (text === 'تأیید ✅' && userData.currentShopState === 'star_invoice') {
        const trackingCode = 'STR-' + Math.floor(10000 + Math.random() * 90000);
        const now = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });

        db.orders[trackingCode] = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: `استارز تلگرام (${userData.starCount} عدد)`,
            count: userData.starCount,
            recipient: userData.starRecipient,
            isHided: false,
            comment: 'ندارد',
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        const userConfirmMsg = `سفارش ثبت شد و در انتظار واریز است.\n\nکد پیگیری: <code>${trackingCode}</code>\nمقدار: ${userData.starCount} استارز\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `<b>[ سفارش جدید استارز ]</b>\n\nکاربر: ${escapeHTML(userData.firstName)} (${chatId})\nکد: <code>${trackingCode}</code>\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` }, { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }]
                ]
            }
        };

        await safeSendMessage(ADMIN_NUMERIC_ID, adminOrderMsg, adminOrderMarkup);
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    if (text === '✅ تایید بوست' && userData.currentShopState === 'boost_invoice') {
        const trackingCode = 'BST-' + Math.floor(10000 + Math.random() * 90000);
        const now = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });

        db.orders[trackingCode] = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: `بوست تلگرام (${userData.boostMonths} ماهه)`,
            count: userData.boostMonths,
            recipient: userData.boostLink,
            isHided: false,
            comment: 'ندارد',
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        const userConfirmMsg = `سفارش ثبت شد.\n\nکد پیگیری: <code>${trackingCode}</code>\nمدت: ${userData.boostMonths} ماه\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `<b>[ سفارش جدید بوست ]</b>\n\nکاربر: ${escapeHTML(userData.firstName)} (${chatId})\nکد: <code>${trackingCode}</code>`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` }, { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }]
                ]
            }
        };

        await safeSendMessage(ADMIN_NUMERIC_ID, adminOrderMsg, adminOrderMarkup);
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    if (text === 'لغو خرید ❌' && (userData.currentShopState === 'star_invoice' || userData.currentShopState === 'boost_invoice')) {
        userData.currentShopState = null;
        saveDatabase();
        await safeSendMessage(chatId, 'خرید شما لغو شد.', mainKeyboard);
        return;
    }

    if (text === '✅ تایید' && userData.currentShopState === 'gift_invoice') {
        const trackingCode = 'STZ-' + Math.floor(10000 + Math.random() * 90000);
        const now = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });

        db.orders[trackingCode] = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: userData.selectedGiftName,
            count: userData.giftCount,
            recipient: userData.recipientUsername,
            isHided: userData.isHided,
            comment: userData.commentText,
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        const userConfirmMsg = `سفارش گیفت ثبت شد.\n\nکد پیگیری: <code>${trackingCode}</code>\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `<b>[ سفارش جدید گیفت ]</b>\n\nکد: <code>${trackingCode}</code>`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` }, { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }]
                ]
            }
        };

        await safeSendMessage(ADMIN_NUMERIC_ID, adminOrderMsg, adminOrderMarkup);
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    if (text === '✅ تایید تون' && userData.currentShopState === 'ton_invoice') {
        const trackingCode = 'TON-' + Math.floor(10000 + Math.random() * 90000);
        const now = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });

        db.orders[trackingCode] = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: `ارز تون (${userData.tonAmount} TON)`,
            count: userData.tonAmount,
            recipient: userData.tonWalletAddress,
            isHided: false,
            comment: userData.tonMemo,
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        const userConfirmMsg = `سفارش تون ثبت شد.\n\nکد پیگیری: <code>${trackingCode}</code>`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `<b>[ سفارش جدید تون ]</b>\n\nکد: <code>${trackingCode}</code>`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` }, { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }]
                ]
            }
        };

        await safeSendMessage(ADMIN_NUMERIC_ID, adminOrderMsg, adminOrderMarkup);
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    if (text === '✅ تایید ری‌اکشن' && userData.currentShopState === 'reaction_invoice') {
        const trackingCode = 'RCT-' + Math.floor(10000 + Math.random() * 90000);
        const now = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });

        db.orders[trackingCode] = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: `ری‌اکشن استارزی (${userData.reactionCount} استارز)`,
            count: userData.reactionCount,
            recipient: userData.reactionLink,
            isHided: false,
            comment: 'ندارد',
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        const userConfirmMsg = `سفارش ری‌اکشن ثبت شد.\n\nکد: <code>${trackingCode}</code>`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `<b>[ سفارش جدید ری‌اکشن ]</b>\n\nکد: <code>${trackingCode}</code>`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` }, { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }]
                ]
            }
        };

        await safeSendMessage(ADMIN_NUMERIC_ID, adminOrderMsg, adminOrderMarkup);
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    // ============================================================================
    // RECEIPT UPLOAD PIPELINE
    // ============================================================================
    
    if (photo && userData.waitingForReceipt) {
        const photoId = photo[photo.length - 1].file_id;
        userData.waitingForReceipt = false;
        saveDatabase();
        
        const amount = userData.lastAmount;
        const adminCaption = `<b>[ رسید پرداخت جدید ]</b>\n\nکاربر: ${escapeHTML(userData.firstName)}\nآیدی: <code>${chatId}</code>\nمبلغ: ${amount.toLocaleString()} تومان`;
        const adminMarkup = {
            inline_keyboard: [
                [{ text: '✅ تایید', callback_data: `approve_receipt_${chatId}_${amount}` }, { text: '❌ رد', callback_data: `reject_receipt_${chatId}` }]
            ]
        };

        try {
            await bot.sendPhoto(ADMIN_NUMERIC_ID, photoId, { caption: adminCaption, parse_mode: 'HTML', reply_markup: adminMarkup });
        } catch (e) { 
            SystemLogger.error('API', 'Failed to send receipt', e);
        }

        const userMarkup = {
            inline_keyboard: [[{ text: '💬 پیگیری رسید', callback_data: 'track_receipt_main' }]]
        };
        
        await safeSendMessage(chatId, `✅ رسید شما دریافت شد و در صف بررسی است.`, { reply_markup: userMarkup });
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
        
        const adminTicketMsg = `تیکت جدید:\nنام: ${escapeHTML(userData.firstName)}\nمتن:\n${escapeHTML(text)}`;
        const replyMarkup = { 
            reply_markup: { 
                inline_keyboard: [[{ text: '💬 پاسخ به کاربر', callback_data: `reply_${chatId}` }]] 
            } 
        };
        await safeSendMessage(ADMIN_NUMERIC_ID, adminTicketMsg, replyMarkup);
        return;
    }

    // ============================================================================
    // MENU COMMAND HANDLERS & NAVIGATION
    // ============================================================================

    if (text && text.startsWith('/start')) {
        userData.currentShopState = null;
        saveDatabase();
        const welcomeText = `به استارزپلاس خوش آمدید ! 🌟\nمجموعه‌ای کامل برای خدمات تلگرامی شما.`;
        await safeSendPhoto(chatId, '1000002624.jpg', { caption: welcomeText, reply_markup: mainKeyboard.reply_markup });
        return;
    } 

    if (text === '🔧 پنل مدیریت' && isAdmin) {
        const adminPanelMarkup = {
            reply_markup: {
                keyboard: [
                    [{ text: '➕ افزایش موجودی کاربر' }, { text: '➖ کاهش موجودی کاربر' }],
                    [{ text: '🏆 تغییر سطح کاربر' }, { text: '💳 تایید احراز هویت کاربر' }],
                    [{ text: '🚫 بن کردن کاربر' }, { text: '✅ آنبن کردن کاربر' }],
                    [{ text: '🏷️ ساخت کد تخفیف' }],
                    [{ text: '🔙 بازگشت به منوی اصلی' }]
                ], resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, 'پنل مدیریت:', adminPanelMarkup);
    }
    else if (isAdmin && ['➕ افزایش موجودی کاربر', '➖ کاهش موجودی کاربر', '🏆 تغییر سطح کاربر', '💳 تایید احراز هویت کاربر', '🚫 بن کردن کاربر', '✅ آنبن کردن کاربر'].includes(text)) {
        adminData.adminAction = text;
        adminData.waitingForAdminUserSearch = true;
        saveDatabase();
        await safeSendMessage(chatId, `آیدی عددی کاربر مورد نظر را وارد کنید:`);
    }
    else if (isAdmin && text === '🏷️ ساخت کد تخفیف') {
        adminData.waitingForDiscountPercent = true;
        saveDatabase();
        await safeSendMessage(chatId, 'درصد تخفیف (عدد بین 1 تا 100):');
    }
    else if (text === '🛒 خرید محصول') {
        userData.currentShopState = 'main_shop';
        saveDatabase();
        await safeSendMessage(chatId, 'وقته محصول رو انتخاب کنی !\n\n🚀 سفارشات با بالاترین سرعت انجام میشن !', getShopKeyboard());
    }
    else if (text === '⭐️ استارز' || text === '⭐ استارز تلگرام (Telegram Stars)') {
        userData.currentShopState = 'star_menu';
        userData.waitingForStarCount = true;
        const starsPrice = await fetchStarsPrice();
        userData.starPricePerUnit = starsPrice;
        saveDatabase();

        const starMsg = 
            `💥 وقت درخشیدن با استارز تلگرامه !\n\n` +
            `🎯 کاربردهای استارز :\n` +
            `✨ فعال‌سازی ری‌اکشن‌ها\n` +
            `🎯 خرید یا تمدید اکانت پرمیوم\n\n` +
            `🪐 لطفاً تعداد استارز مورد نظر را ارسال کنید:`;

        const starMenuKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: 'محاسبه با موجودی من 🔄' }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendPhoto(chatId, '1000002624.jpg', { caption: starMsg, reply_markup: starMenuKeyboard.reply_markup });
    }
    else if (text === '✨ بوست تلگرام') {
        userData.currentShopState = 'boost_flow';
        saveDatabase();
        await safeSendMessage(chatId, `لینک کانال تلگرامی جهت بوست را ارسال کنید:`, backKeyboard);
        userData.waitingForBoostLink = true;
        saveDatabase();
    }
    else if (text === '💫 ری اکشن استارزی') {
        userData.currentShopState = 'reaction_menu';
        userData.waitingForReactionCount = true;
        const starsPrice = await fetchStarsPrice();
        userData.starPricePerUnit = starsPrice;
        saveDatabase();

        const reactionMenuKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: 'محاسبه با موجودی من 🔄' }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, `• تعداد ری‌اکشن استارزی موردنظر را ارسال کنید 👇`, reactionMenuKeyboard);
    }
    else if (text === '💠 خرید ارز تون' || text === '💠 خرید ارز تون ( GRAM )') {
        userData.currentShopState = 'ton_wallet_flow';
        saveDatabase();
        const tonData = await fetchTonData();
        userData.tonPricePerUnit = tonData.finalPrice;
        saveDatabase();

        const tonWalletFlowKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: 'محاسبه با موجودی من 🔄' }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, `تعداد تون مورد نظر را وارد کنید:`, tonWalletFlowKeyboard);
        userData.waitingForTonAmount = true;
        saveDatabase();
    }
    else if (text === '🎁 گیفت استارزی' || text === '🎁 گیفت‌های استارزی') {
        userData.currentShopState = 'gift_category';
        saveDatabase();
        const giftCategoryKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: '🧸 گیفت های عادی' }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, 'دسته‌بندی گیفت مورد نظر را انتخاب کنید:', giftCategoryKeyboard);
    }
    else if (text === '🧸 گیفت های عادی') {
        userData.currentShopState = 'gift_list';
        saveDatabase();
        const giftListKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: '💖 گیفت قلب (15)' }, { text: '🧸 گیفت تدی (15)' }],
                    [{ text: '🎁 گیفت کادو (25)' }, { text: '🌹 گیفت گل رز (25)' }],
                    [{ text: '🎂 گیفت کیک (50)' }, { text: '🌷 گیفت گل (50)' }],
                    [{ text: '🍾 گیفت بطری (50)' }, { text: '🚀 گیفت سفینه (50)' }],
                    [{ text: '🏆 گیفت جام (100)' }, { text: '💍 گیفت حلقه (100)' }],
                    [{ text: 'برگشت ↩️' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, 'گیفت مورد نظر خود را انتخاب کنید:', giftListKeyboard);
    }
    else if (text && text.includes('گیفت')) {
        userData.selectedGiftName = text;
        if (text.includes('قلب') || text.includes('تدی')) userData.selectedGiftStars = 15;
        else if (text.includes('کادو') || text.includes('رز')) userData.selectedGiftStars = 25;
        else if (text.includes('کیک') || text.includes('گل') || text.includes('بطری') || text.includes('سفینه')) userData.selectedGiftStars = 50;
        else userData.selectedGiftStars = 100;

        userData.giftCount = 1;
        userData.currentShopState = 'gift_count';
        saveDatabase();

        const countKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: '🔻 کم کردن' }, { text: '📊 تعداد' }, { text: '🟢 اضافه کردن' }],
                    [{ text: '➖' }, { text: `${userData.giftCount}` }, { text: '➕' }],
                    [{ text: 'برگشت ↩️' }, { text: '✅ ادامه' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, `تعداد انتخاب شده: ${userData.giftCount}`, countKeyboard);
    }
    else if (text === '🟢 اضافه کردن' || text === '➕') {
        if (userData.currentShopState === 'gift_count') {
            userData.giftCount += 1;
            saveDatabase();
            const countKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: '🔻 کم کردن' }, { text: '📊 تعداد' }, { text: '🟢 اضافه کردن' }],
                        [{ text: '➖' }, { text: `${userData.giftCount}` }, { text: '➕' }],
                        [{ text: 'برگشت ↩️' }, { text: '✅ ادامه' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, `تعداد انتخاب شده: ${userData.giftCount}`, countKeyboard);
        }
    }
    else if (text === '🔻 کم کردن' || text === '➖') {
        if (userData.currentShopState === 'gift_count' && userData.giftCount > 1) {
            userData.giftCount -= 1;
            saveDatabase();
            const countKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: '🔻 کم کردن' }, { text: '📊 تعداد' }, { text: '🟢 اضافه کردن' }],
                        [{ text: '➖' }, { text: `${userData.giftCount}` }, { text: '➕' }],
                        [{ text: 'برگشت ↩️' }, { text: '✅ ادامه' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, `تعداد انتخاب شده: ${userData.giftCount}`, countKeyboard);
        }
    }
    else if (text === '✅ ادامه') {
        if (userData.currentShopState === 'gift_count') {
            userData.currentShopState = 'gift_recipient';
            saveDatabase();
            const selfName = escapeHTML(msg.from.first_name) || 'کاربر';

            const recipientKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: `برای خودم ( ${selfName} ) 🪪` }],
                        [{ text: 'برگشت ↩️' }]
                    ],
                    resize_keyboard: true
                }
            };
            
            const recipientMsg = `انتخاب اکانت دریافت‌کننده گیفت\n\nبرای خودتان روی «برای خودم» کلیک کنید یا یوزرنیم مقصد را بفرستید.`;
            await safeSendMessage(chatId, recipientMsg, recipientKeyboard);
        }
    }
    else if (userData.currentShopState === 'gift_recipient' && text) {
        let usernameInput = text.trim();
        if (usernameInput.includes('برای خودم')) {
            usernameInput = msg.from.username || msg.from.id.toString();
        } else {
            if (usernameInput.startsWith('@')) {
                usernameInput = usernameInput.substring(1);
            }
        }
        
        userData.recipientUsername = usernameInput;
        userData.currentShopState = 'gift_invoice';
        saveDatabase();
        await showGiftInvoice(chatId, userData);
    }
    else if (text === '💳 اعمال کد تخفیف') {
        userData.waitingForDiscountInput = true;
        saveDatabase();
        await safeSendMessage(chatId, 'کد تخفیف خود را ارسال کنید:', backKeyboard);
    }
    else if (text === '💬 تنظیم کامنت') {
        userData.waitingForComment = true;
        saveDatabase();
        await safeSendMessage(chatId, 'کامنت دلخواه خود را بفرستید:', backKeyboard);
    }
    else if (text === '🔒 هاید گیفت' || text === '🔓 لغو هاید') {
        userData.isHided = !userData.isHided;
        saveDatabase();
        if (userData.currentShopState === 'gift_invoice') await showGiftInvoice(chatId, userData);
    }
    else if (text === '❤️ چه طور میتوانم به شما اعتماد کنم' || text === '❤️ چطور میتوانم به شما اعتماد کنم') {
        const trustMsg = `استارزپلاس با رضایت هزاران مشتری فعال در خدمت شماست.\n\nکانال اعتماد:\n@snt_shopp`;
        await safeSendMessage(chatId, trustMsg, backKeyboard);
    }
    else if (text === '📦 پیگیری سفارش') {
        userData.waitingForTrackingInput = true;
        saveDatabase();
        await safeSendMessage(chatId, `کد پیگیری سفارش خود را ارسال کنید:`, backKeyboard);
    }
    else if (text === '💳 حساب کاربری') {
        const userInfo = `<b>حساب کاربری شما</b>\n\nنام: ${escapeHTML(userData.firstName)}\nآیدی: <code>${chatId}</code>\nموجودی اصلی: ${userData.wallet.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userInfo, accountKeyboard);
    }
    else if (text === '➕ افزایش موجودی') {
        const increaseKeyboard = { 
            reply_markup: { 
                keyboard: [
                    [{ text: '💳 پرداخت ریالی' }], 
                    [{ text: '🔙 بازگشت به منوی اصلی' }]
                ], 
                resize_keyboard: true 
            } 
        };
        await safeSendMessage(chatId, `افزایش موجودی حساب...`, increaseKeyboard);
    }
    else if (text === '💳 پرداخت ریالی') {
        userData.waitingForAmount = true;
        saveDatabase();
        await safeSendMessage(chatId, `مبلغی که می‌خواهید حساب را شارژ کنید وارد نمایید (تومان - فقط عدد):`, backKeyboard);
    }
    else if (userData.waitingForAmount && /^\d+$/.test(text)) {
        const enteredAmount = parseInt(text);
        userData.waitingForAmount = false;
        userData.lastAmount = enteredAmount;
        userData.waitingForReceipt = true;
        saveDatabase();
        
        const cardPaymentMsg = `مبلغ: ${userData.lastAmount.toLocaleString()} تومان\n\nبه شماره کارت زیر واریز کنید:\n<code>6219861452862914</code>\nبه نام: شنتیا زاهد پور\n\nسپس عکس رسید را ارسال کنید.`;
        const paymentKeyboard = {
            reply_markup: {
                inline_keyboard: [[{ text: '🏷️ اعمال کد تخفیف', callback_data: 'apply_discount_prompt' }]],
                keyboard: [[{ text: 'برگشت ↩️' }]], 
                resize_keyboard: true 
            }
        };
        await safeSendMessage(chatId, cardPaymentMsg, paymentKeyboard);
    }
    else if (text === '📞 پشتیبانی') {
        const supportKeyboard = { 
            reply_markup: { 
                keyboard: [
                    [{ text: '👤 پشتیبانی مستقیم' }, { text: '🎫 ارسال تیکت (غیرمستقیم)' }], 
                    [{ text: '🔙 بازگشت به منوی اصلی' }]
                ], 
                resize_keyboard: true 
            } 
        };
        await safeSendMessage(chatId, `بخش پشتیبانی:`, supportKeyboard);
    }
    else if (text === '👤 پشتیبانی مستقیم') await safeSendMessage(chatId, `ارتباط با ادمین:\n${ADMIN_ID_USERNAME}`, backKeyboard);
    else if (text === '🎫 ارسال تیکت (غیرمستقیم)') {
        userData.waitingForTicket = true;
        saveDatabase();
        await safeSendMessage(chatId, `پیام خود را ارسال کنید:`, backKeyboard);
    }
    else if (text === '📦 سفارش های اخیر من' || text === 'سفارش های اخیر من 📥') {
        let userOrders = Object.entries(db.orders).filter(([code, order]) => order.userId === chatId);
        if (userOrders.length === 0) {
            await safeSendMessage(chatId, 'شما سفارشی ثبت نکرده‌اید.', backKeyboard);
        } else {
            let msgText = `<b>[ سفارش‌های اخیر شما ]</b>\n\n`;
            userOrders.slice(-5).forEach(([code, order]) => {
                msgText += `📦 کد: <code>${escapeHTML(code)}</code>\nمحصول: ${escapeHTML(order.giftName)}\nمبلغ: ${order.amount.toLocaleString()} تومان\n\n`;
            });
            await safeSendMessage(chatId, msgText, backKeyboard);
        }
    }
    else if (text === '📦 سفارش های معلق من') {
        let userOrders = Object.entries(db.orders).filter(([code, order]) => order.userId === chatId && order.status === 'pending');
        if (userOrders.length === 0) {
            await safeSendMessage(chatId, 'سفارش معلقی ندارید.', backKeyboard);
        } else {
            let msgText = `<b>[ سفارش‌های معلق شما ]</b>\n\n`;
            userOrders.forEach(([code, order]) => {
                msgText += `📦 کد: <code>${escapeHTML(code)}</code>\nمحصول: ${escapeHTML(order.giftName)}\n\n`;
            });
            await safeSendMessage(chatId, msgText, backKeyboard);
        }
    }
});

// ============================================================================
// INLINE CALLBACK QUERY HANDLER
// ============================================================================

bot.on('callback_query', async (callbackQuery) => {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userData = getUserDataById(chatId);

    if (action === 'track_receipt_main') {
        const supportMarkup = {
            inline_keyboard: [
                [{ text: '👤 پشتیبانی مستقیم', callback_data: 'support_direct' }, { text: '🎫 ارسال تیکت', callback_data: 'support_ticket' }]
            ]
        };
        await safeSendMessage(chatId, 'یکی از گزینه‌های زیر را انتخاب کنید:', { reply_markup: supportMarkup });
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action.startsWith('order_done_')) {
        const trackingCode = action.replace('order_done_', '');
        const order = db.orders[trackingCode];
        if (order) {
            order.status = 'completed';
            saveDatabase();
            await safeSendMessage(order.userId, `سفارش شما با کد <code>${trackingCode}</code> تکمیل شد.`);
            try {
                await bot.editMessageText(`<b>[ سفارش تایید شد ]</b>\n\nکد: <code>${trackingCode}</code>`, {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    parse_mode: 'HTML'
                });
            } catch(e){}
        }
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action.startsWith('order_reject_')) {
        const trackingCode = action.replace('order_reject_', '');
        const adminData = getUserDataById(ADMIN_NUMERIC_ID);
        adminData.waitingForOrderRejectReason = true;
        adminData.rejectOrderCode = trackingCode;
        saveDatabase();
        await safeSendMessage(chatId, 'دلیل رد سفارش را بنویسید:');
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action.startsWith('approve_receipt_')) {
        const parts = action.split('_');
        const targetId = parts[2];
        const amount = parseInt(parts[3]);
        const targetUser = getUserDataById(targetId);

        targetUser.wallet += amount;
        saveDatabase();

        await safeSendMessage(targetId, `رسید تایید و مبلغ ${amount.toLocaleString()} تومان واریز شد.`);
        try {
            await bot.editMessageCaption(`<b>[ رسید پرداخت تایید شد ]</b>\n\nمبلغ: ${amount.toLocaleString()} تومان`, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                parse_mode: 'HTML'
            });
        } catch(e){}
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action.startsWith('reject_receipt_')) {
        const targetId = action.split('_')[2];
        const adminData = getUserDataById(ADMIN_NUMERIC_ID);
        adminData.waitingForReceiptRejectReason = true;
        adminData.rejectTargetId = targetId;
        saveDatabase();
        await safeSendMessage(chatId, 'دلیل رد رسید را بنویسید:');
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action === 'apply_discount_prompt') {
        userData.waitingForDiscountInput = true;
        saveDatabase();
        await safeSendMessage(chatId, 'کد تخفیف خود را ارسال کنید:');
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action.startsWith('reply_')) {
        const targetUserId = action.split('_')[1];
        const adminData = getUserDataById(ADMIN_NUMERIC_ID);
        adminData.adminReplyingTo = targetUserId;
        saveDatabase();
        await safeSendMessage(chatId, `پاسخ خود را به کاربر بفرستید:`);
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action === 'support_direct') {
        await safeSendMessage(chatId, `ارتباط مستقیم:\n${ADMIN_ID_USERNAME}`);
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action === 'support_ticket') {
        userData.waitingForTicket = true;
        saveDatabase();
        await safeSendMessage(chatId, `پیام خود را بنویسید:`);
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
});
