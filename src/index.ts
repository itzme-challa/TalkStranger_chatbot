import { Telegraf, Context, Middleware } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { about } from './commands';
import { greeting } from './text';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import { getScriptUrl } from './utils/google-sheets';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const SHEET_ID = '1Qzgu7YnL23Nxf-2oznc77wYKuc2EXtMKDp8Ztm9p4J4';

const bot = new Telegraf(BOT_TOKEN);

// Google Sheets API base URL
const SCRIPT_URL = getScriptUrl(SHEET_ID);

// Commands
bot.command('about', about());
bot.command('start', handleStart());
bot.command('search', handleSearch());
bot.command('stop', handleStop());

// Handle all messages
bot.on('message', handleMessage());

// Production mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

// Development mode
ENVIRONMENT !== 'production' && development(bot);

// MARK: Command Handlers

function handleStart(): Middleware<Context<Update>> {
  return async (ctx: Context<Update>) => {
    const chatId = ctx.chat?.id?.toString() || '';
    const userId = ctx.from?.id?.toString() || '';
    const firstName = ctx.from?.first_name || '';
    const lastName = ctx.from?.last_name || '';

    if (!chatId || !userId) {
      console.error('Invalid chatId or userId', { chatId, userId });
      await ctx.reply('Error: Unable to process your request. Please try again.');
      return;
    }

    try {
      // Check if user exists in chats sheet
      const checkUserResponse = await fetch(`${SCRIPT_URL}checkUser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const checkUserData = await checkUserResponse.json();
      console.log('Check user response:', checkUserData);

      let welcomeMessage: string;

      if (checkUserData.exists) {
        // Update existing user to live status
        const updateResponse = await fetch(`${SCRIPT_URL}updateUserStatus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            status: 'live',
            firstName,
            lastName 
          }),
        });

        const updateResult = await updateResponse.json();
        console.log('Update user status response:', updateResult);
        if (updateResult.success) {
          welcomeMessage = 'Welcome back! You are now online and available for matching.';
        } else {
          await ctx.reply('Error updating your status. Please try again.');
          return;
        }
      } else {
        // Add new user
        const addResponse = await fetch(`${SCRIPT_URL}addUser`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            chatId, 
            firstName, 
            lastName,
            status: 'live' 
          }),
        });

        const addResult = await addResponse.json();
        console.log('Add user response:', addResult);
        if (addResult.success) {
          welcomeMessage = 'Welcome! You are now online and available for matching.';
        } else {
          await ctx.reply('Error registering you. Please try again.');
          return;
        }
      }

      await ctx.reply(welcomeMessage);
      await greeting()(ctx);

      // Check if already in an active conversation
      const checkActiveConvResponse = await fetch(`${SCRIPT_URL}checkActiveConversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const checkActiveConvData = await checkActiveConvResponse.json();
      console.log('Check active conversation:', checkActiveConvData);

      if (checkActiveConvData.inConversation) {
        await ctx.reply(
          `You are already matched with a partner! 👥\n\n` +
          `To start a new conversation, first /stop your current one, then use /start or /search again.`
        );
        return;
      }

      // Find random live user (not self, not in conv)
      const findPartnerResponse = await fetch(`${SCRIPT_URL}findRandomLiveUser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const findPartnerData = await findPartnerResponse.json();
      console.log('Find partner response:', findPartnerData);

      if (!findPartnerData.success || !findPartnerData.partnerId || findPartnerData.partnerId === userId) {
        await ctx.reply(
          'No available partners right now. 😔\n\n' +
          'Please wait a moment and try /search again. More people are joining every day!'
        );
        return;
      }

      const partnerId = findPartnerData.partnerId;
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create conversation
      const createConvResponse = await fetch(`${SCRIPT_URL}createConversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          conversationId, 
          userId1: userId, 
          userId2: partnerId, 
          status: 'start',
          timestamp: new Date().toISOString()
        }),
      });

      const createConvData = await createConvResponse.json();
      console.log('Create conversation response:', createConvData);

      if (createConvResponse.ok && createConvData.success) {
        await ctx.reply(
          '🎉 Perfect match found!\n\n' +
          'You have been connected with a partner. Start chatting now!\n\n' +
          '💡 Use /stop to end this conversation anytime.'
        );

        // Send message to partner
        try {
          await bot.telegram.sendMessage(
            partnerId,
            '🎉 Perfect match found!\n\n' +
            'You have been connected with a partner. Start chatting now!\n\n' +
            '💡 Use /stop to end this conversation anytime.'
          );
        } catch (partnerError) {
          console.error('Error notifying partner:', partnerError);
        }
      } else {
        await ctx.reply('Error creating conversation. Please try again.');
      }

    } catch (error) {
      console.error('Error in /start:', error);
      await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
  };
}

function handleSearch(): Middleware<Context<Update>> {
  return async (ctx: Context<Update>) => {
    const userId = ctx.from?.id?.toString() || '';
    const chatId = ctx.chat?.id?.toString() || '';
    const firstName = ctx.from?.first_name || '';
    const lastName = ctx.from?.last_name || '';

    if (!userId || !chatId) {
      console.error('Invalid userId or chatId in /search:', { userId, chatId });
      await ctx.reply('Error: Unable to process your request. Please try again.');
      return;
    }

    try {
      // Check if user is already in an active conversation
      const checkActiveConvResponse = await fetch(`${SCRIPT_URL}checkActiveConversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const checkActiveConvData = await checkActiveConvResponse.json();
      console.log('Check active conversation in /search:', checkActiveConvData);

      if (checkActiveConvData.inConversation) {
        await ctx.reply(
          `You are already matched with a partner! 👥\n\n` +
          `To start a new conversation, first /stop your current one, then use /search again.`
        );
        return;
      }

      // Check if user is live, if not, set to live
      const checkLiveResponse = await fetch(`${SCRIPT_URL}checkUserStatus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const checkLiveData = await checkLiveResponse.json();
      console.log('Check user status in /search:', checkLiveData);

      if (!checkLiveData.isLive) {
        const updateResponse = await fetch(`${SCRIPT_URL}updateUserStatus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            status: 'live',
            firstName,
            lastName 
          }),
        });

        const updateResult = await updateResponse.json();
        console.log('Update user status in /search:', updateResult);
        if (!updateResult.success) {
          await ctx.reply('Error setting your status to online. Please try again.');
          return;
        }
      }

      // Find random live user (not self, not in conv)
      const findPartnerResponse = await fetch(`${SCRIPT_URL}findRandomLiveUser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const findPartnerData = await findPartnerResponse.json();
      console.log('Find partner in /search:', findPartnerData);

      if (!findPartnerData.success || !findPartnerData.partnerId || findPartnerData.partnerId === userId) {
        await ctx.reply(
          'No available partners right now. 😔\n\n' +
          'Please wait a moment and try /search again. More people are joining every day!'
        );
        return;
      }

      const partnerId = findPartnerData.partnerId;
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create conversation
      const createConvResponse = await fetch(`${SCRIPT_URL}createConversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          conversationId, 
          userId1: userId, 
          userId2: partnerId, 
          status: 'start',
          timestamp: new Date().toISOString()
        }),
      });

      const createConvData = await createConvResponse.json();
      console.log('Create conversation in /search:', createConvData);

      if (createConvResponse.ok && createConvData.success) {
        await ctx.reply(
          '🎉 Perfect match found!\n\n' +
          'You have been connected with a partner. Start chatting now!\n\n' +
          '💡 Use /stop to end this conversation anytime.'
        );

        // Send message to partner
        try {
          await bot.telegram.sendMessage(
            partnerId,
            '🎉 Perfect match found!\n\n' +
            'You have been connected with a partner. Start chatting now!\n\n' +
            '💡 Use /stop to end this conversation anytime.'
          );
        } catch (partnerError) {
          console.error('Error notifying partner in /search:', partnerError);
        }
      } else {
        await ctx.reply('Error creating conversation. Please try again.');
      }

    } catch (error) {
      console.error('Error in /search:', error);
      await ctx.reply('Sorry, there was an error finding a partner. Please try again later.');
    }
  };
}

