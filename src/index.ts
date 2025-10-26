import { Telegraf, Context } from 'telegraf';
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
bot.on('message', handleMessage);

// Production mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

// Development mode
ENVIRONMENT !== 'production' && development(bot);

// MARK: Command Handlers

async function handleStart() {
  return async (ctx: Context) => {
    const chatId = ctx.chat?.id?.toString() || '';
    const userId = ctx.from?.id?.toString() || '';
    const firstName = ctx.from?.first_name || '';
    const lastName = ctx.from?.last_name || '';

    if (!chatId || !userId) {
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
        if (updateResult.success) {
          await ctx.reply('Welcome back! You are now online and available for matching. Use /search to find a partner.');
        } else {
          await ctx.reply('Error updating your status. Please try again.');
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
        if (addResult.success) {
          await ctx.reply('Welcome! You are now online and available for matching. Use /search to find a partner.');
        } else {
          await ctx.reply('Error registering you. Please try again.');
        }
      }

      await greeting()(ctx);
    } catch (error) {
      console.error('Error in /start:', error);
      await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
  };
}

async function handleSearch() {
  return async (ctx: Context) => {
    const userId = ctx.from?.id?.toString() || '';
    const chatId = ctx.chat?.id?.toString() || '';

    if (!userId || !chatId) {
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

      if (checkActiveConvData.inConversation) {
        await ctx.reply(
          `You are already matched with a partner! 👥\n\n` +
          `To start a new conversation, first /stop your current one, then use /search again.`
        );
        return;
      }

      // Check if user is live
      const checkLiveResponse = await fetch(`${SCRIPT_URL}checkUserStatus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const checkLiveData = await checkLiveResponse.json();

      if (!checkLiveData.isLive) {
        await ctx.reply(
          'You need to be online to search for partners! 🔄\n\n' +
          'Please use /start to go online first, then try /search again.'
        );
        return;
      }

      // Find random live user (not self)
      const findPartnerResponse = await fetch(`${SCRIPT_URL}findRandomLiveUser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }), // Exclude self
      });

      const findPartnerData = await findPartnerResponse.json();

      if (!findPartnerData.success || !findPartnerData.partnerId) {
        await ctx.reply(
          'No available partners right now. 😔\n\n' +
          'Please wait a moment and try /search again. More people are joining every day!'
        );
        return;
      }

      const partnerId = findPartnerData.partnerId;
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create conversation for both users
      const createConv1Response = await fetch(`${SCRIPT_URL}createConversation`, {
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

      // Also create reverse entry for partner
      const createConv2Response = await fetch(`${SCRIPT_URL}createConversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          conversationId, 
          userId1: partnerId, 
          userId2: userId, 
          status: 'start',
          timestamp: new Date().toISOString()
        }),
      });

      if (createConv1Response.ok && createConv2Response.ok) {
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
          // Continue anyway, partner will see the conversation when they message
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

async function handleStop() {
  return async (ctx: Context) => {
    const userId = ctx.from?.id?.toString() || '';

    if (!userId) {
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

      if (endConvData.success) {
        // Set user status to offline
        await fetch(`${SCRIPT_URL}updateUserStatus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, status: 'offline' }),
        });

        await ctx.reply(
          '👋 Conversation ended.\n\n' +
          'You are now offline. Use /start to go online and /search to find a new partner!'
        );

        // Notify partner if they exist
        if (endConvData.partnerId) {
          try {
            await bot.telegram.sendMessage(
              endConvData.partnerId,
              'Your partner has ended the conversation. 😔\n\n' +
              'Use /search to find a new partner!'
            );

            // Set partner status to offline too
            await fetch(`${SCRIPT_URL}updateUserStatus`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: endConvData.partnerId, status: 'offline' }),
            });
          } catch (partnerError) {
            console.error('Error notifying partner:', partnerError);
          }
        }
      } else {
        await ctx.reply('No active conversation found. Use /search to find a partner!');
      }

    } catch (error) {
      console.error('Error in /stop:', error);
      await ctx.reply('Sorry, there was an error ending the conversation. Please try again later.');
    }
  };
}

async function handleMessage() {
  return async (ctx: Context) => {
    const userId = ctx.from?.id?.toString() || '';
    const chatId = ctx.chat?.id?.toString() || '';
    const messageText = ctx.message?.text || '';

    if (!userId || !chatId || !messageText) {
      return; // Skip empty or invalid messages
    }

    // Ignore bot commands
    if (messageText.startsWith('/')) {
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

      if (checkConvData.inConversation && checkConvData.status === 'start') {
        // Forward message to partner
        const partnerId = checkConvData.partnerId;
        
        try {
          await bot.telegram.sendMessage(
            partnerId,
            `${ctx.from?.first_name || 'User'}: ${messageText}`
          );
        } catch (forwardError) {
          console.error('Error forwarding message:', forwardError);
          await ctx.reply('Error sending message to partner. Please try again.');
        }
      } else if (checkConvData.status === 'end') {
        await ctx.reply(
          "I don't understand this command 😕\n\n" +
          "It looks like your previous conversation has ended. To find a new partner:\n\n" +
          "1️⃣ Use /start to go online\n" +
          "2️⃣ Use /search to find a partner"
        );
      } else {
        // User is not in any conversation, show help
        await ctx.reply(
          "👋 Hi there!\n\n" +
          "To start chatting with others:\n\n" +
          "🔹 /start - Go online\n" +
          "🔹 /search - Find a partner\n" +
          "🔹 /stop - End current conversation\n\n" +
          "Type /start to begin!"
        );
      }

    } catch (error) {
      console.error('Error handling message:', error);
      await ctx.reply('Sorry, there was an error processing your message. Please try again.');
    }
  };
}
