const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN = '6417097314:AAFAapbOddfkHYStwo6fdCSSBIzjilmpj8w';
const MOVIE_CHANNEL_ID = '-1002193279142';
const BOT_CHANNEL_ID = '-1002000326469';
const SUBSCRIPTION_CHANNELS = [
  { id: '-1001657312871', username: '@Kinolar_yangi_uzbekcha_milliy' }
];

const CREATOR_ID = 5964449680;
const ADMIN_IDS = [5964449680, 6571202128];

const bot = new TelegramBot(TOKEN, { polling: true });

let postMap = {};
let userActivity = {};
let pendingSendMessages = {}; // To store pending send messages for admins
let pendingUserMessages = {}; // To store pending messages for users
let pendingAddAdmin = {}; // To store pending admin add requests
let pendingRemoveAdmin = {}; // To store pending admin remove requests
let pendingMovieSuggestions = {}; // To store pending movie suggestions

const postMapPath = path.join(__dirname, 'postMap.json');
const userActivityPath = path.join(__dirname, 'userActivity.json');
const usersDir = path.join(__dirname, 'users');

// Create users directory if it doesn't exist
if (!fs.existsSync(usersDir)) {
  fs.mkdirSync(usersDir);
}

// Load or create postMap
if (fs.existsSync(postMapPath)) {
  try {
    postMap = JSON.parse(fs.readFileSync(postMapPath, 'utf8'));
    console.log('postMap.json loaded');
  } catch (error) {
    console.error('Error parsing postMap.json:', error);
  }
} else {
  fs.writeFileSync(postMapPath, JSON.stringify(postMap, null, 2));
  console.log('postMap.json created');
}

// Load or create userActivity
if (fs.existsSync(userActivityPath)) {
  try {
    userActivity = JSON.parse(fs.readFileSync(userActivityPath, 'utf8'));
    console.log('userActivity.json loaded');
  } catch (error) {
    console.error('Error parsing userActivity.json:', error);
  }
} else {
  fs.writeFileSync(userActivityPath, JSON.stringify(userActivity, null, 2));
  console.log('userActivity.json created');
}

// Save user chat history
function saveUserChatHistory(chatId, message, fromBot = false) {
  const userFilePath = path.join(usersDir, `${chatId}.json`);
  let userChatHistory = [];

  if (fs.existsSync(userFilePath)) {
    try {
      userChatHistory = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
    } catch (error) {
      console.error(`Error parsing ${chatId}.json:`, error);
    }
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    from: fromBot ? 'bot' : 'user',
    message: message
  };

  userChatHistory.push(logEntry);
  fs.writeFileSync(userFilePath, JSON.stringify(userChatHistory, null, 2));
}

