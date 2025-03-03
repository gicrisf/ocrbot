import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Hello, I am your Telegram bot!');
});

bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;

    // Download the file
    bot.downloadFile(fileId, './').then((filePath) => {
        const file = Bun.file(filePath);

        const newFilePath = './touched-text.txt';
        const newFile = Bun.file(newFilePath);

        file.text()
            .then(data => {
                // Modify the content
                const modifiedContent = data + '\nThis file has been touched by the bot.';

                // Write the modified content to a new file
                Bun.write(newFilePath, modifiedContent)
                    .then(() => bot.sendDocument(chatId, newFilePath))
                    .catch(error => {
                        bot.sendMessage(chatId, 'Error sending the file back.');
                        console.error('Error:', error);
                    });
            })
            .catch(error => {
                bot.sendMessage(chatId, 'Error reading the file.');
                console.error('Error:', error);
            });


        // Bun delete function is... problematic
        // It looks like a bug of the runtime itself
        fs.unlinkSync(filePath);
        fs.unlinkSync(newFilePath);
    });
});

console.log('Bot is running...');
