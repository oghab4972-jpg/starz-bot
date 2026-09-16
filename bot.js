const TelegramModule = require('node-telegram-bot-api');
const fs = require('fs');
const https = require('https');

const TelegramBot = typeof TelegramModule === 'function' 
    ? TelegramModule 
    : (TelegramModule.default || TelegramModule.TelegramBot || Object.values(TelegramModule).find(v => typeof v === 'function') || TelegramModule);

const TOKEN = '8222630500:AAGcdGZ76BQz1AHju4tZQMZzpOUEkJIqzF8';
const ADMIN_ID_USERNAME = '@shantiaNFT';
const ADMIN_NUMERIC_ID = 8942987641;
const DB_FILE = './database.json';

const bot = new TelegramBot(TOKEN, { 
    polling: { 
        interval: 300, 
        autoStart: true,
        params: { timeout: 10 }
    }, 
    filepath: false 
});

process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection:', reason); });

let db = { users: {}, orders: {}, discountCodes: {}, settings: {} };

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
            if (!db.settings) db.settings = {};
        }
    } catch (e) {
        console.error('Error loading database:', e.message);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving database:', e.message);
    }
}

loadDatabase();
console.log('StarzPlus Bot is running with Live Smart Price Engine (+20k Profit)!');

function getUserDataById(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            firstName: 'کاربر',
            phone: 'ثبت نشده',
            verified: 'انجام نشده',
            cardVerified: false,
            isBanned: false,
            level: 'سطح 1',
            totalSpent: 0,
            score: 0,
            wallet: 6411,
            discountWallet: 1766,
            waitingForAmount: false,
            waitingForTicket: false,
            waitingForReceipt: false, 
            waitingForDiscountInput: false,
            waitingForRecipient: false,
            waitingForComment: false,
            waitingForTrackingInput: false,
            waitingForTonAmount: false,
            waitingForTonWallet: false,
            waitingForTonMemoChoice: false,
            waitingForTonMemoInput: false,
            waitingForReactionCount: false,
            waitingForReactionLink: false,
            reactionCount: 5,
            reactionLink: '',
            starPricePerUnit: 5150,
            lastAmount: 0,
            appliedDiscountCode: null,
            appliedDiscountPercent: 0,
            currentShopState: null, 
            selectedGiftName: '',
            selectedGiftStars: 0,
            giftCount: 1,
            recipientUsername: '',
            isHided: false,
            commentText: 'تنظیم نشده',
            tonAmount: 0,
            tonPricePerUnit: 0,
            tonWalletAddress: '',
            tonMemo: 'ندارد',
            waitingForAdminUserSearch: false,
            waitingForAdminAmount: false,
            waitingForRejectReason: false,
            waitingForOrderRejectReason: false,
            rejectOrderCode: null,
            adminAction: null,
            targetUserId: null,
            rejectTargetId: null,
            adminReplyingTo: null,
            tempDiscount: { percent: 0, capacity: 0, expiryHour: 0, restriction: null },
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

async function safeSendMessage(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
    } catch (err) {
        console.error(`Failed to send message to ${chatId}:`, err.message);
    }
}

function fetchLiveUsdtRate() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.nobitex.ir',
            path: '/v2/orderbook/USDTIRT',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const usdtToman = parseFloat(json.lastTradePrice) / 10;
                    resolve(usdtToman > 0 ? usdtToman : 65000);
                } catch (e) {
                    resolve(65000);
                }
            });
        }).on('error', () => {
            resolve(65000);
        });
    });
}

// محاسبه اتوماتیک قیمت تون: نرخ تتر صرافی * 5.5 (قیمت جهانی تون) + 20 هزار تومان سود
function fetchTonData() {
    return new Promise(async (resolve) => {
        const usdtToman = await fetchLiveUsdtRate();
        const tonUsd = 5.5; 
        const tonToman = tonUsd * usdtToman;
        const finalPrice = Math.round(tonToman + 20000);
        resolve({ tonUsd: tonUsd.toFixed(2), finalPrice, usdtToman });
    });
}

// محاسبه اتوماتیک قیمت استارز بر اساس نرخ لایو تتر
function fetchStarsPrice() {
    return new Promise(async (resolve) => {
        const usdtToman = await fetchLiveUsdtRate();
        const starUsd = 0.015; // قیمت دلاری هر استار
        const starToman = (starUsd * usdtToman) + 300;
        resolve(Math.round(starToman));
    });
}