// Check if user is subscribed
async function isUserSubscribed(chatId) {
  try {
    for (let channel of SUBSCRIPTION_CHANNELS) {
      const response = await axios.get(`https://api.telegram.org/bot${TOKEN}/getChatMember?chat_id=${channel.id}&user_id=${chatId}`);
      const status = response.data.result.status;
      if (status !== 'member' && status !== 'administrator' && status !== 'creator') {
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// Update postMap
async function updatePostMap(number, messageId) {
  try {
    postMap[number.toString()] = messageId;
    fs.writeFileSync(postMapPath, JSON.stringify(postMap, null, 2));
    console.log(`postMap updated: ${number} -> ${messageId}`);
    return true;
  } catch (error) {
    console.error('Error updating postMap:', error);
    return false;
  }
}

// Get active users within a given time period
function getActiveUsers(timePeriod) {
  const currentTime = Date.now();
  return Object.values(userActivity).filter(activityTime => currentTime - activityTime < timePeriod).length;
}

// Set bot commands for the menu
bot.setMyCommands([
  { command: '/start', description: 'Botni ishga tushirish' },
  { command: '/actions', description: 'Amallarni ko\'rsatish' }
]);

// Handle /start command
bot.onText(/\/start(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const isSubscribed = await isUserSubscribed(chatId);

  if (!userActivity[chatId]) {
    userActivity[chatId] = Date.now();
    fs.writeFileSync(userActivityPath, JSON.stringify(userActivity, null, 2));
  }

  if (isSubscribed) {
    const code = match[1]; // Get the start parameter
    if (code && postMap[code]) {
      const messageId = postMap[code];
      try {
        const forwardedMessage = await bot.forwardMessage(BOT_CHANNEL_ID, MOVIE_CHANNEL_ID, messageId);
        const forwardedMessageId = forwardedMessage.message_id;
        await bot.copyMessage(chatId, BOT_CHANNEL_ID, forwardedMessageId);
        const responseMessage = `Raqamga mos keladigan kino: ${code}`;
        bot.sendMessage(chatId, responseMessage);
        saveUserChatHistory(chatId, responseMessage, true);
      } catch (error) {
        console.error(error);
        const errorMessage = 'Kino yuborishda xatolik yuz berdi.';
        bot.sendMessage(chatId, errorMessage);
        saveUserChatHistory(chatId, errorMessage, true);
      }
    } else {
      const welcomeMessage = `Assalomu aleykum! Menga kod yuboring va men siz uchun uning kinosini topib beraman. Agar kodlarni bilmaysiz, ushbu kanaldan topishingiz mumkin: https://t.me/Kinolar_yangi_uzbekcha_milliy`;
      bot.sendMessage(chatId, welcomeMessage);
      saveUserChatHistory(chatId, welcomeMessage, true);

      // Send admin buttons
      if (ADMIN_IDS.includes(msg.from.id)) {
        const adminButtons = [
          [{ text: 'Qo\'shish', callback_data: 'add' }],
          [{ text: 'Kod', callback_data: 'code' }],
          [{ text: 'Statistika', callback_data: 'stats' }],
          [{ text: 'Habar yuborish', callback_data: 'send' }]
        ];

        bot.sendMessage(chatId, 'Admin buyruqlarini tanlang:', {
          reply_markup: {
            inline_keyboard: adminButtons
          }
        });
      }

      // Send user button
      const userButtons = [
        [{ text: 'Message Admin', callback_data: 'user_message' }],
        [{ text: 'Kino tavfsiya qilish (New)', callback_data: 'suggest_movie' }] // New button
      ];

      bot.sendMessage(chatId, 'User actions:', {
        reply_markup: {
          inline_keyboard: userButtons
        }
      });
    }
  } else {
    const channelButtons = SUBSCRIPTION_CHANNELS.map(channel => ({
      text: channel.username,
      url: `https://t.me/${channel.username.replace('@', '')}`
    }));

    const keyboard = {
      inline_keyboard: [channelButtons]
    };

    const subscribeMessage = 'Botdan foydalanish uchun quyidagi kanallarga obuna bo\'ling:';
    bot.sendMessage(chatId, subscribeMessage, {
      reply_markup: keyboard
    });
    saveUserChatHistory(chatId, subscribeMessage, true);
  }
});

// Handle /actions command
bot.onText(/\/actions/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (CREATOR_ID === userId) {
    const creatorButtons = [
      [{ text: 'Qo\'shish', callback_data: 'add' }],
      [{ text: 'Kod', callback_data: 'code' }],
      [{ text: 'Statistika', callback_data: 'stats' }],
      [{ text: 'Habar yuborish', callback_data: 'send' }],
      [{ text: 'Adminlarni boshqarish', callback_data: 'manage_admins' }]
    ];

    bot.sendMessage(chatId, 'Creator buyruqlarini tanlang:', {
      reply_markup: {
        inline_keyboard: creatorButtons
      }
    });
  } else if (ADMIN_IDS.includes(userId)) {
    const adminButtons = [
      [{ text: 'Qo\'shish', callback_data: 'add' }],
      [{ text: 'Kod', callback_data: 'code' }],
      [{ text: 'Statistika', callback_data: 'stats' }],
      [{ text: 'Habar yuborish', callback_data: 'send' }]
    ];

    bot.sendMessage(chatId, 'Admin buyruqlarini tanlang:', {
      reply_markup: {
        inline_keyboard: adminButtons
      }
    });
  } else {
    const userButtons = [
      [{ text: 'Message Admin', callback_data: 'user_message' }],
      [{ text: 'Kino tavfsiya qilish (New)', callback_data: 'suggest_movie' }] // New button
    ];

    bot.sendMessage(chatId, 'User buyruqlarini tanlang:', {
      reply_markup: {
        inline_keyboard: userButtons
      }
    });
  }
});

// Handle admin and user button clicks
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  if (data === 'suggest_movie') {
    const initialMessages = [
      "Assalomu aleykum bu panelda siz botga yangi kino qo'shish tavfsiyasini berishingiz mumkin",
      "Botga qo'shmoqchi bo'lgan kinoni nomi, sanasi va janrlarini qo'shib yozib tashlang va admin bu kinoni tasdiqlasa botga va kanalga sizning kinoyingiz qo'shiladi"
    ];

    for (const message of initialMessages) {
      await bot.sendMessage(chatId, message);
      saveUserChatHistory(chatId, message, true);
    }

    pendingMovieSuggestions[userId] = true;
  } else if (CREATOR_ID === userId) {
    if (data === 'add') {
      bot.sendMessage(chatId, 'Qo\'shish uchun raqam va xabar ID sini kiriting: \nFormat: /add <raqam> <xabar ID>');
    } else if (data === 'code') {
      bot.sendMessage(chatId, 'Kod uchun raqamni kiriting: \nFormat: /code <raqam>');
    } else if (data === 'stats') {
      const oneHour = 60 * 60 * 1000;
      const oneDay = 24 * 60 * 60 * 1000;
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      const oneMonth = 30 * 24 * 60 * 60 * 1000;
      const oneYear = 12 * 30 * 24 * 60 * 60 * 1000;
      const fiveMinutes = 5 * 60 * 1000;

      const statsText = 
`**Foydalanuvchilar faoliyati**
Hozirda onlayn foydalanuvchilar: ${getActiveUsers(fiveMinutes)} ta
1 soat ichida botdan foydalanuvchilar: ${getActiveUsers(oneHour)} ta
1 kun ichida botdan foydalanuvchilar: ${getActiveUsers(oneDay)} ta
1 hafta ichida botdan foydalanuvchilar: ${getActiveUsers(oneWeek)} ta
1 oy ichida botdan foydalanuvchilar: ${getActiveUsers(oneMonth)} ta
1 yil ichida botdan foydalanuvchilar: ${getActiveUsers(oneYear)} ta`;

      bot.sendMessage(chatId, statsText);
      saveUserChatHistory(chatId, statsText, true);
    } else if (data === 'send') {
      pendingSendMessages[userId] = true; // Set the pending send message for the admin
      bot.sendMessage(chatId, 'Yubormoqchi bo\'lgan matningizni menga yuboring.');
    } else if (data === 'manage_admins') {
      const manageAdminButtons = [
        [{ text: 'Adminlar', callback_data: 'list_admins' }],
        [{ text: 'Admin qo\'shish', callback_data: 'add_admin' }],
        [{ text: 'Adminlarni chiqarib yuborish', callback_data: 'remove_admin' }]
      ];

      bot.sendMessage(chatId, 'Adminlarni boshqarish buyruqlarini tanlang:', {
        reply_markup: {
          inline_keyboard: manageAdminButtons
        }
      });
    } else if (data === 'list_admins') {
      let adminList = 'Adminlar:\n';
      for (const id of ADMIN_IDS) {
        const admin = await bot.getChat(id);
        adminList += `ID: ${admin.id}, Username: ${admin.username}, Name: ${admin.first_name} ${admin.last_name}\n`;
      }
      bot.sendMessage(chatId, adminList);
    } else if (data === 'add_admin') {
      bot.sendMessage(chatId, 'Admin qo\'shish uchun user ID kiriting: \nFormat: /addadmin <user ID>');
      pendingAddAdmin[userId] = true;
    } else if (data === 'remove_admin') {
      const removeAdminButtons = ADMIN_IDS.map(id => [{ text: `ID: ${id}`, callback_data: `remove_${id}` }]);
      bot.sendMessage(chatId, 'Adminlarni chiqarib yuborish uchun tanlang:', {
        reply_markup: {
          inline_keyboard: removeAdminButtons
        }
      });
    } else if (data.startsWith('remove_')) {
      const adminId = data.split('_')[1];
      bot.sendMessage(chatId, `Siz rostdan ham ushbu adminni o'chirmoqchimisiz?`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Ha', callback_data: `confirm_remove_${adminId}` }],
            [{ text: 'Yo\'q, ortga', callback_data: 'cancel_remove' }]
          ]
        }
      });
    } else if (data.startsWith('confirm_remove_')) {
      const adminId = data.split('_')[2];
      const index = ADMIN_IDS.indexOf(parseInt(adminId));
      if (index > -1) {
        ADMIN_IDS.splice(index, 1);
        bot.sendMessage(chatId, `Admin ID: ${adminId} o'chirildi.`);
      } else {
        bot.sendMessage(chatId, `Admin ID: ${adminId} topilmadi.`);
      }
    } else if (data === 'cancel_remove') {
      bot.sendMessage(chatId, 'Adminni o\'chirish bekor qilindi.');
    }
  } else if (ADMIN_IDS.includes(userId)) {
    if (data === 'add') {
      bot.sendMessage(chatId, 'Qo\'shish uchun raqam va xabar ID sini kiriting: \nFormat: /add <raqam> <xabar ID>');
    } else if (data === 'code') {
      bot.sendMessage(chatId, 'Kod uchun raqamni kiriting: \nFormat: /code <raqam>');
    } else if (data === 'stats') {
      const oneHour = 60 * 60 * 1000;
      const oneDay = 24 * 60 * 60 * 1000;
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      const oneMonth = 30 * 24 * 60 * 60 * 1000;
      const oneYear = 12 * 30 * 24 * 60 * 60 * 1000;
      const fiveMinutes = 5 * 60 * 1000;

      const statsText = 
`**Foydalanuvchilar faoliyati**
Hozirda onlayn foydalanuvchilar: ${getActiveUsers(fiveMinutes)} ta
1 soat ichida botdan foydalanuvchilar: ${getActiveUsers(oneHour)} ta
1 kun ichida botdan foydalanuvchilar: ${getActiveUsers(oneDay)} ta
1 hafta ichida botdan foydalanuvchilar: ${getActiveUsers(oneWeek)} ta
1 oy ichida botdan foydalanuvchilar: ${getActiveUsers(oneMonth)} ta
1 yil ichida botdan foydalanuvchilar: ${getActiveUsers(oneYear)} ta`;

      bot.sendMessage(chatId, statsText);
      saveUserChatHistory(chatId, statsText, true);
    } else if (data === 'send') {
      pendingSendMessages[userId] = true; // Set the pending send message for the admin
      bot.sendMessage(chatId, 'Yubormoqchi bo\'lgan matningizni menga yuboring.');
    }
  } else if (data === 'user_message') {
    bot.sendMessage(chatId, 'Adminga yubormoqchi bo\'lgan matningizni menga yuboring.');
    pendingUserMessages[userId] = true; // Set the pending message flag for the user
  }
});

