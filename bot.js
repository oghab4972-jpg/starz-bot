/**
 * ============================================================================
 * STARZPLUS TELEGRAM BOT - V2.0 (UPGRADED)
 * بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
 * ============================================================================
 * Features:
 * - Instant Response Speed & Live Binance/Wallex API integration.
 * - Dynamic Reaction System (❤️‍🔥, 💥, 💫, ⚡, etc.) -> Like (👍) Removed!
 * - Advanced State Management & Bulletproof Back-Button Routing.
 * - Multi-tiered Shop System (Stars, Ton, TRX, Boost, Gifts, Reactions).
 * - Premium Section Removed as requested.
 * - Comprehensive Admin Panel.
 * - Photo-integrated UI for Stars purchasing flow.
 * - Precise USDT + 1000 Toman pricing logic.
 * ============================================================================
 */

const TelegramModule = require('node-telegram-bot-api');
const fs = require('fs');
const https = require('https');

// ============================================================================
// BOT INITIALIZATION & CONFIGURATION
// ============================================================================
const TelegramBot = typeof TelegramModule === 'function' 
    ? TelegramModule 
    : (
        TelegramModule.default || 
        TelegramModule.TelegramBot || 
        Object.values(TelegramModule).find(v => typeof v === 'function') || 
        TelegramModule
    );

const TOKEN = '8222630500:AAGcdGZ76BQz1AHju4tZQMZzpOUEkJIqzF8';
const ADMIN_ID_USERNAME = '@shantiaNFT';
const ADMIN_NUMERIC_ID = 8942987641;
const DB_FILE = './database.json';

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

// Process event handlers for uninterrupted uptime
process.on('uncaughtException', (err) => { 
    console.error('Uncaught Exception:', err); 
});
process.on('unhandledRejection', (reason, promise) => { 
    console.error('Unhandled Rejection:', reason); 
});

// ============================================================================
// DATABASE MANAGEMENT
// ============================================================================
let db = { 
    users: {}, 
    orders: {}, 
    discountCodes: {} 
};

// Fixed Stars USD Price
const STAR_USD = 0.015;

/**
 * Loads the JSON database from the file system.
 */
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
        } else {
            saveDatabase();
        }
    } catch (e) {
        console.error('Error loading database:', e.message);
    }
}

/**
 * Saves the current state of the database to the JSON file.
 */
function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving database:', e.message);
    }
}

// Initial Database Load
loadDatabase();
console.log('StarzPlus Bot is running with Instant Response Speed & Live Binance/Wallex API!');

// ============================================================================
// USER STATE MANAGEMENT
// ============================================================================

function getUserDataById(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            // Basic Info
            firstName: 'کاربر',
            phone: 'ثبت نشده',
            verified: 'انجام نشده',
            cardVerified: false,
            isBanned: false,
            level: 'سطح 1',
            wallet: 0,
            discountWallet: 1766,
            
            // Core Waiting States
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

            // TRX Specific States
            waitingForTrxAmount: false,
            waitingForTrxWallet: false,
            
            // BOOST Specific States
            waitingForBoostLink: false,
            waitingForBoostMonths: false,

            // Reaction Specific States
            waitingForReactionCount: false,
            waitingForReactionLink: false,
            
            // Stars Specific States
            waitingForStarCount: false,
            waitingForStarRecipient: false,
            
            // Order Variables
            starCount: 50,
            starRecipient: '',
            starPricePerUnit: 0,
            reactionCount: 5,
            reactionLink: '',
            lastAmount: 0,
            appliedDiscountCode: null,
            appliedDiscountPercent: 0,
            currentShopState: null, 
            
            // Gift Variables
            selectedGiftName: '',
            selectedGiftStars: 0,
            giftCount: 1,
            recipientUsername: '',
            isHided: false,
            commentText: 'تنظیم نشده',
            
            // TON Variables
            tonAmount: 0,
            tonPricePerUnit: 0,
            tonWalletAddress: '',
            tonMemo: 'ندارد',

            // TRX Variables
            trxAmount: 0,
            trxPricePerUnit: 0,
            trxWalletAddress: '',

            // BOOST Variables
            boostLink: '',
            boostMonths: 1,
            
            // Admin Variables
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
            
            // Discount Admin Variables
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
// MESSAGING & REACTION UTILITIES
// ============================================================================

async function safeSendMessage(chatId, text, options = {}) {
    try {
        const finalOptions = { parse_mode: 'Markdown', ...options };
        return await bot.sendMessage(chatId, text, finalOptions);
    } catch (err) {
        console.error(`Failed to send message to ${chatId}:`, err.message);
    }
}

async function safeSendPhoto(chatId, photo, options = {}) {
    try {
        const finalOptions = { parse_mode: 'Markdown', ...options };
        return await bot.sendPhoto(chatId, photo, finalOptions);
    } catch (err) {
        console.error(`Failed to send photo to ${chatId}:`, err.message);
        // Fallback to text if photo fails
        if (options.caption) {
            return await safeSendMessage(chatId, options.caption, { reply_markup: options.reply_markup });
        }
    }
}

/**
 * Sets a dynamic reaction to a user's message.
 * Like reaction (👍) has been deleted as requested.
 */
async function setReaction(chatId, messageId) {
    try {
        if (bot.setMessageReaction) {
            // Dynamic Reaction Array (Like 👍 is removed)
            const reactionsList = [
                '❤️‍🔥', '💥', '💫', '⚡', '🔥', '❤', '🎉', '🤩', '🏆', '🌟', '✨'
            ];
            const randomEmoji = reactionsList[Math.floor(Math.random() * reactionsList.length)];
            
            await bot.setMessageReaction(chatId, messageId, {
                reaction: [
                    { 
                        type: 'emoji', 
                        emoji: randomEmoji 
                    }
                ]
            });
        }
    } catch (err) {
        // Ignore reaction errors
    }
}

// ============================================================================
// API INTEGRATIONS (WALLEX & BINANCE)
// ============================================================================

/**
 * Fetches USDT to Toman rate from Wallex.
 */
async function getUsdtToToman() {
    return new Promise((resolve) => {
        https.get('https://api.wallex.ir/v1/markets', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed.result && parsed.result.symbols && parsed.result.symbols.USDTTMN) {
                        resolve(parseFloat(parsed.result.symbols.USDTTMN.stats.lastPrice));
                    } else {
                        resolve(65000); // Fallback
                    }
                } catch (e) {
                    resolve(65000);
                }
            });
        }).on('error', () => {
            resolve(65000);
        });
    });
}

/**
 * Calculates the price of Telegram Stars in Toman.
 * Applies +1000 Toman buffer on Tether rate.
 */
async function fetchStarsPrice() {
    const rawUsdtToman = await getUsdtToToman();
    const adjustedUsdtToman = rawUsdtToman + 1000; // Adding 1000 Tomans to Tether as requested
    const starToman = (STAR_USD * adjustedUsdtToman);
    return Math.round(starToman);
}

/**
 * Fetches TON to USD rate from Binance.
 */
async function getBinanceTonPriceUsd() {
    return new Promise((resolve) => {
        https.get('https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed.price) {
                        resolve(parseFloat(parsed.price));
                    } else {
                        resolve(5.5);
                    }
                } catch (e) {
                    resolve(5.5);
                }
            });
        }).on('error', () => {
            resolve(5.5);
        });
    });
}

