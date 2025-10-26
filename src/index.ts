import { Telegraf } from 'telegraf';
import { about } from './commands';
import { greeting, handleMessage, handleSearch, handleStop, handleStart } from './text';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';

const bot = new Telegraf(BOT_TOKEN);

// Register commands
bot.command('start', handleStart());
bot.command('search', handleSearch());
bot.command('stop', handleStop());
bot.command('about', about());
bot.on('message', handleMessage());

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};
//dev mode
ENVIRONMENT !== 'production' && development(bot);
