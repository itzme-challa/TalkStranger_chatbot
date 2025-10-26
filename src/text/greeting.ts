import { Context } from 'telegraf';
import createDebug from 'debug';

const debug = createDebug('bot:greeting_text');

const replyToMessage = (ctx: Context, messageId: number, string: string) =>
  ctx.reply(string, {
    reply_to_message_id: messageId,
  });

const greeting: Middleware<Context> = async (ctx: Context) => {
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

export { greeting };