/**
 * Fetches TRX to USD rate from Binance.
 */
async function getBinanceTrxPriceUsd() {
    return new Promise((resolve) => {
        https.get('https://api.binance.com/api/v3/ticker/price?symbol=TRXUSDT', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed.price) {
                        resolve(parseFloat(parsed.price));
                    } else {
                        resolve(0.12);
                    }
                } catch (e) {
                    resolve(0.12);
                }
            });
        }).on('error', () => {
            resolve(0.12);
        });
    });
}

async function fetchTonData() {
    const rawUsdt = await getUsdtToToman();
    const usdtToman = rawUsdt + 1000; // Tether + 1000
    const tonUsd = await getBinanceTonPriceUsd();
    const tonToman = tonUsd * usdtToman;
    const finalPrice = Math.round(tonToman + 20000); // 20k network/service fee buffer
    return { tonUsd: tonUsd.toFixed(2), finalPrice, usdtToman };
}

async function fetchTrxData() {
    const rawUsdt = await getUsdtToToman();
    const usdtToman = rawUsdt + 1000; // Tether + 1000
    const trxUsd = await getBinanceTrxPriceUsd();
    const trxToman = trxUsd * usdtToman;
    const finalPrice = Math.round(trxToman + 1500); // small buffer for TRX
    return { trxUsd: trxUsd.toFixed(4), finalPrice, usdtToman };
}

// ============================================================================
// KEYBOARD GENERATORS
// ============================================================================

function getMainKeyboard(isAdmin) {
    let rows = [
        [
            { text: '🛒 خرید محصول', style: 'success' }
        ],
        [
            { text: '➕ افزایش موجودی', style: 'primary' }, 
            { text: '💳 حساب کاربری', style: 'primary' }
        ],
        [
            { text: '📞 پشتیبانی', style: 'primary' }, 
            { text: '📦 پیگیری سفارش', style: 'primary' }
        ],
        [
            { text: '❤️ چطور میتوانم به شما اعتماد کنم', style: 'danger' }
        ]
    ];
    if (isAdmin) {
        rows.push([
            { text: '🔧 پنل مدیریت', style: 'primary' }
        ]);
    }
    return { 
        reply_markup: { 
            keyboard: rows, 
            resize_keyboard: true, 
            is_persistent: true 
        } 
    };
}

function getShopKeyboard() {
    // Removed Premium, Added TRX and Boost
    return {
        reply_markup: {
            keyboard: [
                [
                    { text: '📦 سفارش های اخیر من', style: 'primary' }
                ],
                [
                    { text: '⭐️ استارز', style: 'success' }, 
                    { text: '✨ بوست تلگرام', style: 'primary' }
                ],
                [
                    { text: '💠 خرید ارز تون', style: 'success' }
                ],
                [
                    { text: '🎁 گیفت استارزی', style: 'success' }, 
                    { text: '🔴 خرید ارز ترون (TRX)', style: 'danger' }
                ],
                [
                    { text: '💫 ری اکشن استارزی', style: 'success' }, 
                    { text: '🎉 گیواوی استارزی', style: 'primary' }
                ],
                [
                    { text: 'برگشت ↩️', style: 'danger' }
                ]
            ],
            resize_keyboard: true
        }
    };
}

function getBackKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: 'برگشت ↩️', style: 'danger' }]
            ],
            resize_keyboard: true
        }
    };
}

function getAccountKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [
                    { text: '📦 سفارش های معلق من', style: 'primary' }, 
                    { text: '📦 سفارش های اخیر من', style: 'primary' }
                ],
                [
                    { text: 'برگشت ↩️', style: 'danger' }
                ]
            ],
            resize_keyboard: true
        }
    };
}

