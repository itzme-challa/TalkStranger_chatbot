// src/index.ts
import { Telegraf } from 'telegraf';
import { about } from './commands';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || ''; // Set this to your Google Apps Script web app URL

const bot = new Telegraf(BOT_TOKEN);

bot.command('about', about());

const callWebApp = async (action: string, params: Record<string, string> = {}) => {
  const searchParams = new URLSearchParams(params);
  const url = `${WEBAPP_URL}?action=${action}&${searchParams.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data;
};

const getMyConv = async (chatId: string, targetStatus: string = 'start') => {
  const res = await callWebApp('getConversationForUser', { user: chatId, status: targetStatus });
  return res;
};

const tryMatch = async (ctx: any, chatId: string) => {
  const lives: string[] = await callWebApp('getLiveChats');
  const others = lives.filter(id => id !== chatId);
  if (others.length === 0) {
    ctx.reply('No partners available right now. Try again later!');
    return null;
  }
  const partner = others[Math.floor(Math.random() * others.length)];
  const convId = Date.now().toString();
  const id1 = Math.min(chatId, partner);
  const id2 = Math.max(chatId, partner);
  await callWebApp('saveTalk', {
    conversationid: convId,
    partnerid1: id1,
    partnerid2: id2,
    status: 'start'
  });
  ctx.reply('Matched with a partner! Send messages here, and I\'ll forward them.');
  await bot.telegram.sendMessage(partner, 'You have been matched with a partner! Send messages to the bot to chat.');
  return { convId, partner };
};

bot.command('start', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const startConv = await getMyConv(chatId, 'start');
  if (startConv) {
    ctx.reply('You are already in an active conversation. Use /stop to end it first.');
    return;
  }
  await callWebApp('saveChat', { chatid: chatId, status: 'live' });
  await tryMatch(ctx, chatId);
});

bot.command('search', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const startConv = await getMyConv(chatId, 'start');
  if (startConv) {
    ctx.reply('You are already matched with a partner. Please /stop this conversation and then /search again.');
    return;
  }
  await callWebApp('saveChat', { chatid: chatId, status: 'live' });
  await tryMatch(ctx, chatId);
});

bot.command('stop', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const myConv = await getMyConv(chatId, 'start');
  if (!myConv) {
    ctx.reply('No active conversation found.');
    return;
  }
  await callWebApp('updateConversationStatus', { conversationid: myConv.conversationid, status: 'end' });
  await callWebApp('saveChat', { chatid: myConv.partnerid1, status: 'offline' });
  await callWebApp('saveChat', { chatid: myConv.partnerid2, status: 'offline' });
  const partner = myConv.partnerid1 === chatId ? myConv.partnerid2 : myConv.partnerid1;
  ctx.reply('Conversation ended.');
  await bot.telegram.sendMessage(partner, 'Your partner has ended the conversation.');
});

const handleText = async (ctx: any) => {
  if (ctx.message.text.startsWith('/')) return;
  const chatId = ctx.chat.id.toString();
  const startConv = await getMyConv(chatId, 'start');
  if (startConv) {
    const partner = startConv.partnerid1 === chatId ? startConv.partnerid2 : startConv.partnerid1;
    await bot.telegram.forwardMessage(partner, ctx.chat.id, ctx.message.message_id);
    return;
  }
  const endConv = await getMyConv(chatId, 'end');
  if (endConv) {
    ctx.reply("I don't understand. Please try /search for a new partner.");
    return;
  }
  // Fallback greeting for no conversation
  const messageId = ctx.message?.message_id;
  const userName = `${ctx.message?.from.first_name} ${ctx.message?.from.last_name || ''}`.trim();
  if (messageId) {
    await ctx.reply(`Hello, ${userName}! Use /start or /search to find a chat partner.`);
  }
};

bot.on('text', handleText);

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};
//dev mode
if (process.env.NODE_ENV !== 'production') {
  development(bot);
}