// Handle /add command
bot.onText(/^\/add (\d+) (\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  if (!ADMIN_IDS.includes(adminId)) {
    const errorMessage = 'Bu buyruqni faqat adminlar ishlatishi mumkin';
    bot.sendMessage(chatId, errorMessage);
    saveUserChatHistory(chatId, errorMessage, true);
    return;
  }

  const number = match[1];
  const messageId = match[2];

  const success = await updatePostMap(number, messageId);

  if (success) {
    const successMessage = `postMap ga yangi raqam qo'shildi: ${number} -> ${messageId}`;
    bot.sendMessage(chatId, successMessage);
    saveUserChatHistory(chatId, successMessage, true);
  } else {
    const errorMessage = 'postMap yangilanishda xatolik yuz berdi';
    bot.sendMessage(chatId, errorMessage);
    saveUserChatHistory(chatId, errorMessage, true);
  }
});

// Handle /code command
bot.onText(/^\/code (\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const code = match[1];
  const isSubscribed = await isUserSubscribed(chatId);

  if (!isSubscribed) {
    const channelButtons = SUBSCRIPTION_CHANNELS.map(channel => ({
      text: channel.username,
      url: `https://t.me/${channel.username.replace('@', '')}`
    }));

    const keyboard = {
      inline_keyboard: [channelButtons]
    };

    const subscribeMessage = 'Botdan foydalanish uchun quyidagi kanallarga obuna bo\'ling:';
    bot.sendMessage(chatId, subscribeMessage, {
      reply_markup: keyboard
    });
    saveUserChatHistory(chatId, subscribeMessage, true);
    return;
  }

  if (postMap[code]) {
    const messageId = postMap[code];

    try {
      const forwardedMessage = await bot.forwardMessage(BOT_CHANNEL_ID, MOVIE_CHANNEL_ID, messageId);
      const forwardedMessageId = forwardedMessage.message_id;
      await bot.copyMessage(chatId, BOT_CHANNEL_ID, forwardedMessageId);
      const responseMessage = `Raqamga mos keladigan kino: ${code}`;
      bot.sendMessage(chatId, responseMessage);
      saveUserChatHistory(chatId, responseMessage, true);
    } catch (error) {
      console.error(error);
      const errorMessage = 'Kino yuborishda xatolik yuz berdi.';
      bot.sendMessage(chatId, errorMessage);
      saveUserChatHistory(chatId, errorMessage, true);
    }
  } else {
    const errorMessage = 'Bunday kino mavjud emas';
    bot.sendMessage(chatId, errorMessage);
    saveUserChatHistory(chatId, errorMessage, true);
  }
});

