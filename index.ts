import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import { readFile } from "node:fs/promises";
import dotenv from 'dotenv';
import Replicate from "replicate";

dotenv.config();

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const replicate_token = process.env.REPLICATE_API_TOKEN;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  return reader.read().then(function processChunk({ done, value }): Promise<string> {
    if (done) return Promise.resolve(result);
    result += decoder.decode(value, { stream: true }); // Decode bytes to string
    return reader.read().then(processChunk); // Chain the next read
  });
}

const MAX_LENGTH = 4096;

function sendTextInChunks(chatId: number, text: string) {
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    const chunk = text.substring(i, i + MAX_LENGTH);
    bot.sendMessage(chatId, chunk);
  }
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Hello, I am your Telegram bot!');
});

// Try with the default PDF
bot.onText(/\/try/, (msg) => {
    const chatId = msg.chat.id;
    replicate.run(
        "cuuupid/markitdown:dbaed480930eebcf09fbfeac1050a58af8600088058b5124a10988d1ff3432fd",
        {
            input: {
                doc: "https://replicate.delivery/pbxt/M9lE653pyLnXBk7P0VrmymcjqvQyXKsBBUgNkLz3YN2Y9wdw/Tradewinds%2BMarketplace%2BAnnouncement%2BRevision%2B6.pdf"
            }
        }
    ).then((output) => {
        collectStream(output).then(finalString => {
            // console.log(finalString);
            bot.sendMessage(chatId, finalString);
        });
    });
});

bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const mimeType = msg.document.mime_type;

    // Check if the file is a PDF
    if (mimeType == 'application/pdf') {
        bot.sendMessage(chatId, 'Yay! A PDF file :3');

        bot.downloadFile(fileId, './')
            .then(filePath => readFile(filePath))
            .then(fileInput => replicate.run(
                "cuuupid/markitdown:dbaed480930eebcf09fbfeac1050a58af8600088058b5124a10988d1ff3432fd",
                { input: { doc: fileInput } }
            ))
            .then(output => {
                collectStream(output).then(finalString => {
                    // console.log(finalString);
                    sendTextInChunks(chatId, finalString);
                });
            })
            .catch(error => {
                bot.sendMessage(chatId, 'Error in PDF conversion.');
                console.log(error);
            });
    } else {
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
    }
});

console.log('Bot is running...');
