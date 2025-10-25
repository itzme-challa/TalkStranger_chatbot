// src/index.ts
import { Telegraf } from 'telegraf';
import { about } from './commands';
import { greeting, search, stop, link, share } from './text';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import axios from 'axios';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || '';

const bot = new Telegraf(BOT_TOKEN);

// Commands
bot.command('about', about());
bot.command('start', greeting());
bot.command('search', search());
bot.command('stop', stop());
bot.command('link', link());
bot.command('share', share());

// Handle text messages for forwarding to partner
bot.on('text', async (ctx) => {
  const chatId = ctx.message.chat.id.toString();
  const text = ctx.message.text;

  // Skip commands
  if (text.startsWith('/')) return;

  try {
    const response = await axios.post(GOOGLE_SHEET_URL, { action: 'getPartner', chatId });
    const { partnerId, isLive } = response.data;

    if (!isLive) {
      await ctx.reply('You are not active. Type /search to find a new partner.');
      return;
    }

    if (partnerId) {
      // Check if partner is live
      const partnerResponse = await axios.post(GOOGLE_SHEET_URL, { action: 'getPartner', chatId: partnerId });
      const { isLive: partnerIsLive } = partnerResponse.data;

      if (partnerIsLive) {
        await ctx.telegram.sendMessage(partnerId, text);
      } else {
        await ctx.reply('Your partner is no longer active. Type /search to find a new partner.');
        // Clear partner's ID since they are not live
        await axios.post(GOOGLE_SHEET_URL, { action: 'stopChat', chatId });
      }
    } else {
      await ctx.reply('No partner found. Type /search to find a new partner.');
    }
  } catch (error) {
    await ctx.reply('Error fetching partner. Please try again.');
  }
});

// Vercel production mode
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

// Development mode
if (ENVIRONMENT !== 'production') {
  development(bot);
}
