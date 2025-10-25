import { Telegraf } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { about } from './commands';
import { greeting } from './text';
import { development, production } from './core';
import createDebug from 'debug';

const debug = createDebug('bot:main');
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || ''; // URL of deployed Apps Script web app

const bot = new Telegraf(BOT_TOKEN);

// Helper function to generate a unique conversation ID
const generateConversationId = () => {
  return 'xxxxxxxxxxxxxxx'.replace(/[x]/g, () => {
    return ((Math.random() * 36) | 0).toString(36);
  });
};

// Command: /start
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id.toString();
  const userName = `${ctx.from?.first_name} ${ctx.from?.last_name || ''}`.trim();

  if (!userId) return ctx.reply('Error: Unable to identify user.');

  try {
    // Save user to Chats sheet with 'live' status
    await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'addUser',
      userId,
      userName,
    });

    // Trigger search for a partner
    await ctx.reply('Starting search for a partner...');
    await handleSearch(ctx, userId);
  } catch (error) {
    debug('Error in /start:', error);
    ctx.reply('An error occurred. Please try again.');
  }
});

// Command: /search
bot.command('search', async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId) return ctx.reply('Error: Unable to identify user.');

  try {
    // Update user status to 'live'
    await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'updateStatus',
      userId,
      status: 'live',
    });

    await handleSearch(ctx, userId);
  } catch (error) {
    debug('Error in /search:', error);
    ctx.reply('An error occurred while searching. Please try again.');
  }
});

// Command: /stop
bot.command('stop', async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId) return ctx.reply('Error: Unable to identify user.');

  try {
    // Get current conversation
    const response = await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'getUserConversation',
      userId,
    });

    const conversation = response.data.conversation;
    if (!conversation) {
      return ctx.reply('You are not in a conversation.');
    }

    const { conversationId, partnerId } = conversation;

    // Update user status to 'offline' and end conversation
    await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'stopConversation',
      userId,
      conversationId,
    });

    // Notify user
    await ctx.reply(
      `You stopped the dialog 🙄\nType /search to find a new partner\nConversation id: ${conversationId}\nTo report partner: @itzfewbot`
    );

    // Notify partner
    if (partnerId) {
      await bot.telegram.sendMessage(
        partnerId,
        `Your partner stopped the dialog 🙄\nType /search to find a new partner\nConversation id: ${conversationId}\nTo report partner: @itzfewbot`
      );
    }
  } catch (error) {
    debug('Error in /stop:', error);
    ctx.reply('An error occurred. Please try again.');
  }
});

// Command: /link
bot.command('link', async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId) return ctx.reply('Error: Unable to identify user.');

  try {
    // Get current conversation
    const response = await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'getUserConversation',
      userId,
    });

    const conversation = response.data.conversation;
    if (!conversation || !conversation.partnerId) {
      return ctx.reply('You are not in a conversation.');
    }

    // Request partner to share profile
    await bot.telegram.sendMessage(
      conversation.partnerId,
      `Your partner requested your profile. Use /share to send your profile.`
    );
    await ctx.reply('Profile request sent to your partner.');
  } catch (error) {
    debug('Error in /link:', error);
    ctx.reply('An error occurred. Please try again.');
  }
});

// Command: /share
bot.command('share', async (ctx) => {
  const userId = ctx.from?.id.toString();
  const userName = `${ctx.from?.first_name} ${ctx.from?.last_name || ''}`.trim();
  if (!userId) return ctx.reply('Error: Unable to identify user.');

  try {
    // Get current conversation
    const response = await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'getUserConversation',
      userId,
    });

    const conversation = response.data.conversation;
    if (!conversation || !conversation.partnerId) {
      return ctx.reply('You are not in a conversation.');
    }

    // Send profile to partner
    await bot.telegram.sendMessage(
      conversation.partnerId,
      `Profile shared: ${userName} (@${ctx.from?.username || 'No username'})`
    );
    await ctx.reply('Your profile has been shared with your partner.');
  } catch (error) {
    debug('Error in /share:', error);
    ctx.reply('An error occurred. Please try again.');
  }
});

// Handle message forwarding between partners
bot.on('message', async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId || !ctx.message) return;

  // Ignore commands
  if ('text' in ctx.message && ctx.message.text?.startsWith('/')) return;

  try {
    // Get current conversation
    const response = await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'getUserConversation',
      userId,
    });

    const conversation = response.data.conversation;
    if (!conversation || !conversation.partnerId) {
      return; // No active conversation
    }

    // Forward message to partner
    await ctx.telegram.forwardMessage(
      conversation.partnerId,
      ctx.chat?.id!,
      ctx.message.message_id
    );
  } catch (error) {
    debug('Error forwarding message:', error);
    ctx.reply('An error occurred while sending the message.');
  }
});

// Existing commands
bot.command('about', about());
bot.on('message', greeting());

// Helper function to handle partner search
const handleSearch = async (ctx: any, userId: string) => {
  try {
    // Find a partner
    const response = await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'findPartner',
      userId,
    });

    const partner = response.data.partner;
    if (!partner) {
      return ctx.reply('No partners available. Please try again later.');
    }

    const conversationId = generateConversationId();

    // Create conversation
    await axios.post(GOOGLE_APPS_SCRIPT_URL, {
      action: 'createConversation',
      userId,
      partnerId: partner.userId,
      conversationId,
    });

    // Notify both users
    const message = `Partner found 🐵\n/stop — stop this dialog\n/link — request users profile\nConversation id: ${conversationId}\nTo report partner: @itzfewbot`;

    await ctx.reply(message);
    await bot.telegram.sendMessage(partner.userId, message);
  } catch (error) {
    debug('Error in handleSearch:', error);
    ctx.reply('An error occurred while finding a partner.');
  }
};

// Production mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

// Development mode
if (ENVIRONMENT !== 'production') {
  development(bot);
}
