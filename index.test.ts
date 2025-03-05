import { Readable } from 'stream';
import { mockNodeStreamFromPdf } from './index';
import FakeBot from './fakebot';

const bot = new FakeBot();

describe('FakeBot', () => {
  let bot: FakeBot;

  beforeEach(() => {
    bot = new FakeBot();
  });

  it('stores sent messages with auto-incrementing IDs', async () => {
    const response1 = await bot.sendMessage(123, "ciao");
    const response2 = await bot.sendMessage(456, "hello");

    const message1 = bot.getMessage(response1.message_id);
    expect(message1).toEqual({
      text: "ciao",
      chatId: 123
    });

    const message2 = bot.getMessage(response2.message_id);
    expect(message2?.text).toBe("hello");
    expect(message2?.chatId).toBe(456);
  });

  it('allows message editing by message ID', async () => {
    const { message_id } = await bot.sendMessage(789, "original");
    await bot.editMessageText("edited", {
      chat_id: 789,
      message_id
    });

    const updated = bot.getMessage(message_id);
    expect(updated?.text).toBe("edited");
  });

  it('throws error when editing non-existent message', async () => {
    await expect(
      bot.editMessageText("test", { chat_id: 1, message_id: 999 })
    ).rejects.toThrow("Message not found");
  });
});

describe('mockNodeStreamFromPdf', () => {
  it('should generate 2 chunks with 2s delay', async () => {
    const stream = await mockNodeStreamFromPdf();

    const chunks: Buffer[] = [];
    const timestamps: number[] = [];

    // Collect data and timestamps
    const dataHandler = (chunk: Buffer) => {
      timestamps.push(Date.now());
      chunks.push(chunk);
    };

    await new Promise<void>((resolve, reject) => {
      stream
        .on('data', dataHandler)
        .on('end', () => resolve())
        .on('error', reject);
    });

    // Basic assertions
    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBe(1024);
    expect(chunks[1].length).toBe(1024);

    // Timing assertion (2s ± 100ms tolerance)
    const timeDiff = timestamps[1] - timestamps[0];
    expect(timeDiff).toBeGreaterThanOrEqual(1900);
    expect(timeDiff).toBeLessThanOrEqual(2100);
  }, 10000); // Extend test timeout to 10 seconds
});
