import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import { readFile } from "node:fs/promises";
import dotenv from 'dotenv';
import Replicate from "replicate";
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';
import { produce } from "immer";
import pino from 'pino';

dotenv.config();
const logger = pino({ level: 'debug' });

type BotState = {
    fileBeingProcessed: string | undefined;
    messageId: number | undefined;
    currentText: string;
}

let state: BotState = {
    fileBeingProcessed: undefined,
    messageId: undefined,
    currentText: '',
};

if (process.env.TELEGRAM_TOKEN == undefined) {
  throw new Error("TELEGRAM_TOKEN is not defined in the environment variables.");
}

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    { polling: true }
);

type ReplicateModel = `${string}/${string}` | `${string}/${string}:${string}`;

// Type guard for ReplicateModel
function isReplicateModel(str: string): str is ReplicateModel {
    return /^[^/]+\/[^/]+(:[^/]+)?$/.test(str);
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const actions = {
    newFile: (msg: TelegramBot.Message) => {
        // TODO Check if file is already in the bot state
        // TODO Add SQLite DB that stores filenames and outputs
        // This way, you should avoid doing the work multiple times
        // How to identify the files? That's a problem for the future me.
        state = produce(state, draft => {
            if (msg.document) {
                draft.fileBeingProcessed = msg.document.file_id;
            } else {
                throw new Error(`Message ${msg.message_id} has no document with it.`);
            }
        });
    },
    setMessage: (msg: TelegramBot.Message) => {
        const messageId = msg.message_id;
        logger.debug({ messageId }, 'Set message');
        state = produce(state, draft => {
            draft.messageId = messageId;
        });
    },
    setBuffer: (text: string) => {
        state = produce(state, draft => {
            // Keep the remaining text
            draft.currentText = text;
        });
    },
    appendBuffer: (text: string) => {
        // Append the new text to the accumulated text
        state = produce(state, draft => {
            draft.currentText += text;
        });
    },
}

async function nodeStreamFromPdf(filePath: string) {
    // Read the downloaded file into memory
    const fileInput = await readFile(filePath);
    // Get model
    const model = process.env.REPLICATE_MODEL;

    if (model == undefined) {
        throw new Error("REPLICATE_MODEL is not defined in the environment variables.");
    }
    if (!isReplicateModel(model)) {
        throw new Error("Invalid model: REPLICATE_MODEL is not recognized. Ensure the model is correctly defined and matches the expected format.");
    }
    // Run the file through a model
    const stream = await replicate.run(model, { input: { doc: fileInput } }) as ReadableStream;
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

export async function mockNodeStreamFromPdf() {
    let size = 2048; // Total size to ensure only 2 chunks
    let chunkSize = 1024; // Size of each chunk

    async function* generateChunks() {
        while (size > 0) {
            const bytes = new Uint8Array(Math.min(chunkSize, size));
            crypto.getRandomValues(bytes);
            size -= bytes.length;
            yield bytes;

            if (size > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
            }
        }
    }

    const chunkGenerator = generateChunks();

    return new Readable({
        async read() {
            const { value, done } = await chunkGenerator.next();
            if (done) {
                this.push(null); // End the stream
            } else {
                this.push(value);
            }
        }
    });
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Hello, I am your Telegram bot!');
    logger.debug({ msg }, "Start.")
});

bot.on('document', async (msg) => {
    if (!msg.document) {
        throw new Error(`Message ${msg.message_id} has no document with it.`);
    }
    // Check if the file is a PDF
    if (msg.document.mime_type == 'application/pdf') {
        bot.sendMessage(msg.chat.id, 'Yay! A PDF file :3');
        // List among the file being processed by the bot
        actions.newFile(msg);
        // Download the file using the provided file id
        const filePath = await bot.downloadFile(msg.document.file_id, './');
        // Get stream of strings from file
        // TODO Switch between test and production modes
        // const nodeStream = await nodeStreamFromPdf(filePath)
        const nodeStream = await mockNodeStreamFromPdf();
        // Notify the user that the stream is starting
        const sentMessage = await bot.sendMessage(msg.chat.id, 'Starting stream...');
        // Store the message ID for later editing
        actions.setMessage(sentMessage);
        // Decode binary chunks to text
        const decoder = new TextDecoder();
        // Handle incoming data chunks from the stream
        nodeStream.on('data', async (chunk) => {
            // Decode the chunk to text
            const newText = decoder.decode(chunk);
            actions.appendBuffer(newText);
            // If exceeds the Telegram message limit
            if (state.currentText.length > 4096) {
                // Send a new message with the overflow text
                const newMessage = await bot.sendMessage(msg.chat.id, state.currentText.slice(4096));
                // Update the message ID for editing
                actions.setMessage(newMessage);
                actions.setBuffer(state.currentText.slice(4096));
            } else {
                try {
                    await bot.editMessageText(state.currentText, { chat_id: msg.chat.id, message_id: state.messageId });
                } catch (error) {
                    logger.error(error, 'Failed to edit message');
                }
            }
        });

        // Wait for the stream to end
        await new Promise((resolve) => nodeStream.on('end', resolve));
        // Clean up by deleting the downloaded file
        fs.unlinkSync(filePath);
    } else {
        bot.sendMessage(msg.chat.id, 'I need a PDF file :c');
    }
});

console.log('Bot is running...');