function handleStop(): Middleware<Context<Update>> {
  return async (ctx: Context<Update>) => {
    const userId = ctx.from?.id?.toString() || '';

    if (!userId) {
      console.error('Invalid userId in /stop:', { userId });
      await ctx.reply('Error: Unable to process your request. Please try again.');
      return;
    }

    try {
      // Find and end the user's active conversation
      const endConvResponse = await fetch(`${SCRIPT_URL}endUserConversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const endConvData = await endConvResponse.json();
      console.log('End conversation response:', endConvData);

      if (endConvData.success) {
        // Set user status to offline
        const updateResponse = await fetch(`${SCRIPT_URL}updateUserStatus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, status: 'offline' }),
        });

        const updateResult = await updateResponse.json();
        console.log('Update user status to offline:', updateResult);

        await ctx.reply(
          '👋 Conversation ended.\n\n' +
          'You are now offline. Use /start to go online and find a new partner!'
        );

        // Notify partner if they exist
        if (endConvData.partnerId) {
          try {
            await bot.telegram.sendMessage(
              endConvData.partnerId,
              'Your partner has ended the conversation. 😔\n\n' +
              'Use /start or /search to find a new partner!'
            );

            // Set partner status to offline
            await fetch(`${SCRIPT_URL}updateUserStatus`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: endConvData.partnerId, status: 'offline' }),
            });
          } catch (partnerError) {
            console.error('Error notifying partner in /stop:', partnerError);
          }
        }
      } else {
        await ctx.reply('No active conversation found. Use /start or /search to find a partner!');
      }

    } catch (error) {
      console.error('Error in /stop:', error);
      await ctx.reply('Sorry, there was an error ending the conversation. Please try again later.');
    }
  };
}

