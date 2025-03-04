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

let messageId;
let currentText = '';

async function nodeStreamFromPdf(filePath: string) {
    // Read the downloaded file into memory
    const fileInput = await readFile(filePath);
    // Run the file through a model
    const stream = await replicate.run(process.env.REPLICATE_MODEL, { input: { doc: fileInput } });
    // Convert the stream to a Node.js readable stream
    const reader = stream.getReader();
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

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const mimeType = msg.document.mime_type;

    // Check if the file is a PDF
    if (mimeType == 'application/pdf') {
        bot.sendMessage(chatId, 'Yay! A PDF file :3');

        try {
            // Download the file using the provided fileId
            const filePath = await bot.downloadFile(fileId, './');
            // Get stream of strings from file
            const nodeStream = await nodeStreamFromPdf(fileId);
            // Notify the user that the stream is starting
            const sentMessage = await bot.sendMessage(chatId, 'Starting stream...');
            // Store the message ID for later editing
            let messageId = sentMessage.message_id;
            // Decode binary chunks to text
            const decoder = new TextDecoder();
            // Handle incoming data chunks from the stream
            nodeStream.on('data', async (chunk) => {
                // Decode the chunk to text
                const newText = decoder.decode(chunk);
                // Append the new text to the accumulated text
                currentText += newText;

                // If exceeds the Telegram message limit
                if (currentText.length > 4096) {
                    // Send a new message with the overflow text
                    const newMessage = await bot.sendMessage(chatId, currentText.slice(4096));
                    // Update the message ID for editing
                    messageId = newMessage.message_id;
                    // Keep the remaining text
                    currentText = currentText.slice(4096);
                } else {
                    // Edit the existing message
                    await bot.editMessageText(currentText, {
                        chat_id: chatId,
                        message_id: messageId
                    });
                }
            });

            // Wait for the stream to end
            await new Promise((resolve) => nodeStream.on('end', resolve));
            // Clean up by deleting the downloaded file
            fs.unlinkSync(filePath);
        } catch (error) {
            await bot.sendMessage(chatId, 'Error in PDF conversion.');
            console.log(error);
        }

    } else {
        bot.sendMessage(chatId, 'I need a PDF file :c');
    }
});

console.log('Bot is running...');
