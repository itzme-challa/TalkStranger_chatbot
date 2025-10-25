// src/text/greeting.ts
import { Context } from 'telegraf';
import createDebug from 'debug';
import axios from 'axios';

const debug = createDebug('bot:greeting_text');
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || '';

const replyToMessage = (ctx: Context, messageId: number, string: string) =>
  ctx.reply(string, {
    reply_parameters: { message_id: messageId },
  });

// Function to encrypt chat ID (0-9 replaced with a-j)
const encryptChatId = (chatId: string): string => {
  const digitMap: { [key: string]: string } = {
    '0': 'a',
    '1': 'b',
    '2': 'c',
    '3': 'd',
    '4': 'e',
    '5': 'f',
    '6': 'g',
    '7': 'h',
    '8': 'i',
    '9': 'j',
  };
  return chatId.replace(/[0-9]/g, (digit) => digitMap[digit] || digit);
};

const greeting = () => async (ctx: Context) => {
  debug('Triggered "greeting" command');

  const messageId = ctx.message?.message_id;
  const chatId = ctx.message?.chat.id.toString();
  const userName = `${ctx.message?.from.first_name} ${ctx.message?.from.last_name || ''}`.trim();

  if (messageId && chatId) {
    try {
      // Save chat ID and set status to live
      await axios.post(GOOGLE_SHEET_URL, { action: 'saveChatId', chatId });
      await replyToMessage(ctx, messageId, `Hello, ${userName}! Looking for a partner...`);
      await search()(ctx); // Trigger search automatically
    } catch (error) {
      await replyToMessage(ctx, messageId, 'Error saving your chat ID. Please try again.');
    }
  }
};

const search = () => async (ctx: Context) => {
  debug('Triggered "search" command');

  const messageId = ctx.message?.message_id;
  const chatId = ctx.message?.chat.id.toString();

  if (messageId && chatId) {
    try {
      // Ensure user is marked as live
      await axios.post(GOOGLE_SHEET_URL, { action: 'saveChatId', chatId });
      const response = await axios.post(GOOGLE_SHEET_URL, { action: 'findPartner', chatId });
      const { status, partnerId } = response.data;

      if (status === 'success' && partnerId) {
        await replyToMessage(ctx, messageId, `Partner found 🐵\n/stop — stop this dialog\n/link — Request partner's profile`);
        await ctx.telegram.sendMessage(partnerId, `Partner found 🐵\n/stop — stop this dialog\n/link — Request partner's profile`);
      } else {
        await replyToMessage(ctx, messageId, 'No live partners found. Try again later.');
      }
    } catch (error) {
      await replyToMessage(ctx, messageId, 'Error searching for a partner. Please try again.');
    }
  }
};

const stop = () => async (ctx: Context) => {
  debug('Triggered "stop" command');

  const messageId = ctx.message?.message_id;
  const chatId = ctx.message?.chat.id.toString();

  if (messageId && chatId) {
    try {
      const response = await axios.post(GOOGLE_SHEET_URL, { action: 'stopChat', chatId });
      const { partnerId } = response.data;

      const reportMessage = partnerId
        ? `You stopped the dialog 🙄\nType /search to find a new partner\n\nTo report partner: @itzfewbot ${encryptChatId(partnerId)}`
        : `You stopped the dialog 🙄\nType /search to find a new partner\n\nTo report partner: @itzfewbot`;

      await replyToMessage(ctx, messageId, reportMessage);
      if (partnerId) {
        await ctx.telegram.sendMessage(
          partnerId,
          `Your partner has stopped the dialog 😞\nType /search to find a new partner\n\nTo report partner: @itzfewbot ${encryptChatId(chatId)}`
        );
      }
    } catch (error) {
      await replyToMessage(ctx, messageId, 'Error stopping the chat. Please try again.');
    }
  }
};

const link = () => async (ctx: Context) => {
  debug('Triggered "link" command');

  const messageId = ctx.message?.message_id;
  const chatId = ctx.message?.chat.id.toString();

  if (messageId && chatId) {
    try {
      const response = await axios.post(GOOGLE_SHEET_URL, { action: 'getPartner', chatId });
      const { partnerId, isLive } = response.data;

      if (!isLive) {
        await replyToMessage(ctx, messageId, 'You are not active. Type /search to find a new partner.');
        return;
      }

      if (partnerId) {
        // Check if partner is live
        const partnerResponse = await axios.post(GOOGLE_SHEET_URL, { action: 'getPartner', chatId: partnerId });
        const { isLive: partnerIsLive } = partnerResponse.data;

        if (partnerIsLive) {
          await ctx.telegram.sendMessage(partnerId, 'Your partner wants to share profiles. Use /share to send your profile link.');
          await replyToMessage(ctx, messageId, 'Requested your partner to share their profile.');
        } else {
          await replyToMessage(
            ctx,
            messageId,
            `Your partner is no longer active. Type /search to find a new partner.\n\nTo report partner: @itzfewbot ${encryptChatId(partnerId)}`
          );
          await axios.post(GOOGLE_SHEET_URL, { action: 'stopChat', chatId });
        }
      } else {
        await replyToMessage(ctx, messageId, 'No partner found. Type /search to find a new partner.');
      }
    } catch (error) {
      await replyToMessage(ctx, messageId, 'Error requesting profile link. Please try again.');
    }
  }
};

const share = () => async (ctx: Context) => {
  debug('Triggered "share" command');

  const messageId = ctx.message?.message_id;
  const chatId = ctx.message?.chat.id.toString();
  const username = ctx.message?.from.username;

  if (messageId && chatId) {
    try {
      const response = await axios.post(GOOGLE_SHEET_URL, { action: 'getPartner', chatId });
      const { partnerId, isLive } = response.data;

      if (!isLive) {
        await replyToMessage(ctx, messageId, 'You are not active. Type /search to find a new partner.');
        return;
      }

      if (partnerId) {
        // Check if partner is live
        const partnerResponse = await axios.post(GOOGLE_SHEET_URL, { action: 'getPartner', chatId: partnerId });
        const { isLive: partnerIsLive } = partnerResponse.data;

        if (partnerIsLive) {
          const profileLink = username ? `https://t.me/${username}` : `https://t.me/id${chatId}`;
          await ctx.telegram.sendMessage(partnerId, `Your partner's profile: ${profileLink}`);
          await replyToMessage(ctx, messageId, 'Your profile link has been shared with your partner.');
        } else {
          await replyToMessage(
            ctx,
            messageId,
            `Your partner is no longer active. Type /search to find a new partner.\n\nTo report partner: @itzfewbot ${encryptChatId(partnerId)}`
          );
          await axios.post(GOOGLE_SHEET_URL, { action: 'stopChat', chatId });
        }
      } else {
        await replyToMessage(ctx, messageId, 'No partner found. Type /search to find a new partner.');
      }
    } catch (error) {
      await replyToMessage(ctx, messageId, 'Error sharing profile link. Please try again.');
    }
  }
};

export { greeting, search, stop, link, share };
