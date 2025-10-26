import { Telegraf, Context } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import { 
  handleStart, 
  handleSearch, 
  handleStop, 
  handleMessageForwarding 
} from './commands/matching';
import { greeting } from './text';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';

const bot = new Telegraf(BOT_TOKEN);

// Commands
bot.command('start', handleStart);
bot.command('search', handleSearch);
bot.command('stop', handleStop);

// Handle all text messages
bot.on('text', handleMessageForwarding);
bot.on('message', greeting());

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

//dev mode
ENVIRONMENT !== 'production' && development(bot);
