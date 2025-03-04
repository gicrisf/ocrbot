import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import { readFile } from "node:fs/promises";
import dotenv from 'dotenv';
import Replicate from "replicate";
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';

dotenv.config();

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    { polling: true }
);

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const MAX_LENGTH = 4096;
let messageId;
let currentText = '';

async function readableStreamToNodeReadable(readableStream) {
  const reader = readableStream.getReader();
  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null); // End the stream
      } else {
        this.push(value); // Push the chunk
      }
    },
  });
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Hello, I am your Telegram bot!');
});

bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const mimeType = msg.document.mime_type;

    // Check if the file is a PDF
    if (mimeType == 'application/pdf') {
        bot.sendMessage(chatId, 'Yay! A PDF file :3');

        bot.downloadFile(fileId, './')
            .then(filePath => {
                readFile(filePath)
                    .then(fileInput => replicate.run(
                        "cuuupid/markitdown:dbaed480930eebcf09fbfeac1050a58af8600088058b5124a10988d1ff3432fd",
                        { input: { doc: fileInput } }
                    ))
                    .then(stream => readableStreamToNodeReadable(stream))
                    .then(stream => {
                        bot.sendMessage(chatId, 'Starting stream...').then((sentMessage) => {
                            messageId = sentMessage.message_id;

                            const decoder = new TextDecoder();

                            stream.on('data', (chunk) => {
                                const newText = decoder.decode(chunk); // Decode Uint8Array to string
                                currentText += newText;

                                // Check if the text exceeds the limit
                                if (currentText.length > 4096) {
                                    // Send a new message with the overflow text
                                    bot.sendMessage(chatId, currentText.slice(4096)).then((newMessage) => {
                                        messageId = newMessage.message_id; // Update message ID
                                        currentText = currentText.slice(4096); // Reset current text
                                    });
                                } else {
                                    // Update the existing message
                                    bot.editMessageText(currentText, {
                                        chat_id: chatId,
                                        message_id: messageId
                                    });
                                }
                            });
                        });
                    })
                    .then(() => {
                        // Clean up
                        fs.unlinkSync(filePath);
                    })
            })
            .catch(error => {
                bot.sendMessage(chatId, 'Error in PDF conversion.');
                console.log(error);
            });
    } else {
        bot.sendMessage(chatId, 'I need a PDF file :c');
    }
});

console.log('Bot is running...');
