import { Telegraf, Context, MiddlewareFn } from 'telegraf';
import { about } from './commands';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwKVFFJm4l7ihoqJ7-cHZMwZkf0xst2HYwyR3ZUb-e4h6UyUAly4XIciligXVi_nng6/exec';

const bot = new Telegraf(BOT_TOKEN);

// Type guard for text messages
const isTextMessage = (msg: any): msg is { message_id: number; text: string } => {
  return msg && typeof msg === 'object' && 'text' in msg && typeof msg.text === 'string';
};

// Type guard for message_id
const hasMessageId = (msg: any): msg is { message_id: number } => {
  return msg && typeof msg === 'object' && 'message_id' in msg && typeof msg.message_id === 'number';
};

// Initialize user on start
bot.command('start', async (ctx: Context) => {
  const userId = ctx.from?.id?.toString();
  const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim();
  
  if (!userId) return;
  
  try {
    // Check if user already exists in chats
    const checkUser = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getUser',
        userId: userId
      })
    });
    
    const userData = await checkUser.json();
    
    if (userData.exists) {
      // Update existing user to live
      await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateUserStatus',
          userId: userId,
          status: 'live'
        })
      });
      
      await ctx.reply(`Welcome back! You're now available for matching. Use /search to find a partner.`);
    } else {
      // Create new user
      await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createUser',
          userId: userId,
          userName: userName
        })
      });
      
      await ctx.reply(`Welcome ${userName}! You're now in the chat system. Use /search to find a partner.`);
    }
  } catch (error) {
    console.error('Error in /start:', error);
    await ctx.reply('Sorry, there was an error. Please try again later.');
  }
});

// Search for partner
bot.command('search', async (ctx: Context) => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) return;
  
  try {
    // Check if user is already in an active conversation
    const activeConv = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'checkActiveConversation',
        userId: userId
      })
    });
    
    const convData = await activeConv.json();
    
    if (convData.hasActive) {
      return ctx.reply('You are already matched with a partner! Use /stop to end current conversation and /search again.');
    }
    
    // Check user status
    const userStatus = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getUserStatus',
        userId: userId
      })
    });
    
    const statusData = await userStatus.json();
    
    if (statusData.status !== 'live') {
      return ctx.reply('You need to /start first to be available for matching.');
    }
    
    // Find random live user (not self)
    const randomUser = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'findRandomLiveUser',
        excludeUserId: userId
      })
    });
    
    const matchData = await randomUser.json();
    
    if (!matchData.success || !matchData.partnerId) {
      return ctx.reply('No available partners right now. Try again later!');
    }
    
    // Create conversation
    const conversation = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createConversation',
        userId1: userId,
        userId2: matchData.partnerId,
        status: 'start'
      })
    });
    
    const convResult = await conversation.json();
    
    if (convResult.success) {
      await ctx.reply(`🎉 Great! You've been matched with a partner! Start chatting now. Use /stop to end conversation.`);
      
      // Notify partner
      try {
        await bot.telegram.sendMessage(matchData.partnerId, 
          `🎉 You have a new match! Start chatting with your partner. Use /stop to end conversation.`
        );
      } catch (partnerError) {
        console.error('Error notifying partner:', partnerError);
      }
    }
  } catch (error) {
    console.error('Error in /search:', error);
    await ctx.reply('Sorry, there was an error finding a match. Please try again.');
  }
});

// Stop conversation
bot.command('stop', async (ctx: Context) => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) return;
  
  try {
    // Find and end user's active conversation
    const endConv = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'endConversation',
        userId: userId
      })
    });
    
    const endResult = await endConv.json();
    
    if (endResult.success) {
      await ctx.reply('Conversation ended. You are now available for new matches. Use /search to find a new partner.');
      
      // Notify partner if conversation existed
      if (endResult.partnerId) {
        try {
          await bot.telegram.sendMessage(endResult.partnerId, 
            `Your partner has ended the conversation. You are now available for new matches. Use /search to find a new partner.`
          );
        } catch (partnerError) {
          console.error('Error notifying partner about stop:', partnerError);
        }
      }
    } else {
      await ctx.reply('No active conversation found. Use /search to find a partner.');
    }
  } catch (error) {
    console.error('Error in /stop:', error);
    await ctx.reply('Sorry, there was an error. Please try again.');
  }
});

bot.command('about', about());

// Handle all text messages
bot.on('text', async (ctx: Context) => {
  const message = ctx.message;
  const userId = ctx.from?.id?.toString();
  
  if (!userId || !message || !isTextMessage(message)) return;
  
  const messageText = message.text;
  const messageId = message.message_id;
  
  if (messageText.startsWith('/')) return;
  
  try {
    // Check if user is in an active conversation
    const activeConv = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getActiveConversation',
        userId: userId
      })
    });
    
    const convData = await activeConv.json();
    
    if (!convData.success || !convData.partnerId) {
      // No active conversation, suggest starting one
      if (messageText.toLowerCase().includes('search') || messageText.toLowerCase().includes('match')) {
        await ctx.reply('To find a partner, use /search command.');
      } else {
        await ctx.reply("I don't understand. Please use /start to begin, /search to find a partner, or /stop to end a conversation.");
      }
      return;
    }
    
    // Forward message to partner
    try {
      await bot.telegram.sendMessage(convData.partnerId, 
        `Partner: ${ctx.from?.first_name || 'User'}\n\n${messageText}`
      );
      
      // Optional: Send confirmation to sender
      await ctx.reply(`Message sent to your partner! 👤`, { 
        reply_parameters: { message_id: messageId } 
      });
    } catch (forwardError) {
      console.error('Error forwarding message:', forwardError);
      await ctx.reply('Sorry, I couldn\'t send your message. Please try again.');
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await ctx.reply("I don't understand. Please use /search to find a partner.");
  }
});

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

//dev mode
ENVIRONMENT !== 'production' && development(bot);
