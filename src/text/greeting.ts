import { Context } from 'telegraf';
import createDebug from 'debug';
import { getUserStatus, updateUserStatus } from '../utils/sheets';

const debug = createDebug('bot:greeting_text');

const replyToMessage = (ctx: Context, messageId: number, string: string) =>
  ctx.reply(string, {
    reply_to_message_id: messageId,
  });

const greeting = () => async (ctx: Context) => {
  debug('Triggered "greeting" text command');

  const messageId = ctx.message?.message_id;
  const userId = ctx.from?.id.toString();
  const userName = `${ctx.message?.from.first_name || ''} ${ctx.message?.from.last_name || ''}`.trim();

  if (!userId) {
    return ctx.reply('Error: Unable to identify user. Please try again.');
  }

  if (messageId) {
    // Check if user exists in chats sheet, if not create
    const userStatus = await getUserStatus(userId);
    if (!userStatus) {
      await updateUserStatus(userId, 'live');
      await replyToMessage(ctx, messageId, `Hello, ${userName}! 👋\n\nWelcome to the conversation bot!\n\nCommands:\n/start - Start looking for a conversation\n/search - Find a random partner\n/stop - End current conversation`);
    } else {
      const status = userStatus.status;
      let response = `Hello, ${userName}! 👋\n\nYour current status: ${status}\n\n`;
      
      if (status === 'live') {
        response += 'You are ready to chat! Use /search to find a partner.';
      } else if (status === 'offline') {
        response += 'You are offline. Use /start to become available for conversations.';
      }
      
      await replyToMessage(ctx, messageId, response);
    }
  }
};

export { greeting };
