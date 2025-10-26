import { Context, MiddlewareFn } from 'telegraf';
import createDebug from 'debug';

const debug = createDebug('bot:greeting_text');

// Type guard for message_id
const hasMessageId = (msg: any): msg is { message_id: number } => {
  return msg && typeof msg === 'object' && 'message_id' in msg && typeof msg.message_id === 'number';
};

const replyToMessage = (ctx: Context, messageId: number, string: string): Promise<void> =>
  ctx.reply(string, {
    reply_parameters: { message_id: messageId },
  }).then(() => {});

const greeting: MiddlewareFn<Context> = async (ctx: Context): Promise<void> => {
  debug('Triggered "greeting" text command');

  const message = ctx.message;
  
  if (!message || !hasMessageId(message)) {
    return;
  }
  
  const messageId = message.message_id;
  const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim();

  await replyToMessage(ctx, messageId, 
    `👋 Hi ${userName}! Welcome to the Chat Match Bot! 🎉\n\n` +
    `Connect anonymously with random people and have fun chatting! Here’s how to get started:\n\n` +
    `📋 Available commands:\n` +
    `/start - Join and find a new chat partner\n` +
    `/search - Find a new chat partner\n` +
    `/stop - End your current conversation\n` +
    `/next - Switch to a new partner\n` +
    `/link - Request your partner’s profile\n` +
    `/share - Share your profile with your partner\n` +
    `/about - Learn more about this bot\n\n` +
    `Try /start to meet someone new! 🚀`
  );
};

export { greeting, hasMessageId };
