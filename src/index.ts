// src/index.ts
import { Telegraf } from 'telegraf';
import { about } from './commands';
import { greeting, search, stop, link, share } from './text';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import axios from 'axios';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || ''; // Add Web App URL to Vercel environment variables

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
    const { partnerId } = response.data;

    if (partnerId) {
      await ctx.telegram.sendMessage(partnerId, text);
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