// Handle /send command
bot.onText(/^\/send$/, async (msg) => {
  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  if (!ADMIN_IDS.includes(adminId)) {
    const errorMessage = 'Bu buyruqni faqat adminlar ishlatishi mumkin';
    bot.sendMessage(chatId, errorMessage);
    saveUserChatHistory(chatId, errorMessage, true);
    return;
  }

  pendingSendMessages[adminId] = true; // Set the pending send message for the admin
  bot.sendMessage(chatId, 'Yubormoqchi bo\'lgan matningizni menga yuboring.');
});

// Handle /addadmin command
bot.onText(/^\/addadmin (\d+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  const creatorId = msg.from.id;

  if (creatorId !== CREATOR_ID) {
    const errorMessage = 'Bu buyruqni faqat Creator ishlatishi mumkin';
    bot.sendMessage(chatId, errorMessage);
    saveUserChatHistory(chatId, errorMessage, true);
    return;
  }

  const newAdminId = parseInt(match[1]);
  if (!ADMIN_IDS.includes(newAdminId)) {
    ADMIN_IDS.push(newAdminId);
    bot.sendMessage(chatId, `Admin ID: ${newAdminId} qo'shildi.`);
  } else {
    bot.sendMessage(chatId, `Admin ID: ${newAdminId} allaqachon mavjud.`);
  }
});

