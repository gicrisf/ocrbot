export default class FakeBot {
  private messages: Map<number, { text: string, chatId: number }>;
  private messageIdCounter: number;

  constructor() {
    this.messages = new Map();
    this.messageIdCounter = 0;
  }

  async sendMessage(chatId: number, text: string) {
    const messageId = ++this.messageIdCounter;
    this.messages.set(messageId, { text, chatId });
    return Promise.resolve({
      message_id: messageId,
      chat: { id: chatId },
      text: text
    });
  }

  async editMessageText(text: string, options: { chat_id: number; message_id: number }) {
    if (!this.messages.has(options.message_id)) {
      throw new Error("Message not found");
    }
    const message = this.messages.get(options.message_id)!;
    message.text = text;
    return Promise.resolve({ ...message, message_id: options.message_id });
  }

  // Test inspection methods
  getMessage(messageId: number) {
    return this.messages.get(messageId);
  }

  reset() {
    this.messages.clear();
    this.messageIdCounter = 0;
  }
}
