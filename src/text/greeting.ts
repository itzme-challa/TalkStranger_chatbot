import { Context, MiddlewareFn } from 'telegraf';
import createDebug from 'debug';

const debug = createDebug('bot:greeting_text');

// Type guard for message_id
const hasMessageId = (msg: any): msg is { message_id: number } => {
  return msg && typeof msg === 'object' && 'message_id' in msg && typeof msg.message_id === 'number';
};

const replyToMessage = (ctx: Context, messageId: number, string: string) =>
  ctx.reply(string, {
    reply_parameters: { message_id: messageId },
  });

const greeting: MiddlewareFn<Context> = async (ctx: Context) => {
  debug('Triggered "greeting" text command');

  const message = ctx.message;
  
  if (!message || !hasMessageId(message)) {
    return;
  }
  
  const messageId = message.message_id;
  const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim();

  await replyToMessage(ctx, messageId, 
    `Hi ${userName}! 👋\n\n` +
    `Welcome to the Chat Match Bot!\n\n` +
    `Available commands:\n` +
    `/start - Begin using the bot\n` +
    `/search - Find a random chat partner\n` +
    `/stop - End current conversation\n` +
    `/about - Learn more about the bot\n\n` +
    `Start with /start to get matched! 🎉`
  );
};

export { greeting, hasMessageId };