// Handle messages and save chat history
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userInput = msg.text ? msg.text.trim() : '';
  const username = msg.from.username || 'No username';

  if (userInput.startsWith('/')) {
    return;
  }

  const isSubscribed = await isUserSubscribed(chatId);

  if (!isSubscribed) {
    const channelButtons = SUBSCRIPTION_CHANNELS.map(channel => ({
      text: channel.username,
      url: `https://t.me/${channel.username.replace('@', '')}`
    }));

    const keyboard = {
      inline_keyboard: [channelButtons]
    };

    const subscribeMessage = 'Botdan foydalanish uchun quyidagi kanallarga obuna bo\'ling:';
    bot.sendMessage(chatId, subscribeMessage, {
      reply_markup: keyboard
    });
    saveUserChatHistory(chatId, subscribeMessage, true);
    return;
  }

  saveUserChatHistory(chatId, userInput);

  if (pendingSendMessages[userId]) {
    // Admin is sending a message to forward to all users
    delete pendingSendMessages[userId]; // Clear the pending message flag
    let successCount = 0;
    let failCount = 0;

    for (let userId in userActivity) {
      try {
        await bot.copyMessage(userId, chatId, msg.message_id);
        successCount++;
      } catch (error) {
        console.error(`Failed to send message to ${userId}:`, error);
        failCount++;
      }
    }

    const resultMessage = `Habar yuborildi. Muvaffaqiyatli: ${successCount} ta, muvaffaqiyatsiz: ${failCount} ta`;
    bot.sendMessage(chatId, resultMessage);
    saveUserChatHistory(chatId, resultMessage, true);
  } else if (pendingUserMessages[userId]) {
    // User is sending a message to admin
    delete pendingUserMessages[userId]; // Clear the pending message flag
    let successCount = 0;
    let failCount = 0;

    for (let adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, `Message from user: ${msg.text}\nusername: ${username}\nuser_id: ${chatId}`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Reply', callback_data: `reply_${chatId}` }]
            ]
          }
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to send message to admin ${adminId}:`, error);
        failCount++;
      }
    }

    const resultMessage = `Habar adminga yuborildi. Muvaffaqiyatli: ${successCount} ta, muvaffaqiyatsiz: ${failCount} ta`;
    bot.sendMessage(chatId, resultMessage);
    saveUserChatHistory(chatId, resultMessage, true);
  } else if (pendingMovieSuggestions[userId]) {
    delete pendingMovieSuggestions[userId]; // Clear the pending movie suggestion flag

    // Forward the message to all admins
    let successCount = 0;
    let failCount = 0;
    for (let adminId of ADMIN_IDS) {
      try {
        await bot.forwardMessage(adminId, chatId, msg.message_id);
        await bot.sendMessage(adminId, `Movie suggestion from user:\nusername: ${username}\nname: ${msg.from.first_name} ${msg.from.last_name}\nuser_id: ${chatId}`);
        successCount++;
      } catch (error) {
        console.error(`Failed to forward message to admin ${adminId}:`, error);
        failCount++;
      }
    }

    const resultMessage = `Adminlar tasdiqlashini kuting. Muvaffaqiyatli: ${successCount} ta, muvaffaqiyatsiz: ${failCount} ta`;
    bot.sendMessage(chatId, resultMessage);
    saveUserChatHistory(chatId, resultMessage, true);
  } else if (postMap[userInput]) {
    const messageId = postMap[userInput];

    try {
      const forwardedMessage = await bot.forwardMessage(BOT_CHANNEL_ID, MOVIE_CHANNEL_ID, messageId);
      const forwardedMessageId = forwardedMessage.message_id;
      await bot.copyMessage(chatId, BOT_CHANNEL_ID, forwardedMessageId);
      const responseMessage = `Raqamga mos keladigan kino: ${userInput}`;
      bot.sendMessage(chatId, responseMessage);
      saveUserChatHistory(chatId, responseMessage, true);
    } catch (error) {
      console.error(error);
      const errorMessage = 'Kino yuborishda xatolik yuz berdi.';
      bot.sendMessage(chatId, errorMessage);
      saveUserChatHistory(chatId, errorMessage, true);
    }
  } else {
    const errorMessage = 'Bunday kino mavjud emas';
    bot.sendMessage(chatId, errorMessage);
    saveUserChatHistory(chatId, errorMessage, true);
  }
});

// Handle reply to user message from admin
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  if (data.startsWith('reply_')) {
    const userToReply = data.split('_')[1];
    bot.sendMessage(chatId, `Type your reply to user ${userToReply}:`);
    bot.once('message', async (replyMsg) => {
      try {
        await bot.sendMessage(userToReply, `Admindan habar keldi: \n${replyMsg.text}`);
        bot.sendMessage(chatId, `Javobingiz bunga yuborildi: ${userToReply}.`);
      } catch (error) {
        bot.sendMessage(chatId, `Javobingiz bunga yuborilmadi: ${userToReply}.`);
        console.error(error);
      }
    });
  }
});

// Handle polling errors
bot.on('polling_error', (error) => {
  console.error(error);
});

console.log('Bot ishga tushirildi');