// ============================================================================
// INVOICE GENERATORS
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
        `فاکتور خرید استارز\n\n` +
        `💫 مقدار خرید: ${userData.starCount}\n` +
        `👤 یوزر دریافت‌کننده: @${userData.starRecipient}\n\n` +
        `💰 مبلغ فاکتور: ${totalPrice.toLocaleString()} تومان\n` +
        `🎁 کل موجودی تخفیف: ${availableDiscountWallet.toLocaleString()} تومان\n\n` +
        `💡 حداکثر تخفیف قابل اعمال: ${availableDiscountWallet.toLocaleString()} تومان\n\n` +
        `🩵 مبلغ نهایی: ${finalAmount.toLocaleString()} تومان\n\n` +
        `💼 در صورتی که جزئیات بالا مورد تأیید شماست ✓\nروی دکمه «تأیید ✅» کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [
                    { text: 'تأیید ✅', style: 'success' }, 
                    { text: 'لغو خرید ❌', style: 'danger' }
                ],
                [
                    { text: 'اعمال تخفیف 🎁', style: 'primary' }, 
                    { text: 'اعمال کد تخفیف 🎫', style: 'primary' }
                ],
                [
                    { text: '🔙 بازگشت به پکیج‌ها', style: 'danger' }, 
                    { text: '🏠 منوی اصلی', style: 'danger' }
                ]
            ],
            resize_keyboard: true
        }
    };

    // Sending with specific image as requested
    await safeSendPhoto(chatId, '1000002626.jpg', { caption: invoiceMsg, reply_markup: invoiceKeyboard.reply_markup });
}

async function showTrxInvoice(chatId, userData) {
    const totalPrice = Math.round(userData.trxAmount * userData.trxPricePerUnit);
    userData.lastAmount = totalPrice;
    saveDatabase();

    const invoiceMsg = 
        `[ فاکتور خرید ارز ترون ]\n\n` +
        `مقدار خرید: ${userData.trxAmount} TRX\n` +
        `آدرس ولت: \`${userData.trxWalletAddress}\`\n\n` +
        `مبلغ نهایی: ${totalPrice.toLocaleString()} تومان\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه «تأیید» کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [
                    { text: '✅ تایید ترون', style: 'success' }, 
                    { text: '❌ لغو خرید', style: 'danger' }
                ],
                [
                    { text: '💳 اعمال کد تخفیف', style: 'primary' }
                ],
                [
                    { text: 'برگشت ↩️', style: 'danger' }
                ]
            ],
            resize_keyboard: true
        }
    };
    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

async function showBoostInvoice(chatId, userData) {
    // Arbitrary pricing for Boost based on months
    const basePricePerMonth = 85000; 
    const totalPrice = userData.boostMonths * basePricePerMonth;
    userData.lastAmount = totalPrice;
    saveDatabase();

    const invoiceMsg = 
        `[ فاکتور بوست کانال تلگرام ]\n\n` +
        `مدت زمان: ${userData.boostMonths} ماه\n` +
        `لینک کانال: \`${userData.boostLink}\`\n\n` +
        `مبلغ نهایی: ${totalPrice.toLocaleString()} تومان\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه «تأیید» کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [
                    { text: '✅ تایید بوست', style: 'success' }, 
                    { text: '❌ لغو خرید', style: 'danger' }
                ],
                [
                    { text: '💳 اعمال کد تخفیف', style: 'primary' }
                ],
                [
                    { text: 'برگشت ↩️', style: 'danger' }
                ]
            ],
            resize_keyboard: true
        }
    };
    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

// Other existing invoice generators...
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
        `فاکتور خرید گیفت\n\n` +
        `مقدار خرید: ${userData.selectedGiftName}\n` +
        `یوزر دریافت‌کننده: @${userData.recipientUsername}\n\n` +
        `گیفت هاید: ${userData.isHided ? 'بله' : 'خیر'}\n` +
        `کامنت: ${userData.commentText}\n\n` +
        `مبلغ نهایی: ${currentAmount.toLocaleString()} تومان\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه «تأیید» کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [
                    { text: '✅ تایید', style: 'success' }, 
                    { text: '❌ لغو خرید', style: 'danger' }
                ],
                [
                    { text: '💳 اعمال کد تخفیف', style: 'primary' }
                ],
                [
                    { text: '💬 تنظیم کامنت', style: 'primary' }, 
                    { text: userData.isHided ? '🔓 لغو هاید' : '🔒 هاید گیفت', style: 'primary' }
                ],
                [
                    { text: 'برگشت ↩️', style: 'danger' }
                ]
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
        `[ فاکتور خرید ارز تون ]\n\n` +
        `مقدار خرید: ${userData.tonAmount} تون\n` +
        `آدرس ولت: \`${userData.tonWalletAddress}\`\n` +
        `کامنت (مم): ${userData.tonMemo}\n\n` +
        `مبلغ نهایی: ${totalPrice.toLocaleString()} تومان\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه «تأیید» کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [
                    { text: '✅ تایید تون', style: 'success' }, 
                    { text: '❌ لغو خرید', style: 'danger' }
                ],
                [
                    { text: '💳 اعمال کد تخفیف', style: 'primary' }
                ],
                [
                    { text: 'برگشت ↩️', style: 'danger' }
                ]
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
        `[ فاکتور ری‌اکشن استارزی ]\n\n` +
        `مقدار خرید: ${userData.reactionCount} استارز\n` +
        `لینک پست: \`${userData.reactionLink}\`\n\n` +
        `مبلغ نهایی: ${totalPrice.toLocaleString()} تومان\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه «تأیید» کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [
                    { text: '✅ تایید ری‌اکشن', style: 'success' }, 
                    { text: '❌ لغو خرید', style: 'danger' }
                ],
                [
                    { text: '💳 اعمال کد تخفیف', style: 'primary' }
                ],
                [
                    { text: 'برگشت ↩️', style: 'danger' }
                ]
            ],
            resize_keyboard: true
        }
    };
    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

// ============================================================================
// MAIN MESSAGE HANDLER
// ============================================================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const contact = msg.contact;
    const photo = msg.photo;
    
    // Dynamic Reactions (without 'Like' reaction)
    if (msg.message_id) {
        await setReaction(chatId, msg.message_id);
    }

    const adminData = getUserDataById(ADMIN_NUMERIC_ID);
    const isAdmin = (chatId.toString() === ADMIN_NUMERIC_ID.toString());
    const userData = getUserData(msg);

    // Banned check
    if (userData.isBanned) {
        await safeSendMessage(chatId, 'حساب کاربری شما توسط ادمین مسدود شده است.');
        return;
    }

    const mainKeyboard = getMainKeyboard(isAdmin);
    const backKeyboard = getBackKeyboard();
    const accountKeyboard = getAccountKeyboard();

    // ============================================================================
    // UNIVERSAL BACK & RESET HANDLER (BULLETPROOF ROUTING)
    // ============================================================================
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
        userData.waitingForTrxAmount = false;
        userData.waitingForTrxWallet = false;
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
                `🎯 کاربردهای استارز :\n\n` +
                `✨ فعال‌سازی ری‌اکشن‌های استارز در چت‌ها\n` +
                `🎯 خرید یا تمدید اکانت پرمیوم تلگرام\n` +
                `💸 پرداخت هزینه تبلیغات تلگرام و تبلیغ کانال یا ربات خود\n\n` +
                `٪ استفاده در خریدهای درون‌برنامه‌ای و مینی‌اپ‌ها\n\n` +
                `✍️ سفارش‌های استارز در کمتر از ۲ دقیقه انجام میشن ، با پشتیبانی کامل و لحظه‌ای!\n\n` +
                `📊 حداقل خرید : 50 استارز\n\n` +
                `🪐 لطفاً تعداد استارز مورد نظر خود را ارسال کنید:`;
            
            const starMenuKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: 'محاسبه با موجودی من 🔄', style: 'success' }],
                        [{ text: 'برگشت ↩️', style: 'danger' }]
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
                        [{ text: 'محاسبه با موجودی من 🔄', style: 'success' }],
                        [{ text: 'برگشت ↩️', style: 'danger' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, reactMsg, reactKeyboard);
            return;
        } else {
            userData.currentShopState = 'main_shop';
            saveDatabase();
            await safeSendMessage(chatId, 'وقته محصول رو انتخاب کنی !\n\n🚀 تمامی سفارشات با بالاترین سرعت و همراه با پشتیبانی کامل انجام میشن !', getShopKeyboard());
            return;
        }
    }

    // ============================================================================
    // ADMIN STATE FLOW
    // ============================================================================

    if (isAdmin && adminData.waitingForOrderRejectReason && text) {
        const orderCode = adminData.rejectOrderCode;
        const reason = text;
        adminData.waitingForOrderRejectReason = false;
        adminData.rejectOrderCode = null;
        saveDatabase();

        const order = db.orders[orderCode];
        if (order) {
            order.status = 'rejected';
            saveDatabase();
            await safeSendMessage(order.userId, `سفارش شما با کد پیگیری \`${orderCode}\` توسط مدیریت رد شد.\n\nدلیل: ${reason}`);
            await safeSendMessage(chatId, `دلیل رد سفارش برای کاربر ارسال شد.`);
        }
        return;
    }

    if (isAdmin && adminData.waitingForReceiptRejectReason && text) {
        const targetUserId = adminData.rejectTargetId;
        const reason = text;
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
            await safeSendMessage(chatId, 'ظرفیت این کد (تعداد دفعات قابل استفاده کل) را وارد کنید:');
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
            await safeSendMessage(chatId, 'ساعت اتمام اعتبار کد به وقت تهران را وارد کنید (عدد 0 تا 23):');
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
                        [{ text: '🌐 بدون محدودیت', style: 'primary' }, { text: '⭐ محدودیت برای استارز', style: 'success' }],
                        [{ text: '💠 محدودیت برای تون', style: 'success' }, { text: '💫 محدودیت برای ری‌اکشن', style: 'success' }],
                        [{ text: '🎁 محدودیت برای گیفت‌ها', style: 'success' }],
                        [{ text: 'برگشت ↩️', style: 'danger' }]
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
                        [
                            { text: '➕ افزایش موجودی کاربر', style: 'success' }, 
                            { text: '➖ کاهش موجودی کاربر', style: 'danger' }
                        ],
                        [
                            { text: '🏆 تغییر سطح کاربر', style: 'primary' }, 
                            { text: '💳 تایید احراز هویت کاربر', style: 'success' }
                        ],
                        [
                            { text: '🚫 بن کردن کاربر', style: 'danger' }, 
                            { text: '✅ آنبن کردن کاربر', style: 'success' }
                        ],
                        [
                            { text: '🏷️ ساخت کد تخفیف', style: 'primary' }
                        ],
                        [
                            { text: '🔙 بازگشت به منوی اصلی', style: 'danger' }
                        ]
                    ], 
                    resize_keyboard: true
                }
            };

            await safeSendMessage(chatId, 
                `کد تخفیف ساخته شد\n\n` +
                `کد: \`${code}\`\n` +
                `درصد تخفیف: ${adminData.tempDiscount.percent}%\n` +
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
            await safeSendMessage(targetUserToReply, `پاسخ پشتیبانی از طرف مدیریت:\n\n${text}`);
            await safeSendMessage(chatId, `پاسخ شما با موفقیت به کاربر مورد نظر ارسال شد.`);
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
                await safeSendMessage(chatId, `کاربر \`${targetId}\` بن شد.`);
                adminData.adminAction = null;
                adminData.targetUserId = null;
                return;
            } else if (adminData.adminAction === '✅ آنبن کردن کاربر') {
                targetUser.isBanned = false;
                saveDatabase();
                await safeSendMessage(chatId, `کاربر \`${targetId}\` آنبن شد.`);
                adminData.adminAction = null;
                adminData.targetUserId = null;
                return;
            } else if (adminData.adminAction === '💳 تایید احراز هویت کاربر') {
                targetUser.cardVerified = true;
                targetUser.level = 'سطح 2';
                saveDatabase();
                await safeSendMessage(chatId, `احراز هویت و حساب کاربری \`${targetId}\` تایید شد.`);
                adminData.adminAction = null;
                adminData.targetUserId = null;
                return;
            }

            adminData.waitingForAdminAmount = true;
            saveDatabase();
            if (adminData.adminAction === '➕ افزایش موجودی کاربر') await safeSendMessage(chatId, `چند هزار تومان افزوده شود؟ (فقط عدد):`);
            else if (adminData.adminAction === '➖ کاهش موجودی کاربر') await safeSendMessage(chatId, `چند هزار تومان کسر شود؟ (فقط عدد):`);
            else if (adminData.adminAction === '🏆 تغییر سطح کاربر') await safeSendMessage(chatId, `نام سطح جدید را وارد کنید:`);
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
                    await safeSendMessage(targetId, `مبلغ ${amount.toLocaleString()} تومان به حساب شما واریز شد.`);
                }
            } else if (action === '➖ کاهش موجودی کاربر') {
                const amount = parseInt(text);
                if (!isNaN(amount)) {
                    targetUser.wallet = Math.max(0, targetUser.wallet - amount);
                    saveDatabase();
                    await safeSendMessage(chatId, `${amount.toLocaleString()} تومان کسر شد.`);
                }
            } else if (action === '🏆 تغییر سطح کاربر') {
                targetUser.level = text.trim();
                saveDatabase();
                await safeSendMessage(chatId, `سطح کاربر به "${targetUser.level}" تغییر یافت.`);
            }

            adminData.adminAction = null;
            adminData.targetUserId = null;
            adminData.waitingForAdminAmount = false;
            saveDatabase();
            return;
        }
    }

    // ============================================================================
    // TRX & BOOST NEW FLOWS
    // ============================================================================

    if (userData.waitingForTrxAmount && text) {
        if (text === 'محاسبه با موجودی من 🔄') {
            const balanceTrx = (userData.wallet / userData.trxPricePerUnit).toFixed(2);
            await safeSendMessage(chatId, `موجودی شما: ${userData.wallet.toLocaleString()} تومان\nمعادل حدود ${balanceTrx} TRX می‌توانید خریداری کنید.\nلطفاً تعداد ترون را وارد کنید:`, backKeyboard);
            return;
        }

        const trxInput = parseFloat(text);
        if (isNaN(trxInput) || trxInput < 10) {
            await safeSendMessage(chatId, '❌ مقدار نامعتبر!\nحداقل خرید ۱۰ ترون است.', backKeyboard);
            return;
        }
        userData.trxAmount = trxInput;
        userData.waitingForTrxAmount = false;
        userData.waitingForTrxWallet = true;
        saveDatabase();

        await safeSendMessage(chatId, `[ آدرس ولت ترون ( TRX ) ]\n\nلطفاً آدرس ولت TRC20 خود را ارسال کنید:`, backKeyboard);
        return;
    }

    if (userData.waitingForTrxWallet && text) {
        userData.trxWalletAddress = text.trim();
        userData.waitingForTrxWallet = false;
        userData.currentShopState = 'trx_invoice';
        saveDatabase();
        await showTrxInvoice(chatId, userData);
        return;
    }

    if (userData.waitingForBoostLink && text) {
        userData.boostLink = text.trim();
        userData.waitingForBoostLink = false;
        userData.waitingForBoostMonths = true;
        saveDatabase();

        const monthKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: '1 ماهه', style: 'success' }, { text: '3 ماهه', style: 'success' }],
                    [{ text: '6 ماهه', style: 'success' }, { text: '12 ماهه', style: 'success' }],
                    [{ text: 'برگشت ↩️', style: 'danger' }]
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
    // USER WAITING STATES & INPUTS
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

        const selfName = msg.from.first_name || 'کاربر';
        const recipientKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: `برای خودم ( ${selfName} ) 🪪`, style: 'success' }],
                    [{ text: 'برگشت ↩️', style: 'danger' }]
                ],
                resize_keyboard: true
            }
        };
        const recipientMsg = 
            `🔗 انتخاب اکانت دریافت‌کننده\n\n` +
            `✔️ اگر قصد خرید برای اکانت خودتان را دارید ، روی دکمه «برای خودم» کلیک کنید.\n\n` +
            `✔️ اگر قصد خرید برای شخص دیگری را دارید ، یوزرنیم ( آیدی ) تلگرام او را بدون علامت @ ارسال کنید.\n\n` +
            `✔️ Pedarfarsi\n❌ @Pedarfarsi`;
        
        await safeSendPhoto(chatId, '1000002625.jpg', { caption: recipientMsg, reply_markup: recipientKeyboard.reply_markup });
        return;
    }

    if (userData.currentShopState === 'star_recipient' && text) {
        let usernameInput = text.trim();
        if (usernameInput.includes('برای خودم')) {
            usernameInput = msg.from.username || msg.from.first_name || 'کاربر';
        }
        if (usernameInput.startsWith('@')) usernameInput = usernameInput.substring(1);

        userData.starRecipient = usernameInput;
        userData.currentShopState = 'star_invoice';
        saveDatabase();

        await showStarInvoice(chatId, userData);
        return;
    }

    if (userData.waitingForTonAmount && text) {
        if (text === 'محاسبه با موجودی من 🔄') {
            const balanceTon = (userData.wallet / userData.tonPricePerUnit).toFixed(2);
            await safeSendMessage(chatId, `موجودی شما: ${userData.wallet.toLocaleString()} تومان\nمعادل حدود ${balanceTon} تون می‌توانید خریداری کنید.\nلطفاً تعداد تون را وارد کنید:`, backKeyboard);
            return;
        }

        const tonInput = parseFloat(text);
        if (isNaN(tonInput) || tonInput < 0.1) {
            await safeSendMessage(chatId, '❌ مقدار نامعتبر!\nحداقل خرید ۰.۱ تون است.', backKeyboard);
            return;
        }
        userData.tonAmount = tonInput;
        userData.waitingForTonAmount = false;
        userData.waitingForTonWallet = true;
        saveDatabase();

        await safeSendMessage(chatId, `[ آدرس ولت تون ( TON ) ]\n\nلطفاً آدرس ولت تون خود را ارسال کنید:`, backKeyboard);
        return;
    }

    if (userData.waitingForReactionCount && text) {
        if (text === 'محاسبه با موجودی من 🔄') {
            const maxR = Math.floor(userData.wallet / userData.starPricePerUnit);
            await safeSendMessage(chatId, `موجودی شما: ${userData.wallet.toLocaleString()} تومان\nحداکثر ${maxR} استارز می‌توانید ری‌اکشن بزنید.\nلطفاً تعداد را ارسال کنید:`, backKeyboard);
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
                    [{ text: '💬 بله، کامنت دارم', style: 'success' }, { text: '❌ رد کردن', style: 'danger' }],
                    [{ text: 'برگشت ↩️', style: 'danger' }]
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

        const trackResultMsg = `[ نتیجه پیگیری سفارش ]\n\nکد پیگیری: \`${trackingCode}\`\nمحصول: ${order.giftName}\nمبلغ نهایی: ${order.amount.toLocaleString()} تومان\nوضعیت: ${statusStr}`;
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

        await safeSendMessage(chatId, `کد تخفیف ${discountObj.percent}% با موفقیت روی فاکتور شما اعمال شد!`, backKeyboard);
        
        if (userData.currentShopState === 'gift_invoice') await showGiftInvoice(chatId, userData);
        else if (userData.currentShopState === 'star_invoice') await showStarInvoice(chatId, userData);
        else if (userData.currentShopState === 'ton_invoice') await showTonInvoice(chatId, userData);
        else if (userData.currentShopState === 'trx_invoice') await showTrxInvoice(chatId, userData);
        else if (userData.currentShopState === 'reaction_invoice') await showReactionInvoice(chatId, userData);
        else if (userData.currentShopState === 'boost_invoice') await showBoostInvoice(chatId, userData);
        return;
    }

    // ============================================================================
    // MENU ACTIONS & SHOP INTERACTIONS
    // ============================================================================

    if (text === 'محاسبه با موجودی من 🔄' && userData.currentShopState === 'star_menu') {
        const maxStars = Math.floor(userData.wallet / (userData.starPricePerUnit || 3865));
        await safeSendMessage(chatId, `موجودی شما: ${userData.wallet.toLocaleString()} تومان\nحداکثر می‌توانید ${maxStars} استارز بخرید.\nلطفاً تعداد را ارسال کنید:`, backKeyboard);
        return;
    }

    if (text === 'اعمال تخفیف 🎁' && userData.currentShopState === 'star_invoice') {
        const availableDiscountWallet = userData.discountWallet || 1766;
        if (availableDiscountWallet <= 0) {
            await safeSendMessage(chatId, 'موجودی کیف پول تخفیف شما کافی نیست.', backKeyboard);
        } else {
            await safeSendMessage(chatId, `تخفیف به مبلغ ${availableDiscountWallet.toLocaleString()} تومان روی فاکتور شما اعمال گردید.`);
        }
        return;
    }

    if (text === 'اعمال کد تخفیف 🎫' && (userData.currentShopState === 'star_invoice' || userData.currentShopState === 'trx_invoice' || userData.currentShopState === 'boost_invoice')) {
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

        const userConfirmMsg = `سفارش شما با این فاکتور ثبت و منتظر واریزی هستیم\n\nکد پیگیری: \`${trackingCode}\`\nمقدار: ${userData.starCount} استارز\nمبلغ نهایی: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `[ سفارش جدید خرید استارز ]\n\nکاربر: ${userData.firstName} (${chatId})\nکد پیگیری: \`${trackingCode}\`\nمقدار: ${userData.starCount} استارز\nیوزر دریافت‌کننده: @${userData.starRecipient}\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                        { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                    ]
                ]
            }
        };

        await safeSendMessage(ADMIN_NUMERIC_ID, adminOrderMsg, adminOrderMarkup);
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    if (text === '✅ تایید ترون' && userData.currentShopState === 'trx_invoice') {
        const trackingCode = 'TRX-' + Math.floor(10000 + Math.random() * 90000);
        const now = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });

        db.orders[trackingCode] = {
            userId: chatId,
            firstName: userData.firstName,
            giftName: `ارز ترون (${userData.trxAmount} TRX)`,
            count: userData.trxAmount,
            recipient: userData.trxWalletAddress,
            isHided: false,
            comment: 'ندارد',
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        const userConfirmMsg = `سفارش شما با این فاکتور ثبت و منتظر واریزی هستیم\n\nکد پیگیری: \`${trackingCode}\`\nمقدار: ${userData.trxAmount} TRX\nمبلغ نهایی: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `[ سفارش جدید خرید ترون ]\n\nکاربر: ${userData.firstName} (${chatId})\nکد پیگیری: \`${trackingCode}\`\nمقدار: ${userData.trxAmount} TRX\nآدرس ولت: \`${userData.trxWalletAddress}\`\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                        { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                    ]
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

        const userConfirmMsg = `سفارش شما با این فاکتور ثبت و منتظر واریزی هستیم\n\nکد پیگیری: \`${trackingCode}\`\nمدت: ${userData.boostMonths} ماهه\nمبلغ نهایی: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `[ سفارش جدید بوست تلگرام ]\n\nکاربر: ${userData.firstName} (${chatId})\nکد پیگیری: \`${trackingCode}\`\nمدت: ${userData.boostMonths} ماه\nلینک: \`${userData.boostLink}\`\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                        { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                    ]
                ]
            }
        };

        await safeSendMessage(ADMIN_NUMERIC_ID, adminOrderMsg, adminOrderMarkup);
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    if (text === 'لغو خرید ❌' && (userData.currentShopState === 'star_invoice' || userData.currentShopState === 'trx_invoice' || userData.currentShopState === 'boost_invoice')) {
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

        const userConfirmMsg = `سفارش شما با این فاکتور ثبت و منتظر واریزی هستیم\n\nکد پیگیری: \`${trackingCode}\`\nمحصول: ${userData.selectedGiftName} (تعداد: ${userData.giftCount})\nمبلغ نهایی: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `[ سفارش جدید گیفت ]\n\nکاربر: ${userData.firstName} (${chatId})\nکد پیگیری: \`${trackingCode}\`\nمحصول: ${userData.selectedGiftName} (تعداد: ${userData.giftCount})\nیوزر دریافت‌کننده: @${userData.recipientUsername}\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                        { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                    ]
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

        const userConfirmMsg = `سفارش شما با این فاکتور ثبت و منتظر واریزی هستیم\n\nکد پیگیری: \`${trackingCode}\`\nمقدار: ${userData.tonAmount} تون\nمبلغ نهایی: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `[ سفارش جدید خرید تون ]\n\nکاربر: ${userData.firstName} (${chatId})\nکد پیگیری: \`${trackingCode}\`\nمقدار: ${userData.tonAmount} TON\nآدرس ولت: \`${userData.tonWalletAddress}\`\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                        { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                    ]
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

        const userConfirmMsg = `سفارش شما با این فاکتور ثبت و منتظر واریزی هستیم\n\nکد پیگیری: \`${trackingCode}\`\nمقدار: ${userData.reactionCount} استارز\nمبلغ نهایی: ${userData.lastAmount.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userConfirmMsg, mainKeyboard);

        const adminOrderMsg = `[ سفارش جدید ری‌اکشن ]\n\nکاربر: ${userData.firstName} (${chatId})\nکد پیگیری: \`${trackingCode}\`\nلینک پست: \`${userData.reactionLink}\`\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`;
        const adminOrderMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` },
                        { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }
                    ]
                ]
            }
        };

        await safeSendMessage(ADMIN_NUMERIC_ID, adminOrderMsg, adminOrderMarkup);
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    // ============================================================================
    // RECEIPT UPLOAD (WITH BULLETPROOF BACK LOGIC COVERAGE)
    // ============================================================================
    
    if (photo && userData.waitingForReceipt) {
        const photoId = photo[photo.length - 1].file_id;
        userData.waitingForReceipt = false;
        saveDatabase();
        
        const amount = userData.lastAmount;
        const adminCaption = `[ رسید پرداخت جدید ]\n\nنام کاربر: ${userData.firstName}\nآیدی عددی: \`${chatId}\`\nمبلغ: ${amount.toLocaleString()} تومان`;
        const adminMarkup = {
            inline_keyboard: [
                [
                    { text: '✅ تایید', callback_data: `approve_receipt_${chatId}_${amount}` }, 
                    { text: '❌ رد', callback_data: `reject_receipt_${chatId}` }
                ]
            ]
        };

        try {
            await bot.sendPhoto(ADMIN_NUMERIC_ID, photoId, { 
                caption: adminCaption, 
                parse_mode: 'Markdown', 
                reply_markup: adminMarkup 
            });
        } catch (e) { 
            console.error(e.message); 
        }

        const userMarkup = {
            inline_keyboard: [
                [{ text: '💬 پیگیری رسید', callback_data: 'track_receipt_main' }]
            ]
        };
        
        const receiptMsg = `✅ رسید شما با موفقیت دریافت شد !\n\n💰 پس از تأیید رسید شما توسط مدیریت ، سفارش به‌صورت خودکار ثبت و پردازش می‌شود.`;
        await safeSendMessage(chatId, receiptMsg, { reply_markup: userMarkup });
        return;
    }

    if (contact) {
        let phoneNum = contact.phone_number;
        if (!phoneNum.startsWith('+')) phoneNum = '+' + phoneNum;
        if (phoneNum.startsWith('+98')) {
            userData.phone = phoneNum;
            userData.verified = 'انجام شده';
            saveDatabase();
            await safeSendMessage(chatId, `شماره موبایل شما (${phoneNum}) با موفقیت تایید شد!`, mainKeyboard);
        }
        return;
    }

    if (userData.waitingForTicket && text) {
        userData.waitingForTicket = false;
        saveDatabase();
        await safeSendMessage(chatId, 'تیکت شما با موفقیت ارسال شد.', backKeyboard);
        
        const adminTicketMsg = `تیکت جدید:\nنام: ${userData.firstName}\nآیدی: \`${chatId}\`\nمتن:\n${text}`;
        const replyMarkup = { 
            reply_markup: { 
                inline_keyboard: [
                    [{ text: '💬 پاسخ به کاربر', callback_data: `reply_${chatId}` }]
                ] 
            } 
        };
        await safeSendMessage(ADMIN_NUMERIC_ID, adminTicketMsg, replyMarkup);
        return;
    }

    // ============================================================================
    // MENU ACTIONS (COMMANDS)
    // ============================================================================
    if (text && text.startsWith('/start')) {
        userData.currentShopState = null;
        saveDatabase();
        const welcomeText = `بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ\n\nبه استارزپلاس خوش آمدید ! 🌟\nمجموعه‌ای کامل برای خدمات تلگرامی شما.`;
        await safeSendPhoto(chatId, '1000002624.jpg', { caption: welcomeText, reply_markup: mainKeyboard.reply_markup });
        return;
    } 

    if (text === '🔧 پنل مدیریت' && isAdmin) {
        const adminPanelMarkup = {
            reply_markup: {
                keyboard: [
                    [
                        { text: '➕ افزایش موجودی کاربر', style: 'success' }, 
                        { text: '➖ کاهش موجودی کاربر', style: 'danger' }
                    ],
                    [
                        { text: '🏆 تغییر سطح کاربر', style: 'primary' }, 
                        { text: '💳 تایید احراز هویت کاربر', style: 'success' }
                    ],
                    [
                        { text: '🚫 بن کردن کاربر', style: 'danger' }, 
                        { text: '✅ آنبن کردن کاربر', style: 'success' }
                    ],
                    [
                        { text: '🏷️ ساخت کد تخفیف', style: 'primary' }
                    ],
                    [
                        { text: '🔙 بازگشت به منوی اصلی', style: 'danger' }
                    ]
                ], resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, 'پنل مدیریت:', adminPanelMarkup);
    }
    else if (isAdmin && ['➕ افزایش موجودی کاربر', '➖ کاهش موجودی کاربر', '🏆 تغییر سطح کاربر', '💳 تایید احراز هویت کاربر', '🚫 بن کردن کاربر', '✅ آنبن کردن کاربر'].includes(text)) {
        adminData.adminAction = text;
        adminData.waitingForAdminUserSearch = true;
        saveDatabase();
        await safeSendMessage(chatId, `لطفاً آیدی عددی کاربر را وارد کنید:`);
    }
    else if (isAdmin && text === '🏷️ ساخت کد تخفیف') {
        adminData.waitingForDiscountPercent = true;
        saveDatabase();
        await safeSendMessage(chatId, 'چند درصد تخفیف می‌خواهید بسازید؟ (فقط عدد بین 1 تا 100):');
    }
    else if (text === '🛒 خرید محصول') {
        userData.currentShopState = 'main_shop';
        saveDatabase();
        await safeSendMessage(chatId, 'وقته محصول رو انتخاب کنی !\n\n🚀 تمامی سفارشات با بالاترین سرعت و همراه با پشتیبانی کامل انجام میشن !', getShopKeyboard());
    }
    else if (text === '⭐️ استارز' || text === '⭐ استارز تلگرام (Telegram Stars)') {
        userData.currentShopState = 'star_menu';
        userData.waitingForStarCount = true;
        const starsPrice = await fetchStarsPrice();
        userData.starPricePerUnit = starsPrice;
        saveDatabase();

        const starMsg = 
            `💥 وقت درخشیدن با استارز تلگرامه !\n\n` +
            `🎯 کاربردهای استارز :\n\n` +
            `✨ فعال‌سازی ری‌اکشن‌های استارز در چت‌ها\n` +
            `🎯 خرید یا تمدید اکانت پرمیوم تلگرام\n` +
            `💸 پرداخت هزینه تبلیغات تلگرام و تبلیغ کانال یا ربات خود\n\n` +
            `٪ استفاده در خریدهای درون‌برنامه‌ای و مینی‌اپ‌ها\n\n` +
            `✍️ سفارش‌های استارز در کمتر از ۲ دقیقه انجام میشن ، با پشتیبانی کامل و لحظه‌ای!\n\n` +
            `📊 حداقل خرید : 50 استارز\n\n` +
            `🪐 لطفاً تعداد استارز مورد نظر خود را ارسال کنید:`;

        const starMenuKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: 'محاسبه با موجودی من 🔄', style: 'success' }],
                    [{ text: 'برگشت ↩️', style: 'danger' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendPhoto(chatId, '1000002624.jpg', { caption: starMsg, reply_markup: starMenuKeyboard.reply_markup });
    }
    else if (text === '🔴 خرید ارز ترون (TRX)') {
        userData.currentShopState = 'trx_flow';
        saveDatabase();
        const trxData = await fetchTrxData();
        userData.trxPricePerUnit = trxData.finalPrice;
        saveDatabase();

        const trxFlowKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: 'محاسبه با موجودی من 🔄', style: 'success' }],
                    [{ text: 'برگشت ↩️', style: 'danger' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, `لطفاً تعداد ترون (TRX) مورد نظر خود را وارد کنید:`, trxFlowKeyboard);
        userData.waitingForTrxAmount = true;
        saveDatabase();
    }
    else if (text === '✨ بوست تلگرام') {
        userData.currentShopState = 'boost_flow';
        saveDatabase();
        
        await safeSendMessage(chatId, `لطفاً لینک کانال تلگرامی که قصد بوست کردن آن را دارید ارسال کنید:`, backKeyboard);
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
                    [{ text: 'محاسبه با موجودی من 🔄', style: 'success' }],
                    [{ text: 'برگشت ↩️', style: 'danger' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, `• لطفاً تعداد ری‌اکشن استارزی موردنظر خود را ارسال کنید 👇`, reactionMenuKeyboard);
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
                    [{ text: 'محاسبه با موجودی من 🔄', style: 'success' }],
                    [{ text: 'برگشت ↩️', style: 'danger' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, `لطفاً تعداد تون مورد نظر خود را وارد کنید:`, tonWalletFlowKeyboard);
        userData.waitingForTonAmount = true;
        saveDatabase();
    }
    else if (text === '🎁 گیفت استارزی' || text === '🎁 گیفت‌های استارزی') {
        userData.currentShopState = 'gift_category';
        saveDatabase();
        const giftCategoryKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: '🧸 گیفت های عادی', style: 'success' }],
                    [{ text: 'برگشت ↩️', style: 'danger' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, 'لطفاً دسته‌بندی گیفت مورد نظر خود را انتخاب کنید :', giftCategoryKeyboard);
    }
    else if (text === '🧸 گیفت های عادی') {
        userData.currentShopState = 'gift_list';
        saveDatabase();
        const giftListKeyboard = {
            reply_markup: {
                keyboard: [
                    [
                        { text: '💖 گیفت قلب (15)', style: 'success' }, 
                        { text: '🧸 گیفت تدی (15)', style: 'success' }
                    ],
                    [
                        { text: '🎁 گیفت کادو (25)', style: 'success' }, 
                        { text: '🌹 گیفت گل رز (25)', style: 'success' }
                    ],
                    [
                        { text: '🎂 گیفت کیک (50)', style: 'success' }, 
                        { text: '🌷 گیفت گل (50)', style: 'success' }
                    ],
                    [
                        { text: '🍾 گیفت بطری (50)', style: 'success' }, 
                        { text: '🚀 گیفت سفینه (50)', style: 'success' }
                    ],
                    [
                        { text: '🏆 گیفت جام (100)', style: 'success' }, 
                        { text: '💍 گیفت حلقه (100)', style: 'success' }
                    ],
                    [
                        { text: 'برگشت ↩️', style: 'danger' }
                    ]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, 'لطفاً گیفت مورد نظر خود را انتخاب کنید', giftListKeyboard);
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
                    [
                        { text: '🔻 کم کردن', style: 'danger' }, 
                        { text: '📊 تعداد', style: 'primary' }, 
                        { text: '🟢 اضافه کردن', style: 'success' }
                    ],
                    [
                        { text: '➖', style: 'danger' }, 
                        { text: `${userData.giftCount}`, style: 'primary' }, 
                        { text: '➕', style: 'success' }
                    ],
                    [
                        { text: 'برگشت ↩️', style: 'danger' }, 
                        { text: '✅ ادامه', style: 'success' }
                    ]
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
                        [
                            { text: '🔻 کم کردن', style: 'danger' }, 
                            { text: '📊 تعداد', style: 'primary' }, 
                            { text: '🟢 اضافه کردن', style: 'success' }
                        ],
                        [
                            { text: '➖', style: 'danger' }, 
                            { text: `${userData.giftCount}`, style: 'primary' }, 
                            { text: '➕', style: 'success' }
                        ],
                        [
                            { text: 'برگشت ↩️', style: 'danger' }, 
                            { text: '✅ ادامه', style: 'success' }
                        ]
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
                        [
                            { text: '🔻 کم کردن', style: 'danger' }, 
                            { text: '📊 تعداد', style: 'primary' }, 
                            { text: '🟢 اضافه کردن', style: 'success' }
                        ],
                        [
                            { text: '➖', style: 'danger' }, 
                            { text: `${userData.giftCount}`, style: 'primary' }, 
                            { text: '➕', style: 'success' }
                        ],
                        [
                            { text: 'برگشت ↩️', style: 'danger' }, 
                            { text: '✅ ادامه', style: 'success' }
                        ]
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
            const selfName = msg.from.first_name || 'کاربر';
            userData.recipientUsername = msg.from.username || selfName;
            saveDatabase();

            const recipientKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: `برای خودم ( ${selfName} ) 🪪`, style: 'success' }],
                        [{ text: 'برگشت ↩️', style: 'danger' }]
                    ],
                    resize_keyboard: true
                }
            };
            
            const recipientMsg = `انتخاب اکانت دریافت‌کننده\n\nاگر قصد خرید برای اکانت خودتان را دارید، روی دکمه «برای خودم» کلیک کنید.\n\nاگر قصد خرید برای شخص دیگری را دارید، یوزرنیم ( آیدی ) تلگرام او را بدون علامت @ ارسال کنید.`;
            await safeSendMessage(chatId, recipientMsg, recipientKeyboard);
        }
    }
    else if (text && text.startsWith('برای خودم')) {
        userData.recipientUsername = msg.from.username || msg.from.first_name;
        userData.currentShopState = 'gift_invoice';
        saveDatabase();
        await showGiftInvoice(chatId, userData);
    }
    else if (text === '💳 اعمال کد تخفیف') {
        userData.waitingForDiscountInput = true;
        saveDatabase();
        await safeSendMessage(chatId, 'لطفاً کد تخفیف خود را ارسال کنید:', backKeyboard);
    }
    else if (text === '💬 تنظیم کامنت') {
        userData.waitingForComment = true;
        saveDatabase();
        await safeSendMessage(chatId, 'کامنت دلخواه خودتون ارسال کنید:', backKeyboard);
    }
    else if (text === '🔒 هاید گیفت' || text === '🔓 لغو هاید') {
        userData.isHided = !userData.isHided;
        saveDatabase();
        if (userData.currentShopState === 'gift_invoice') await showGiftInvoice(chatId, userData);
    }
    else if (text === '❤️ چه طور میتوانم به شما اعتماد کنم' || text === '❤️ چطور میتوانم به شما اعتماد کنم') {
        const trustMsg = `استارزپلاس با دارا بودن نماد اعتماد و رضایت هزاران مشتری فعال در خدمت شماست.\n\nکانال اعتماد مشتریان:\n@snt_shopp`;
        await safeSendMessage(chatId, trustMsg, backKeyboard);
    }
    else if (text === '📦 پیگیری سفارش') {
        userData.waitingForTrackingInput = true;
        saveDatabase();
        await safeSendMessage(chatId, `لطفاً کد پیگیری سفارش خود را ارسال کنید:`, backKeyboard);
    }
    else if (text === '💳 حساب کاربری') {
        const userInfo = `حساب کاربری شما\n\nنام : ${userData.firstName}\nآیدی عددی : \`${chatId}\`\nموجودی اصلی: ${userData.wallet.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userInfo, accountKeyboard);
    }
    else if (text === '➕ افزایش موجودی') {
        const increaseKeyboard = { 
            reply_markup: { 
                keyboard: [
                    [{ text: '💳 پرداخت ریالی', style: 'success' }], 
                    [{ text: '🔙 بازگشت به منوی اصلی', style: 'danger' }]
                ], 
                resize_keyboard: true 
            } 
        };
        await safeSendMessage(chatId, `افزایش موجودی حساب...`, increaseKeyboard);
    }
    else if (text === '💳 پرداخت ریالی') {
        userData.waitingForAmount = true;
        saveDatabase();
        await safeSendMessage(chatId, `لطفاً مبلغی که می‌خواهید حساب خود را شارژ کنید وارد نمایید (به تومان - فقط عدد):`, backKeyboard);
    }
    else if (userData.waitingForAmount && /^\d+$/.test(text)) {
        const enteredAmount = parseInt(text);
        userData.waitingForAmount = false;
        userData.lastAmount = enteredAmount;
        userData.waitingForReceipt = true;
        saveDatabase();
        
        const cardPaymentMsg = `مبلغ انتخابی شما: ${userData.lastAmount.toLocaleString()} تومان\n\nلطفاً مبلغ مورد نظر را به شماره کارت زیر واریز کنید:\n\`6219861452862914\`\nبه نام: شنتیا زاهد پور\n\nو پس از انجام پرداخت، عکس رسید بانکی خود را همینجا ارسال نمایید`;
        const paymentKeyboard = {
            reply_markup: {
                inline_keyboard: [[{ text: '🏷️ اعمال کد تخفیف', callback_data: 'apply_discount_prompt' }]],
                keyboard: [[{ text: 'برگشت ↩️', style: 'danger' }]], 
                resize_keyboard: true 
            }
        };
        await safeSendMessage(chatId, cardPaymentMsg, paymentKeyboard);
    }
    else if (text === '📞 پشتیبانی') {
        const supportKeyboard = { 
            reply_markup: { 
                keyboard: [
                    [
                        { text: '👤 پشتیبانی مستقیم', style: 'primary' }, 
                        { text: '🎫 ارسال تیکت (غیرمستقیم)', style: 'primary' }
                    ], 
                    [
                        { text: '🔙 بازگشت به منوی اصلی', style: 'danger' }
                    ]
                ], 
                resize_keyboard: true 
            } 
        };
        await safeSendMessage(chatId, `بخش پشتیبانی:`, supportKeyboard);
    }
    else if (text === '👤 پشتیبانی مستقیم') await safeSendMessage(chatId, `ارتباط مستقیم با ادمین:\n${ADMIN_ID_USERNAME}`, backKeyboard);
    else if (text === '🎫 ارسال تیکت (غیرمستقیم)') {
        userData.waitingForTicket = true;
        saveDatabase();
        await safeSendMessage(chatId, `لطفا پیام خود را ارسال کنید:`, backKeyboard);
    }
    else if (text === '📦 سفارش های اخیر من' || text === 'سفارش های اخیر من 📥') {
        let userOrders = Object.entries(db.orders).filter(([code, order]) => order.userId === chatId);
        if (userOrders.length === 0) {
            await safeSendMessage(chatId, 'شما سفارشی ثبت نکرده‌اید.', backKeyboard);
        } else {
            let msgText = `[ سفارش‌های اخیر شما ]\n\n`;
            userOrders.slice(-5).forEach(([code, order]) => {
                msgText += `📦 کد پیگیری: \`${code}\`\nمحصول: ${order.giftName}\nمبلغ: ${order.amount.toLocaleString()} تومان\n\n`;
            });
            await safeSendMessage(chatId, msgText, backKeyboard);
        }
    }
    else if (text === '📦 سفارش های معلق من') {
        let userOrders = Object.entries(db.orders).filter(([code, order]) => order.userId === chatId && order.status === 'pending');
        if (userOrders.length === 0) {
            await safeSendMessage(chatId, 'سفارش معلقی ندارید.', backKeyboard);
        } else {
            let msgText = `[ سفارش‌های معلق شما ]\n\n`;
            userOrders.forEach(([code, order]) => {
                msgText += `📦 کد پیگیری: \`${code}\`\nمحصول: ${order.giftName}\n\n`;
            });
            await safeSendMessage(chatId, msgText, backKeyboard);
        }
    }
});

