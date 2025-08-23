import { Context } from 'telegraf';
import createDebug from 'debug';
import { generateGeminiResponse, resetContext } from '../services/gemini';

const debug = createDebug('bot:greeting_text');

const replyToMessage = (ctx: Context, messageId: number, string: string) =>
  ctx.reply(string, {
    reply_parameters: { message_id: messageId },
  });

const greeting = () => async (ctx: Context) => {
  debug('Triggered "greeting" text command');

  if (!ctx.message || !('text' in ctx.message)) return;
  
  const messageId = ctx.message.message_id;
  const chatId = ctx.chat?.id;
  const text = ctx.message.text;

  if (!messageId || !chatId || !text) return;

  // Handle commands
  if (text.startsWith('/')) {
    if (text === '/reset') {
      resetContext(chatId);
      await replyToMessage(ctx, messageId, '🔄 Conversation context has been reset.');
      return;
    }
    return;
  }

  try {
    // Send thinking message
    await ctx.reply('💭 Thinking...', {
      reply_parameters: { message_id: messageId },
    });

    // Generate response using Gemini
    const response = await generateGeminiResponse(chatId, text);
    await replyToMessage(ctx, messageId, response);

  } catch (error) {
    console.error('Error generating response:', error);
    await replyToMessage(ctx, messageId, '⚠️ Sorry, something went wrong while generating the response.');
  }
};

export { greeting };
