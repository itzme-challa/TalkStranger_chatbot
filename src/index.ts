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

// Helper function to find a new partner
async function findNewPartner(ctx: Context, userId: string): Promise<void> {
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
      await ctx.reply('🌟 You’re already chatting with someone! Use /stop or /next to end the current conversation before finding a new partner.');
      return;
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
      // Set user to live
      await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateUserStatus',
          userId: userId,
          status: 'live'
        })
      });
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
      await ctx.reply('😔 No available partners right now. Try again later with /start or /search!');
      return;
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
      await ctx.reply(
        `Partner found 🐵\n` +
        `/stop — stop this dialog\n` +
        `/link — request your partner profile\n` +
        `Conversation id: ${convResult.conversationId}\n` +
        `To report partner: @itzfew`
      );
      
      // Notify partner
      try {
        await bot.telegram.sendMessage(matchData.partnerId, 
          `Partner found 🐵\n` +
          `/stop — stop this dialog\n` +
          `/link — request your partner profile\n` +
          `Conversation id: ${convResult.conversationId}\n` +
          `To report partner: @itzfew`
        );
      } catch (partnerError) {
        console.error('Error notifying partner:', partnerError);
        await ctx.reply('Your partner was matched but might not receive notifications. You can start chatting!');
      }
    }
  } catch (error) {
    console.error('Error finding new partner:', error);
    await ctx.reply('😓 Sorry, something went wrong while finding a match. Please try again with /start or /search.');
  }
}

// Initialize user and find partner on start
bot.command('start', async (ctx: Context): Promise<void> => {
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
      // Update existing user to live and find partner
      await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateUserStatus',
          userId: userId,
          status: 'live'
        })
      });
      
      await ctx.reply(`🌈 Welcome back, ${userName}! Let’s find you a new chat partner...`);
      await findNewPartner(ctx, userId);
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
      
      await ctx.reply(`🎊 Welcome ${userName}! You're now in the chat system. Let’s find you a chat partner...`);
      await findNewPartner(ctx, userId);
    }
  } catch (error) {
    console.error('Error in /start:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again later with /start or /search.');
  }
});

// Search for partner (sets user to live first)
bot.command('search', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) return;
  
  await ctx.reply('🔍 Looking for a new chat partner...');
  await findNewPartner(ctx, userId);
});

// Stop conversation
bot.command('stop', async (ctx: Context): Promise<void> => {
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
      await ctx.reply(
        `You stopped the dialog 🙄\n` +
        `Type /search to find a new partner\n` +
        `Conversation id: ${endResult.conversationId || 'N/A'}\n` +
        `To report partner: @itzfew`
      );
      
      // Notify partner if conversation existed
      if (endResult.partnerId) {
        try {
          await bot.telegram.sendMessage(endResult.partnerId, 
            `Your partner has stopped the dialog 😞\n` +
            `Type /search to find a new partner\n` +
            `Conversation id: ${endResult.conversationId || 'N/A'}\n` +
            `To report partner: @itzfew`
          );
        } catch (partnerError) {
          console.error('Error notifying partner about stop:', partnerError);
        }
      }
    } else {
      await ctx.reply('🤔 No active conversation found. Start a new one with /start or /search!');
    }
  } catch (error) {
    console.error('Error in /stop:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again.');
  }
});

// Next command: End current conversation and find new partner
bot.command('next', async (ctx: Context): Promise<void> => {
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
    
    if (endResult.success && endResult.partnerId) {
      await ctx.reply(
        `You stopped the dialog 🙄\n` +
        `Type /search to find a new partner\n` +
        `Conversation id: ${endResult.conversationId || 'N/A'}\n` +
        `To report partner: @itzfew`
      );
      
      // Notify partner
      try {
        await bot.telegram.sendMessage(endResult.partnerId, 
          `Your partner has stopped the dialog 😞\n` +
          `Type /search to find a new partner\n` +
          `Conversation id: ${endResult.conversationId || 'N/A'}\n` +
          `To report partner: @itzfew`
        );
      } catch (partnerError) {
        console.error('Error notifying partner about next:', partnerError);
      }
      
      // Find new partner
      await ctx.reply('🔍 Looking for a new chat partner...');
      await findNewPartner(ctx, userId);
    } else {
      await ctx.reply('🤔 No active conversation found. Let’s find you a new partner...');
      await findNewPartner(ctx, userId);
    }
  } catch (error) {
    console.error('Error in /next:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again with /start or /search.');
  }
});

// Link command: Request partner's profile
bot.command('link', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) return;
  
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
      await ctx.reply('🤔 You’re not in an active conversation. Use /start or /search to find a partner!');
      return;
    }
    
    // Notify partner of profile request
    try {
      await bot.telegram.sendMessage(convData.partnerId, 
        `Your partner wants your profile /share here\n` +
        `Conversation id: ${convData.conversationId}`
      );
      await ctx.reply(`📬 Profile request sent to your partner! They can share with /share.\nConversation id: ${convData.conversationId}`);
    } catch (partnerError) {
      console.error('Error notifying partner about link request:', partnerError);
      await ctx.reply('😓 Sorry, I couldn’t send the profile request. Please try again.');
    }
  } catch (error) {
    console.error('Error in /link:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again.');
  }
});

// Share command: Share profile URL with partner
bot.command('share', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) return;
  
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
      await ctx.reply('🤔 You’re not in an active conversation. Use /start or /search to find a partner!');
      return;
    }
    
    // Get user profile URL (assuming Telegram user ID can be used to construct profile URL)
    const profileUrl = `https://t.me/${ctx.from?.username || userId}`;
    
    // Send profile to partner
    try {
      await bot.telegram.sendMessage(convData.partnerId, 
        `Your partner shared their profile: ${profileUrl}\n` +
        `Conversation id: ${convData.conversationId}`
      );
      await ctx.reply(`📤 Your profile has been shared with your partner!\nConversation id: ${convData.conversationId}`);
    } catch (partnerError) {
      console.error('Error sharing profile:', partnerError);
      await ctx.reply('😓 Sorry, I couldn’t share your profile. Please try again.');
    }
  } catch (error) {
    console.error('Error in /share:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again.');
  }
});

bot.command('about', about());

// Handle all text messages
bot.on('text', async (ctx: Context): Promise<void> => {
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
        await ctx.reply('🔍 To find a partner, use /start or /search command.');
      } else {
        await ctx.reply(
          `🤔 I’m not sure what you mean. Use these commands to get started:\n` +
          `/start - Join and find a partner\n` +
          `/search - Find a new partner\n` +
          `/stop - End current conversation\n` +
          `/next - Switch to a new partner\n` +
          `/link - Request partner’s profile\n` +
          `/share - Share your profile\n` +
          `/about - Learn more about the bot`
        );
      }
      return;
    }
    
    // Forward message to partner anonymously
    try {
      await bot.telegram.sendMessage(convData.partnerId, messageText);
    } catch (forwardError) {
      console.error('Error forwarding message:', forwardError);
      await ctx.reply('😓 Sorry, I couldn’t send your message. Please try again.');
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await ctx.reply('😓 Something went wrong. Please use /start or /search to find a partner.');
  }
});

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

//dev mode
if (ENVIRONMENT !== 'production') {
  development(bot);
}
