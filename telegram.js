const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input'); // npm install input

// dotenv
require('dotenv').config();

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(process.env.TELEGRAM_SESSION_ID || '');

const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

(async () => {
    await client.start({
        phoneNumber: async () => await input.text('Enter your number: '),
        password: async () => await input.text('Enter your password: '),
        phoneCode: async () => await input.text('Enter the code you received: '),
        onError: (err) => console.log(err),
    });

    console.log('You are connected now!');
    console.log('Your session string:', client.session.save());

    await client.sendMessage('@wipbot', { message: 'help' });

    console.log('Message sent');
})();