// ============================================================================
// CALLBACK QUERY HANDLER
// ============================================================================

bot.on('callback_query', async (callbackQuery) => {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userData = getUserDataById(chatId);

    if (action === 'track_receipt_main') {
        const supportMarkup = {
            inline_keyboard: [
                [
                    { text: '👤 پشتیبانی مستقیم', callback_data: 'support_direct' }, 
                    { text: '🎫 ارسال تیکت (غیرمستقیم)', callback_data: 'support_ticket' }
                ]
            ]
        };
        await safeSendMessage(chatId, 'جهت پیگیری رسید، یکی از گزینه‌های پشتیبانی زیر را انتخاب کنید:', { reply_markup: supportMarkup });
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action.startsWith('order_done_')) {
        const trackingCode = action.replace('order_done_', '');
        const order = db.orders[trackingCode];
        if (order) {
            order.status = 'completed';
            saveDatabase();
            await safeSendMessage(order.userId, `سفارش شما با کد \`${trackingCode}\` تکمیل و توسط مدیریت تایید شد.`);
            try {
                await bot.editMessageText(`[ سفارش تایید شد ]\n\nکد پیگیری: \`${trackingCode}\`\nتوسط ادمین تایید گردید.`, {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    parse_mode: 'Markdown'
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

        await safeSendMessage(targetId, `رسید شما تایید و مبلغ ${amount.toLocaleString()} تومان به حساب شما واریز شد.`);
        try {
            await bot.editMessageCaption(`[ رسید پرداخت تایید شد ]\n\nآیدی عددی: \`${targetId}\`\nمبلغ: ${amount.toLocaleString()} تومان`, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
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
        await safeSendMessage(chatId, `پیام خود را برای پشتیبانی بنویسید:`);
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
});