function handleMessage(): Middleware<Context<Update>> {
  return async (ctx: Context<Update>) => {
    const userId = ctx.from?.id?.toString() || '';
    const chatId = ctx.chat?.id?.toString() || '';

    if (!ctx.message || !('text' in ctx.message)) {
      console.log('Non-text message received, ignoring:', { userId, chatId });
      return; // Skip non-text messages
    }

    const messageText = ctx.message.text;

    if (!userId || !chatId || !messageText) {
      console.error('Invalid message data:', { userId, chatId, messageText });
      return; // Skip empty or invalid messages
    }

    // Ignore bot commands
    if (messageText.startsWith('/')) {
      console.log('Command received, handled by command middleware:', messageText);
      return;
    }

    try {
      // Check if user has an active conversation
      const checkConvResponse = await fetch(`${SCRIPT_URL}checkActiveConversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const checkConvData = await checkConvResponse.json();
      console.log('Check active conversation in handleMessage:', checkConvData);

      if (checkConvData.inConversation && checkConvData.status === 'start') {
        // Forward message to partner
        const partnerId = checkConvData.partnerId;
        console.log('Forwarding message to partner:', { userId, partnerId, messageText });
        
        try {
          await bot.telegram.sendMessage(partnerId, messageText);
        } catch (forwardError) {
          console.error('Error forwarding message:', forwardError);
          await ctx.reply('Error sending message to partner. Please try again.');
        }
      } else {
        // Only reply if user is not in an active conversation
        console.log('User not in active conversation, sending help message:', { userId });
        await ctx.reply(
          'To find a new partner:\n\n' +
          '1️⃣ Use /start to go online\n' +
          '2️⃣ Use /search to find a partner'
        );
      }

    } catch (error) {
      console.error('Error handling message:', error);
      await ctx.reply('Sorry, there was an error processing your message. Please try again.');
    }
  };
}
