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
    const mimeType = msg.document.mime_type;

    // Check if the file is a PDF
    // if (mimeType !== 'application/pdf') {
    //     bot.sendMessage(chatId, 'Please send a PDF file.');
    //     return;
    // }

    // Download the file
    bot.downloadFile(fileId, './').then((filePath) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                bot.sendMessage(chatId, 'Error reading the file.');
                return;
            }

            // Modify the content (e.g., append a line)
            const modifiedContent = data + '\nThis file has been touched by the bot.';

            // Write the modified content to a new file
            const newFilePath = './touched-text.txt';
            fs.writeFile(newFilePath, modifiedContent, (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Error writing the modified file.');
                    return;
                }

                // Send the modified file back to the user
                bot.sendDocument(chatId, newFilePath).then(() => {
                    // Clean up the files
                    fs.unlinkSync(filePath);
                    fs.unlinkSync(newFilePath);
                });
            });
        });
    });
});

console.log('Bot is running...');
