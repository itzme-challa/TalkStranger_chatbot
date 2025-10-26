import { Context } from 'telegraf';
import createDebug from 'debug';

const debug = createDebug('bot:greeting_text');

const replyToMessage = (ctx: Context, messageId: number, string: string) =>
  ctx.reply(string, {
    reply_to_message_id: messageId,
  });

const greeting = () => async (ctx: Context) => {
  debug('Triggered "greeting" text command');

  const messageId = ctx.message?.message_id;
  const userName = `${ctx.message?.from.first_name} ${ctx.message?.from.last_name || ''}`.trim();

  if (messageId) {
    await replyToMessage(
      ctx,
      messageId,
      `Hello, ${userName}! 👋\n\n` +
      `I'm your chat partner finder bot!\n\n` +
      `Commands:\n` +
      `/start - Go live and wait for matches\n` +
      `/search - Find a random partner\n` +
      `/stop - End current conversation\n\n` +
      `Just send messages to chat with your partner!`
    );
  }
};

export { greeting };
