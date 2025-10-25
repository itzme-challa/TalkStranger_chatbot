// src/index.ts
import { Telegraf } from 'telegraf';
import { about } from './commands';
import { greeting, search, stop, link, share } from './text';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import axios from 'axios';
import createDebug from 'debug';
import { CallbackQuery } from 'telegraf/typings/core/types/typegram';

const debug = createDebug('bot:main');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || '';

if (!BOT_TOKEN) {
  debug('BOT_TOKEN is not set');
  throw new Error('BOT_TOKEN is not set');
}

if (!GOOGLE_SHEET_URL) {
  debug('GOOGLE_SHEET_URL is not set');
  throw new Error('GOOGLE_SHEET_URL is not set');
}

const bot = new Telegraf(BOT_TOKEN);

// Commands
bot.command('about', about());
bot.command('start', greeting());
bot.command('search', search());
bot.command('stop', stop());
bot.command('link', link());
bot.command('share', share());

// Handle callback queries for inline buttons
bot.on('callback_query', async (ctx) => {
  const callbackQuery = ctx.callbackQuery as CallbackQuery & { data: string };
  const data = callbackQuery.data;

  try {
    debug(`Handling callback query: ${data}`);
    if (data === 'search') {
      await search()(ctx);
    } else if (data === 'stop') {
      await stop()(ctx);
    } else if (data === 'link') {
      await link()(ctx);
    } else if (data === 'share') {
      await share()(ctx);
    }
    await ctx.answerCbQuery();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug(`Error in callback query: ${errorMessage}`);
    await ctx.answerCbQuery('An error occurred. Please try again.');
  }
});

// Handle text messages for forwarding to partner
bot.on('text', async (ctx) => {
  const chatId = ctx.message.chat.id.toString();
  const text = ctx.message.text;

  // Skip commands
  if (text.startsWith('/')) return;

  try {
    debug(`Processing text message for chat ID: ${chatId}`);
    const response = await axios.post(GOOGLE_SHEET_URL, { action: 'getPartner', chatId });
    const { partnerId, isLive } = response.data;

    if (!isLive) {
      await ctx.reply('You are not active. Use the button below to find a new partner.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🚀 Find a partner', callback_data: 'search' }]],
        },
      });
      return;
    }

    if (partnerId) {
      const partnerResponse = await axios.post(GOOGLE_SHEET_URL, { action: 'getPartner', chatId: partnerId });
      const { isLive: partnerIsLive } = partnerResponse.data;

      if (partnerIsLive) {
        await ctx.telegram.sendMessage(partnerId, text);
      } else {
        await ctx.reply('Your partner is no longer active. Use the button below to find a new partner.', {
          reply_markup: {
            inline_keyboard: [[{ text: '🚀 Find a partner', callback_data: 'search' }]],
          },
        });
        await axios.post(GOOGLE_SHEET_URL, { action: 'stopChat', chatId });
      }
    } else {
      await ctx.reply('No partner found. Use the button below to find a new partner.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🚀 Find a partner', callback_data: 'search' }]],
        },
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug(`Error in text handler: ${errorMessage}`);
    await ctx.reply('Error fetching partner. Please try again.');
  }
});

// Vercel production mode
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  try {
    await production(req, res, bot);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug(`Error in startVercel: ${errorMessage}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Development mode
if (ENVIRONMENT !== 'production') {
  development(bot);
}