async function showGiftInvoice(chatId, userData) {
    const unitPrice = userData.selectedGiftStars * 3900; 
    const totalPrice = unitPrice * userData.giftCount;
    let currentAmount = totalPrice;

    if (userData.appliedDiscountPercent > 0) {
        const discountVal = Math.round(totalPrice * (userData.appliedDiscountPercent / 100));
        currentAmount = totalPrice - discountVal;
    }
    userData.lastAmount = currentAmount;
    saveDatabase();

    const invoiceMsg = 
        `[ فاکتور خرید گیفت ]\n\n` +
        ` مقدار خرید: ${userData.selectedGiftName}\n` +
        ` یوزرنیم دریافت‌کننده: @${userData.recipientUsername}\n` +
        ` گیفت هاید: ${userData.isHided ? 'بله (تیک خورده)' : 'خیر'}\n` +
        ` کامنت: ${userData.commentText}\n\n` +
        ` مبلغ فاکتور: ${totalPrice.toLocaleString()} تومان\n` +
        ` کل موجودی تخفیف: ${userData.discountWallet.toLocaleString()} تومان\n` +
        ` مبلغ نهایی قابل پرداخت: ${currentAmount.toLocaleString()} تومان\n\n` +
        `در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه «تأیید» کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید' }, { text: '❌ لغو خرید' }],
                [{ text: '🎁 اعمال تخفیف' }, { text: '💳 اعمال کد تخفیف' }],
                [{ text: '💬 تنظیم کامنت' }, { text: userData.isHided ? '🔓 لغو هاید' : '🔒 هاید گیفت' }],
                [{ text: '🔙 بازگشت' }]
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
        ` مقدار خرید: ${userData.tonAmount} تون\n` +
        ` آدرس ولت: \`${userData.tonWalletAddress}\`\n` +
        ` کامنت (مم): ${userData.tonMemo}\n\n` +
        ` مبلغ نهایی: ${totalPrice.toLocaleString()} تومان\n\n` +
        ` در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه «تأیید» کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید تون' }, { text: '❌ لغو خرید' }],
                [{ text: '💳 اعمال کد تخفیف' }],
                [{ text: '🔙 بازگشت' }]
            ],
            resize_keyboard: true
        }
    };

    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

async function showReactionInvoice(chatId, userData) {
    const totalPrice = userData.reactionCount * userData.starPricePerUnit;
    let currentAmount = totalPrice;

    if (userData.appliedDiscountPercent > 0) {
        const discountVal = Math.round(totalPrice * (userData.appliedDiscountPercent / 100));
        currentAmount = totalPrice - discountVal;
    }
    userData.lastAmount = currentAmount;
    saveDatabase();

    const maxDiscountAllowed = Math.min(userData.discountWallet, totalPrice);

    const invoiceMsg = 
        `[ فاکتور ری‌اکشن استارزی ]\n\n` +
        ` مقدار خرید: ${userData.reactionCount} استارز 💫\n` +
        ` لینک پست: \`${userData.reactionLink}\` 🔗\n\n` +
        ` مبلغ فاکتور: ${totalPrice.toLocaleString()} تومان 💰\n` +
        ` کل موجودی تخفیف: ${userData.discountWallet.toLocaleString()} تومان 🎁\n` +
        ` مبلغ نهایی: ${currentAmount.toLocaleString()} تومان 💳\n\n` +
        ` در صورتی که جزئیات بالا مورد تأیید شماست ، روی دکمه «تأیید» ✅ کلیک کنید.`;

    const invoiceKeyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '✅ تایید ری‌اکشن' }, { text: '❌ لغو خرید' }],
                [{ text: '🎁 اعمال تخفیف' }, { text: '💳 اعمال کد تخفیف' }],
                [{ text: '🔙 بازگشت' }]
            ],
            resize_keyboard: true
        }
    };

    await safeSendMessage(chatId, invoiceMsg, invoiceKeyboard);
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const contact = msg.contact;
    const photo = msg.photo;
    
    const adminData = getUserDataById(ADMIN_NUMERIC_ID);
    const isAdmin = (chatId.toString() === ADMIN_NUMERIC_ID.toString());
    const userData = getUserData(msg);

    if (userData.isBanned) {
        await safeSendMessage(chatId, 'حساب کاربری شما توسط ادمین مسدود شده است.');
        return;
    }

    let mainKeyboardRows = [
        [{ text: '🛒 خرید محصول' }],
        [{ text: '➕ افزایش موجودی' }, { text: '💳 حساب کاربری' }],
        [{ text: '📞 پشتیبانی' }, { text: '📦 پیگیری سفارش' }],
        [{ text: '❤️ چه طور میتوانم به شما اعتماد کنم' }]
    ];

    if (isAdmin) mainKeyboardRows.push([{ text: '🔧 پنل مدیریت' }]);

    const mainKeyboard = { reply_markup: { keyboard: mainKeyboardRows, resize_keyboard: true, is_persistent: true } };
    const backKeyboard = { reply_markup: { keyboard: [[{ text: '🔙 بازگشت' }]], resize_keyboard: true } };
    const accountKeyboard = { reply_markup: { keyboard: [[{ text: '📦 سفارش های معلق من' }, { text: '📦 سفارش های اخیر من' }], [{ text: '🔙 بازگشت' }]], resize_keyboard: true } };

    if (text === '🔙 بازگشت' || text === '🔙 بازگشت به منوی اصلی' || text === 'انصراف') {
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
        userData.waitingForReactionCount = false;
        userData.waitingForReactionLink = false;
        
        if (isAdmin) { 
            adminData.adminAction = null; 
            adminData.waitingForAdminUserSearch = false; 
            adminData.waitingForAdminAmount = false; 
            adminData.waitingForRejectReason = false; 
            adminData.waitingForOrderRejectReason = false;
        }

        if (text === '🔙 بازگشت به منوی اصلی' || !userData.currentShopState || userData.currentShopState === 'main_shop') {
            userData.currentShopState = null;
            saveDatabase();
            await safeSendMessage(chatId, 'به منوی اصلی برگشتید.', mainKeyboard);
            return;
        }

        if (userData.currentShopState === 'reaction_input_link' || userData.currentShopState === 'reaction_invoice') {
            userData.currentShopState = 'reaction_menu';
            userData.waitingForReactionCount = true;
            saveDatabase();
            const starPrice = await fetchStarsPrice();
            userData.starPricePerUnit = starPrice;
            saveDatabase();

            const reactMsg = 
                `وقتشه پسته‌هات با ری‌اکشن استارزی بدرخشن! ✨\n\n` +
                `حداقل خرید : 5 استارز 📊\n` +
                `قیمت هر استار (محاسبه زنده): ${starPrice.toLocaleString()} تومان 💵\n\n` +
                `لطفاً تعداد ری‌اکشن استارزی موردنظر خود را ارسال کنید 👇`;
            const reactKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: 'محاسبه با موجودی من' }],
                        [{ text: '🔙 بازگشت' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, reactMsg, reactKeyboard);
            return;
        } else if (userData.currentShopState === 'ton_wallet_flow' || userData.currentShopState === 'ton_invoice' || userData.currentShopState === 'gift_category' || userData.currentShopState === 'reaction_menu') {
            userData.currentShopState = 'main_shop';
            saveDatabase();
            const shopKeyboard = { 
                reply_markup: { 
                    keyboard: [
                        [{ text: '📦 سفارش های اخیر من' }],
                        [{ text: '🌟 استارز' }, { text: '💎 پرمیوم' }],
                        [{ text: '💠 خرید ارز تون ( GRAM )' }],
                        [{ text: '🎁 گیفت‌های استارزی' }, { text: '💫 ری اکشن استارزی' }],
                        [{ text: '🔙 بازگشت' }]
                    ], 
                    resize_keyboard: true 
                } 
            };
            await safeSendMessage(chatId, 'سرویس مورد نظر خود را انتخاب کنید :', shopKeyboard);
            return;
        } else if (userData.currentShopState === 'gift_list') {
            userData.currentShopState = 'gift_category';
            saveDatabase();
            const giftCategoryKeyboard = { reply_markup: { keyboard: [[{ text: '🧸 گیفت های عادی' }], [{ text: '🔙 بازگشت' }]], resize_keyboard: true } };
            await safeSendMessage(chatId, 'لطفاً دسته‌بندی گیفت مورد نظر خود را انتخاب کنید :', giftCategoryKeyboard);
            return;
        } else if (userData.currentShopState === 'gift_count') {
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
                        [{ text: '🔙 بازگشت' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, 'لطفاً گیفت مورد نظر خود را انتخاب کنید', giftListKeyboard);
            return;
        } else if (userData.currentShopState === 'gift_recipient') {
            userData.currentShopState = 'gift_count';
            saveDatabase();
            const countKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: '🔻 کم کردن' }, { text: '📊 تعداد' }, { text: '🟢 اضافه کردن' }],
                        [{ text: '➖' }, { text: `${userData.giftCount}` }, { text: '➕' }],
                        [{ text: '🔙 بازگشت' }, { text: '✅ ادامه' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, `تعداد انتخاب شده: ${userData.giftCount}`, countKeyboard);
            return;
        } else if (userData.currentShopState === 'gift_invoice') {
            userData.currentShopState = 'gift_recipient';
            saveDatabase();
            const selfUsername = msg.from.username || msg.from.first_name;
            const recipientKeyboard = {
                reply_markup: {
                    keyboard: [
                        [{ text: `👤 برای خودم ( ${selfUsername} )` }],
                        [{ text: '🔙 بازگشت' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, `انتخاب اکانت دریافت‌کننده`, recipientKeyboard);
            return;
        } else {
            userData.currentShopState = null;
            saveDatabase();
            await safeSendMessage(chatId, 'به منوی اصلی برگشتید.', mainKeyboard);
            return;
        }
    }

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
            await safeSendMessage(order.userId, `[ اخطار ]\nسفارش شما با کد پیگیری \`${orderCode}\` توسط مدیریت رد شد.\n\nدلیل: ${reason}`);
            await safeSendMessage(chatId, `دلیل رد سفارش برای کاربر ارسال شد.`);
        }
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
            await safeSendMessage(chatId, 'ظرفیت این کد (تعداد دفعات قابل استفاده کل، مثلاً 5 نفر) را وارد کنید:');
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
            await safeSendMessage(chatId, 'ساعت اتمام اعتبار کد به وقت تهران را وارد کنید (مثلاً برای ساعت 10 شب عدد 22 را بفرستید):');
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
                        [{ text: '🌐 بدون محدودیت' }, { text: '🎁 فقط گیفت‌های استارزی' }],
                        [{ text: '🔙 بازگشت' }]
                    ],
                    resize_keyboard: true
                }
            };
            await safeSendMessage(chatId, 'لطفاً نوع اعمال محدودیت روی خریدها را انتخاب کنید:', restrictionKeyboard);
            return;
        }

        if (adminData.waitingForDiscountRestriction && text) {
            adminData.waitingForDiscountRestriction = false;
            if (text === '🎁 فقط گیفت‌های استارزی') {
                adminData.tempDiscount.restriction = 'gift_stars';
            } else {
                adminData.tempDiscount.restriction = null;
            }

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
                    ], resize_keyboard: true
                }
            };

            await safeSendMessage(chatId, 
                `[ کد تخفیف ساخته شد ]\n\n` +
                `کد: \`${code}\`\n` +
                `درصد تخفیف: ${adminData.tempDiscount.percent}%\n` +
                `ظرفیت: ${adminData.tempDiscount.capacity} نفر\n` +
                `ساعت انقضا (تهران): ${adminData.tempDiscount.expiryHour}:00`, 
                adminPanelMarkup
            );
            return;
        }
    }

    if (isAdmin && adminData.waitingForRejectReason && text) {
        const targetId = adminData.rejectTargetId;
        const reason = text;
        adminData.waitingForRejectReason = false;
        adminData.rejectTargetId = null;
        saveDatabase();
        
        await safeSendMessage(targetId, `رسید پرداخت شما توسط مدیریت رد شد.\n\nدلیل: ${reason}`);
        await safeSendMessage(chatId, `دلیل رد رسید برای کاربر ارسال شد.`);
        return;
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
                await safeSendMessage(targetId, `از طرف مدیریت شما بن شدید.`);
                adminData.adminAction = null;
                adminData.targetUserId = null;
                return;
            } else if (adminData.adminAction === '✅ آنبن کردن کاربر') {
                targetUser.isBanned = false;
                saveDatabase();
                await safeSendMessage(chatId, `کاربر \`${targetId}\` آنبن شد.`);
                await safeSendMessage(targetId, `از طرف مدیریت شما آنبن شدید و حساب شما فعال شد.`);
                adminData.adminAction = null;
                adminData.targetUserId = null;
                return;
            } else if (adminData.adminAction === '💳 تایید احراز هویت کاربر') {
                targetUser.cardVerified = true;
                targetUser.level = 'سطح 2';
                saveDatabase();
                await safeSendMessage(chatId, `احراز هویت و حساب کاربری \`${targetId}\` تایید شد و بدون محدودیت شد.`);
                await safeSendMessage(targetId, `تبریک! احراز هویت و حساب کاربری شما توسط مدیریت تایید شد.\nحساب شما به سطح ۲ ارتقا یافت.`);
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
                    await safeSendMessage(targetId, `افزایش موجودی:\nمبلغ ${amount.toLocaleString()} تومان واریز شد.`);
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

    if (userData.waitingForTonAmount && text) {
        if (text === 'محاسبه با موجودی من') {
            const balanceTon = (userData.wallet / userData.tonPricePerUnit).toFixed(2);
            const checkMsg = 
                `موجودی اصلی شما: ${userData.wallet.toLocaleString()} تومان\n\n` +
                `معادل حدود ${balanceTon} تون می‌توانید خریداری کنید.\nلطفاً تعداد تون مورد نظر را وارد کنید:`;
            await safeSendMessage(chatId, checkMsg, backKeyboard);
            return;
        }

        const tonInput = parseFloat(text);
        if (isNaN(tonInput) || tonInput < 0.1) {
            await safeSendMessage(chatId, '❌ مقدار نامعتبر!\nحداقل خرید ۰.۱ تون است:', backKeyboard);
            return;
        }
        userData.tonAmount = tonInput;
        userData.waitingForTonAmount = false;
        userData.waitingForTonWallet = true;
        saveDatabase();

        const walletPromptMsg = `[ آدرس ولت تون ( TON ) ]\n\nلطفاً آدرس ولت تون خود را ارسال کنید :`;
        await safeSendMessage(chatId, walletPromptMsg, backKeyboard);
        return;
    }

    if (userData.waitingForReactionCount && text) {
        if (text === 'محاسبه با موجودی من') {
            const balanceStars = Math.floor(userData.wallet / userData.starPricePerUnit);
            const checkMsg = `معادل حدود ${balanceStars} استارز می‌توانید خریداری کنید.\nلطفاً تعداد استارز مورد نظر را وارد کنید:`;
            await safeSendMessage(chatId, checkMsg, backKeyboard);
            return;
        }

        const countInput = parseInt(text);
        if (isNaN(countInput) || countInput < 5) {
            await safeSendMessage(chatId, '❌ حداقل خرید ۵ استارز است:', backKeyboard);
            return;
        }
        userData.reactionCount = countInput;
        userData.waitingForReactionCount = false;
        userData.waitingForReactionLink = true;
        userData.currentShopState = 'reaction_input_link';
        saveDatabase();

        const linkPromptMsg = `🔗 لطفاً لینک پستی که می‌خواهید ری‌اکشن روی آن ثبت شود را ارسال کنید:`;
        await safeSendMessage(chatId, linkPromptMsg, backKeyboard);
        return;
    }

    if (userData.waitingForReactionLink && text) {
        const link = text.trim();
        if (!link.startsWith('http')) {
            await safeSendMessage(chatId, '❌ لینک نامعتبر! لطفاً لینک صحیح را ارسال کنید:', backKeyboard);
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
        const address = text.trim();
        if (!address.startsWith('UQ') && !address.startsWith('EQ') && address.length < 40) {
            await safeSendMessage(chatId, `❌ آدرس ولت معتبر وارد کنید (شروع با UQ یا EQ):`, backKeyboard);
            return;
        }

        userData.tonWalletAddress = address;
        userData.waitingForTonWallet = false;
        userData.waitingForTonMemoChoice = true;
        saveDatabase();

        const memoKeyboard = {
            reply_markup: {
                keyboard: [
                    [{ text: '💬 بله، کامنت دارم' }, { text: '❌ رد کردن' }],
                    [{ text: '🔙 بازگشت' }]
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
        if (order.status === 'completed') statusStr = 'تکمیل شده ✅';
        if (order.status === 'rejected') statusStr = 'رد شده ❌';

        const trackResultMsg = 
            `[ نتیجه پیگیری سفارش ]\n\n` +
            `کد پیگیری: \`${trackingCode}\`\n` +
            `محصول: ${order.giftName}\n` +
            `مبلغ: ${order.amount.toLocaleString()} تومان\n` +
            `وضعیت: ${statusStr}`;

        await safeSendMessage(chatId, trackResultMsg, backKeyboard);
        return;
    }

    if (userData.waitingForComment && text) {
        userData.waitingForComment = false;
        userData.commentText = text.trim();
        saveDatabase();
        await safeSendMessage(chatId, 'کامنت تنظیم شد.');
        await showGiftInvoice(chatId, userData);
        return;
    }

    if (userData.waitingForRecipient && text) {
        userData.waitingForRecipient = false;
        let usernameInput = text.trim();
        if (usernameInput.startsWith('@')) usernameInput = usernameInput.substring(1);
        userData.recipientUsername = usernameInput;
        userData.currentShopState = 'gift_invoice';
        saveDatabase();
        await showGiftInvoice(chatId, userData);
        return;
    }

    if (userData.waitingForDiscountInput && text) {
        userData.waitingForDiscountInput = false;
        saveDatabase();
        const codeInput = text.trim();
        const discountObj = db.discountCodes[codeInput];

        if (!discountObj || discountObj.usedCount >= discountObj.capacity) {
            await safeSendMessage(chatId, 'کد تخفیف نامعتبر یا منقضی شده است.', backKeyboard);
            return;
        }

        userData.appliedDiscountCode = codeInput;
        userData.appliedDiscountPercent = discountObj.percent;
        saveDatabase();

        await safeSendMessage(chatId, `کد تخفیف ${discountObj.percent}% اعمال شد!`, backKeyboard);
        
        if (userData.currentShopState === 'gift_invoice') await showGiftInvoice(chatId, userData);
        else if (userData.currentShopState === 'ton_invoice') await showTonInvoice(chatId, userData);
        else if (userData.currentShopState === 'reaction_invoice') await showReactionInvoice(chatId, userData);
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
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        await safeSendMessage(chatId, `[ سفارش ثبت شد ]\nکد پیگیری: \`${trackingCode}\``, mainKeyboard);
        await safeSendMessage(ADMIN_NUMERIC_ID, `[ سفارش جدید گیفت ]\nکد: \`${trackingCode}\`\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`, {
            reply_markup: { inline_keyboard: [[{ text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` }, { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }]] }
        });
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
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        await safeSendMessage(chatId, `[ سفارش تون ثبت شد ]\nکد پیگیری: \`${trackingCode}\``, mainKeyboard);
        await safeSendMessage(ADMIN_NUMERIC_ID, `[ سفارش جدید تون ]\nکد: \`${trackingCode}\`\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`, {
            reply_markup: { inline_keyboard: [[{ text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` }, { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }]] }
        });
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
            giftName: `ری‌اکشن (${userData.reactionCount} استارز)`,
            count: userData.reactionCount,
            recipient: userData.reactionLink,
            amount: userData.lastAmount,
            time: now,
            status: 'pending'
        };
        saveDatabase();

        await safeSendMessage(chatId, `[ سفارش ری‌اکشن ثبت شد ]\nکد پیگیری: \`${trackingCode}\``, mainKeyboard);
        await safeSendMessage(ADMIN_NUMERIC_ID, `[ سفارش جدید ری‌اکشن ]\nکد: \`${trackingCode}\`\nمبلغ: ${userData.lastAmount.toLocaleString()} تومان`, {
            reply_markup: { inline_keyboard: [[{ text: '✅ انجام شد', callback_data: `order_done_${trackingCode}` }, { text: '❌ رد شد', callback_data: `order_reject_${trackingCode}` }]] }
        });
        userData.currentShopState = null;
        saveDatabase();
        return;
    }

    if (photo && userData.waitingForReceipt) {
        const photoId = photo[photo.length - 1].file_id;
        userData.waitingForReceipt = false;
        saveDatabase();
        
        const amount = userData.lastAmount;
        const now = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
        const adminCaption = `[ رسید پرداخت ]\nکاربر: ${userData.firstName} (\`${chatId}\`)\nمبلغ: ${amount.toLocaleString()} تومان`;
        
        await bot.sendPhoto(ADMIN_NUMERIC_ID, photoId, { 
            caption: adminCaption, 
            parse_mode: 'Markdown', 
            reply_markup: { inline_keyboard: [[{ text: '✅ تایید', callback_data: `approve_${chatId}_${amount}` }, { text: '❌ رد', callback_data: `reject_${chatId}` }]] } 
        });

        await safeSendMessage(chatId, 'رسید شما برای مدیریت ارسال شد.');
        return;
    }

    if (contact) {
        let phoneNum = contact.phone_number;
        if (!phoneNum.startsWith('+')) phoneNum = '+' + phoneNum;
        if (phoneNum.startsWith('+98')) {
            userData.phone = phoneNum;
            userData.verified = 'انجام شده';
            saveDatabase();
            await safeSendMessage(chatId, `شماره موبایل تایید شد!`, mainKeyboard);
        }
        return;
    }

    if (userData.waitingForTicket && text) {
        userData.waitingForTicket = false;
        saveDatabase();
        await safeSendMessage(chatId, 'تیکت ارسال شد.', backKeyboard);
        await safeSendMessage(ADMIN_NUMERIC_ID, `تیکت جدید از ${userData.firstName} (\`${chatId}\`):\n${text}`, {
            reply_markup: { inline_keyboard: [[{ text: '💬 پاسخ', callback_data: `reply_${chatId}` }]] }
        });
        return;
    }

    if (text && text.startsWith('/start')) {
        userData.waitingForAmount = false;
        userData.currentShopState = null;
        saveDatabase();
        await safeSendMessage(chatId, 'به استارزپلاس خوش آمدید!', mainKeyboard);
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
    else if (isAdmin && text === '🏷️ ساخت کد تخفیف') {
        adminData.waitingForDiscountPercent = true;
        saveDatabase();
        await safeSendMessage(chatId, 'چند درصد تخفیف می‌خواهید بسازید؟ (فقط عدد):');
    }
    else if (isAdmin && ['➕ افزایش موجودی کاربر', '➖ کاهش موجودی کاربر', '🏆 تغییر سطح کاربر', '💳 تایید احراز هویت کاربر', '🚫 بن کردن کاربر', '✅ آنبن کردن کاربر'].includes(text)) {
        adminData.adminAction = text;
        adminData.waitingForAdminUserSearch = true;
        saveDatabase();
        await safeSendMessage(chatId, `آیدی عددی کاربر را وارد کنید:`);
    }
    else if (text === '🛒 خرید محصول') {
        userData.currentShopState = 'main_shop';
        saveDatabase();
        const shopKeyboard = { 
            reply_markup: { 
                keyboard: [
                    [{ text: '📦 سفارش های اخیر من' }],
                    [{ text: '🌟 استارز' }, { text: '💎 پرمیوم' }],
                    [{ text: '💠 خرید ارز تون ( GRAM )' }],
                    [{ text: '🎁 گیفت‌های استارزی' }, { text: '💫 ری اکشن استارزی' }],
                    [{ text: '🔙 بازگشت' }]
                ], 
                resize_keyboard: true 
            } 
        };
        await safeSendMessage(chatId, 'سرویس مورد نظر خود را انتخاب کنید :', shopKeyboard);
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
                    [{ text: 'محاسبه با موجودی من' }],
                    [{ text: '🔙 بازگشت' }]
                ],
                resize_keyboard: true
            }
        };
        await safeSendMessage(chatId, `قیمت هر استار (محاسبه زنده): ${starsPrice.toLocaleString()} تومان\nتعداد استارز موردنظر را ارسال کنید:`, reactionMenuKeyboard);
    }
    else if (text === '💠 خرید ارز تون ( GRAM )') {
        userData.currentShopState = 'ton_wallet_flow';
        saveDatabase();

        const tonData = await fetchTonData();
        userData.tonPricePerUnit = tonData.finalPrice;
        saveDatabase();

        const tonFlowMsg = 
            `[ خرید ارز تون ]\n\n` +
            ` نرخ لایو تتر: ${tonData.usdtToman.toLocaleString()} تومان\n` +
            ` قیمت نهایی هر تون: ${tonData.finalPrice.toLocaleString()} تومان (با احتساب سود زنده)\n` +
            ` حداقل خرید: 0.1 تون\n\n` +
            ` تعداد تون مورد نظر را وارد کنید:`;

        await safeSendMessage(chatId, tonFlowMsg, { reply_markup: { keyboard: [[{ text: 'محاسبه با موجودی من' }], [{ text: '🔙 بازگشت' }]], resize_keyboard: true } });
        userData.waitingForTonAmount = true;
        saveDatabase();
    }
    else if (text === '🎁 گیفت‌های استارزی') {
        userData.currentShopState = 'gift_category';
        saveDatabase();
        await safeSendMessage(chatId, 'دسته‌بندی گیفت را انتخاب کنید :', { reply_markup: { keyboard: [[{ text: '🧸 گیفت های عادی' }], [{ text: '🔙 بازگشت' }]], resize_keyboard: true } });
    }
    else if (text === '🧸 گیفت های عادی') {
        userData.currentShopState = 'gift_list';
        saveDatabase();
        await safeSendMessage(chatId, 'گیفت مورد نظر خود را انتخاب کنید', {
            reply_markup: {
                keyboard: [
                    [{ text: '💖 گیفت قلب (15)' }, { text: '🧸 گیفت تدی (15)' }],
                    [{ text: '🎁 گیفت کادو (25)' }, { text: '🌹 گیفت گل رز (25)' }],
                    [{ text: '🎂 گیفت کیک (50)' }, { text: '🌷 گیفت گل (50)' }],
                    [{ text: '🍾 گیفت بطری (50)' }, { text: '🚀 گیفت سفینه (50)' }],
                    [{ text: '🏆 گیفت جام (100)' }, { text: '💍 گیفت حلقه (100)' }],
                    [{ text: '🔙 بازگشت' }]
                ],
                resize_keyboard: true
            }
        });
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

        await safeSendMessage(chatId, `تعداد انتخاب شده: ${userData.giftCount}`, {
            reply_markup: {
                keyboard: [
                    [{ text: '🔻 کم کردن' }, { text: '📊 تعداد' }, { text: '🟢 اضافه کردن' }],
                    [{ text: '➖' }, { text: `${userData.giftCount}` }, { text: '➕' }],
                    [{ text: '🔙 بازگشت' }, { text: '✅ ادامه' }]
                ],
                resize_keyboard: true
            }
        });
    }
    else if (text === '🟢 اضافه کردن' || text === '➕') {
        if (userData.currentShopState === 'gift_count') {
            userData.giftCount += 1;
            saveDatabase();
            await safeSendMessage(chatId, `تعداد انتخاب شده: ${userData.giftCount}`, {
                reply_markup: {
                    keyboard: [
                        [{ text: '🔻 کم کردن' }, { text: '📊 تعداد' }, { text: '🟢 اضافه کردن' }],
                        [{ text: '➖' }, { text: `${userData.giftCount}` }, { text: '➕' }],
                        [{ text: '🔙 بازگشت' }, { text: '✅ ادامه' }]
                    ],
                    resize_keyboard: true
                }
            });
        }
    }
    else if (text === '🔻 کم کردن' || text === '➖') {
        if (userData.currentShopState === 'gift_count' && userData.giftCount > 1) {
            userData.giftCount -= 1;
            saveDatabase();
            await safeSendMessage(chatId, `تعداد انتخاب شده: ${userData.giftCount}`, {
                reply_markup: {
                    keyboard: [
                        [{ text: '🔻 کم کردن' }, { text: '📊 تعداد' }, { text: '🟢 اضافه کردن' }],
                        [{ text: '➖' }, { text: `${userData.giftCount}` }, { text: '➕' }],
                        [{ text: '🔙 بازگشت' }, { text: '✅ ادامه' }]
                    ],
                    resize_keyboard: true
                }
            });
        }
    }
    else if (text === '✅ ادامه') {
        if (userData.currentShopState === 'gift_count') {
            userData.currentShopState = 'gift_recipient';
            saveDatabase();
            const selfUsername = msg.from.username || msg.from.first_name;
            userData.recipientUsername = selfUsername;
            saveDatabase();

            await safeSendMessage(chatId, `انتخاب اکانت دریافت‌کننده`, {
                reply_markup: {
                    keyboard: [
                        [{ text: `👤 برای خودم ( ${selfUsername} )` }],
                        [{ text: '🔙 بازگشت' }]
                    ],
                    resize_keyboard: true
                }
            });
        }
    }
    else if (text && text.startsWith('👤 برای خودم')) {
        const selfUsername = msg.from.username || msg.from.first_name;
        userData.recipientUsername = selfUsername;
        userData.currentShopState = 'gift_invoice';
        saveDatabase();
        await showGiftInvoice(chatId, userData);
    }
    else if (text === '❌ لغو خرید') {
        userData.currentShopState = null;
        saveDatabase();
        await safeSendMessage(chatId, 'خرید لغو شد.', mainKeyboard);
    }
    else if (text === '💳 اعمال کد تخفیف' || text === '🎁 اعمال تخفیف') {
        userData.waitingForDiscountInput = true;
        saveDatabase();
        await safeSendMessage(chatId, 'کد تخفیف خود را ارسال کنید:', backKeyboard);
    }
    else if (text === '💬 تنظیم کامنت') {
        userData.waitingForComment = true;
        saveDatabase();
        await safeSendMessage(chatId, 'متن کامنت را ارسال کنید:', backKeyboard);
    }
    else if (text === '🔒 هاید گیفت' || text === '🔓 لغو هاید') {
        userData.isHided = !userData.isHided;
        saveDatabase();
        await safeSendMessage(chatId, `وضعیت هاید گیفت به: ${userData.isHided ? 'فعال' : 'غیرفعال'} تغییر یافت.`);
        if (userData.currentShopState === 'gift_invoice') await showGiftInvoice(chatId, userData);
    }
    else if (text === '❤️ چه طور میتوانم به شما اعتماد کنم') {
        await safeSendMessage(chatId, 'با خیال راحت خرید کنید!\nکانال نمونه کار: @snt_shopp', backKeyboard);
    }
    else if (text === '📦 پیگیری سفارش') {
        userData.waitingForTrackingInput = true;
        saveDatabase();
        await safeSendMessage(chatId, 'کد پیگیری سفارش را ارسال کنید:', backKeyboard);
    }
    else if (text === '💳 حساب کاربری') {
        const userInfo = `حساب کاربری:\nنام: ${userData.firstName}\nموجودی اصلی: ${userData.wallet.toLocaleString()} تومان`;
        await safeSendMessage(chatId, userInfo, accountKeyboard);
    }
    else if (text === '➕ افزایش موجودی') {
        await safeSendMessage(chatId, 'افزایش موجودی', { reply_markup: { keyboard: [[{ text: '💳 پرداخت ریالی' }], [{ text: '🔙 بازگشت به منوی اصلی' }]], resize_keyboard: true } });
    }
    else if (text === '💳 پرداخت ریالی') {
        userData.waitingForAmount = true;
        saveDatabase();
        await safeSendMessage(chatId, 'مبلغ مورد نظر به تومان را وارد کنید:', backKeyboard);
    }
    else if (userData.waitingForAmount && /^\d+$/.test(text)) {
        const enteredAmount = parseInt(text);
        userData.waitingForAmount = false;
        userData.lastAmount = enteredAmount;
        saveDatabase();
        
        await safeSendMessage(chatId, `مبلغ ${userData.lastAmount.toLocaleString()} تومان\nبه کارت زیر واریز کنید:\n\`6219861452862914\`\nو رسید را بفرستید`, {
            reply_markup: { keyboard: [[{ text: '🔙 بازگشت' }]], resize_keyboard: true }
        });
        userData.waitingForReceipt = true;
        saveDatabase();
    }
    else if (text === '📞 پشتیبانی') {
        await safeSendMessage(chatId, 'بخش پشتیبانی:', { reply_markup: { keyboard: [[{ text: '👤 پشتیبانی مستقیم' }, { text: '🎫 ارسال تیکت' }], [{ text: '🔙 بازگشت به منوی اصلی' }]], resize_keyboard: true } });
    }
    else if (text === '👤 پشتیبانی مستقیم') await safeSendMessage(chatId, `آیدی ادمین:\n${ADMIN_ID_USERNAME}`, backKeyboard);
    else if (text === '🎫 ارسال تیکت') {
        userData.waitingForTicket = true;
        saveDatabase();
        await safeSendMessage(chatId, 'پیام خود را بفرستید:', backKeyboard);
    }
    else if (text === '📦 سفارش های اخیر من') {
        let userOrders = Object.entries(db.orders).filter(([code, order]) => order.userId === chatId);
        if (userOrders.length === 0) await safeSendMessage(chatId, 'سفارشی ثبت نشده است.', backKeyboard);
        else {
            let msgText = `[ سفارش‌های اخیر ]\n\n`;
            userOrders.slice(-5).forEach(([code, order]) => {
                msgText += `📦 کد: \`${code}\`\nمحصول: ${order.giftName}\nمبلغ: ${order.amount.toLocaleString()} تومان\n\n`;
            });
            await safeSendMessage(chatId, msgText, backKeyboard);
        }
    }
    else if (text === '📦 سفارش های معلق من') {
        let userOrders = Object.entries(db.orders).filter(([code, order]) => order.userId === chatId && order.status === 'pending');
        if (userOrders.length === 0) await safeSendMessage(chatId, 'سفارش معلقی ندارید.', backKeyboard);
        else {
            let msgText = `[ سفارش‌های معلق ]\n\n`;
            userOrders.forEach(([code, order]) => {
                msgText += `📦 کد: \`${code}\`\nمحصول: ${order.giftName}\n\n`;
            });
            await safeSendMessage(chatId, msgText, backKeyboard);
        }
    }
    else if (text === '🌟 استارز' || text === '💎 پرمیوم') {
        await safeSendMessage(chatId, `بخش ${text} در حال توسعه است.`, backKeyboard);
    }
});

bot.on('callback_query', async (callbackQuery) => {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userData = getUserDataById(chatId);

    if (action.startsWith('order_done_')) {
        const trackingCode = action.replace('order_done_', '');
        const order = db.orders[trackingCode];
        if (order) {
            order.status = 'completed';
            saveDatabase();
            await safeSendMessage(order.userId, `سفارش شما با کد \`${trackingCode}\` تکمیل شد!`);
            try { await bot.editMessageText(`انجام شد\n\n${msg.text}`, { chat_id: chatId, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } }); } catch(e){}
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

    if (action.startsWith('reply_')) {
        const targetUserId = action.split('_')[1];
        const adminData = getUserDataById(ADMIN_NUMERIC_ID);
        adminData.adminReplyingTo = targetUserId;
        saveDatabase();
        await safeSendMessage(chatId, 'پاسخ خود را به کاربر بفرستید:');
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action.startsWith('approve_')) {
        const parts = action.split('_');
        const targetId = parts[1];
        const amount = parseInt(parts[2]);
        const targetUser = getUserDataById(targetId);

        targetUser.wallet += amount;
        saveDatabase();

        await safeSendMessage(targetId, `رسید تایید شد!\nمبلغ ${amount.toLocaleString()} تومان به حساب شما واریز شد.`);
        try { await bot.editMessageCaption(`تایید شد\n\n${msg.caption}`, { chat_id: chatId, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } }); } catch(e){}
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    if (action.startsWith('reject_')) {
        const targetId = action.split('_')[1];
        const adminData = getUserDataById(ADMIN_NUMERIC_ID);
        adminData.waitingForRejectReason = true;
        adminData.rejectTargetId = targetId;
        saveDatabase();
        await safeSendMessage(chatId, 'دلیل رد رسید را بنویسید:');
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
        return;
    }

    try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e){}
});
