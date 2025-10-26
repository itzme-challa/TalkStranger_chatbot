import { Telegraf } from 'telegraf';
import { about } from './commands';
import { greeting } from './text';
import { start, search, stop } from './commands/conversation';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';

const bot = new Telegraf(BOT_TOKEN);

// Basic commands
bot.command('about', about());
bot.command('start', start());
bot.command('search', search());
bot.command('stop', stop());

// Handle regular messages
bot.on('message', greeting());

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

//dev mode
ENVIRONMENT !== 'production' && development(bot);
