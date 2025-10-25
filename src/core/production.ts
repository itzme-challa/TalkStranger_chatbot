// src/core/production.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import createDebug from 'debug';
import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';

const debug = createDebug('bot:prod');

const VERCEL_URL = process.env.VERCEL_URL;

const production = async (
  req: VercelRequest,
  res: VercelResponse,
  bot: Telegraf<Context<Update>>,
) => {
  try {
    debug('Bot runs in production mode');

    if (!VERCEL_URL) {
      throw new Error('VERCEL_URL is not set.');
    }

    // Ensure webhook is set correctly
    const webhookUrl = `${VERCEL_URL}/api`;
    const getWebhookInfo = await bot.telegram.getWebhookInfo();
    if (getWebhookInfo.url !== webhookUrl) {
      debug(`Deleting existing webhook: ${getWebhookInfo.url}`);
      await bot.telegram.deleteWebhook();
      debug(`Setting webhook: ${webhookUrl}`);
      await bot.telegram.setWebhook(webhookUrl);
    }

    // Handle incoming request
    if (req.method === 'POST') {
      debug('Received POST request, handling update');
      await bot.handleUpdate(req.body as Update, res);
      return; // Ensure no further response is sent
    } else {
      debug('Received non-POST request, sending status');
      res.status(200).json('Listening to bot events...');
      return;
    }
  } catch (error: Error) {
    debug(`Error in production: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export { production };
