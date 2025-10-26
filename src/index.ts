import { Telegraf, Context, MiddlewareFn } from 'telegraf';
import { about } from './commands';
import { greeting, hasMessageId } from './text/greeting';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import createDebug from 'debug';

const debug = createDebug('bot:main');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxa0DsybP-Jagi6Ivc2AzNJtPCPc331JERwTILj5JGSuU7z6yD4e6tLD_7g0x92_Yge/exec';

const bot = new Telegraf(BOT_TOKEN);

// Type guard for text messages
const isTextMessage = (msg: any): msg is { message_id: number; text: string } => {
  return msg && typeof msg === 'object' && 'text' in msg && typeof msg.text === 'string';
};

// Helper function to find a new partner
async function findNewPartner(ctx: Context, userId: string): Promise<void> {
  debug(`Starting findNewPartner for userId: ${userId}`);
  try {
    // Check if user is already in an active conversation
    debug('Checking active conversation');
    const activeConv = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'checkActiveConversation',
        userId: userId
      })
    });
    const convData = await activeConv.json();
    debug(`checkActiveConversation response: ${JSON.stringify(convData)}`);

    if (convData.hasActive) {
      await ctx.reply('🌟 You’re already chatting with someone! Use /stop or /next to end the current conversation before finding a new partner.');
      return;
    }
    
    // Check user status
    debug('Checking user status');
    const userStatus = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getUserStatus',
        userId: userId
      })
    });
    const statusData = await userStatus.json();
    debug(`getUserStatus response: ${JSON.stringify(statusData)}`);

    if (statusData.status !== 'live') {
      debug(`Updating user status to live for userId: ${userId}`);
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
    debug('Finding random live user');
    const randomUser = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'findRandomLiveUser',
        excludeUserId: userId
      })
    });
    const matchData = await randomUser.json();
    debug(`findRandomLiveUser response: ${JSON.stringify(matchData)}`);

    if (!matchData.success || !matchData.partnerId) {
      await ctx.reply('😔 No available partners right now. Try again later with /start or /search!');
      return;
    }
    
    // Create conversation
    debug(`Creating conversation between ${userId} and ${matchData.partnerId}`);
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
    debug(`createConversation response: ${JSON.stringify(convResult)}`);

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
        debug(`Notifying partner ${matchData.partnerId}`);
        await bot.telegram.sendMessage(matchData.partnerId, 
          `Partner found 🐵\n` +
          `/stop — stop this dialog\n` +
          `/link — request your partner profile\n` +
          `Conversation id: ${convResult.conversationId}\n` +
          `To report partner: @itzfew`
        );
      } catch (partnerError) {
        debug(`Error notifying partner: ${partnerError}`);
        console.error('Error notifying partner:', partnerError);
        await ctx.reply('Your partner was matched but might not receive notifications. You can start chatting!');
      }
    } else {
      debug(`Conversation creation failed: ${JSON.stringify(convResult)}`);
      await ctx.reply('😓 Failed to create conversation. Please try again with /start or /search.');
    }
  } catch (error) {
    debug(`Error in findNewPartner: ${error}`);
    console.error('Error finding new partner:', error);
    await ctx.reply('😓 Sorry, something went wrong while finding a match. Please try again with /start or /search.');
  }
}

// Initialize user and find partner on start
bot.command('start', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim();
  
  if (!userId) {
    debug('No userId found in /start');
    return;
  }
  
  debug(`Starting /start for userId: ${userId}, userName: ${userName}`);
  try {
    // Check if user already exists in chats
    debug('Checking if user exists');
    const checkUser = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getUser',
        userId: userId
      })
    });
    const userData = await checkUser.json();
    debug(`getUser response: ${JSON.stringify(userData)}`);

    if (userData.exists) {
      // Update existing user to live and find partner
      debug(`User exists, updating status to live for userId: ${userId}`);
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
      debug(`Creating new user: ${userId}`);
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
    debug(`Error in /start: ${error}`);
    console.error('Error in /start:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again later with /start or /search.');
  }
});

// Search for partner (sets user to live first)
bot.command('search', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) {
    debug('No userId found in /search');
    return;
  }
  
  debug(`Starting /search for userId: ${userId}`);
  await ctx.reply('🔍 Looking for a new chat partner...');
  await findNewPartner(ctx, userId);
});

// Stop conversation
bot.command('stop', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) {
    debug('No userId found in /stop');
    return;
  }
  
  debug(`Starting /stop for userId: ${userId}`);
  try {
    // Find and end user's active conversation
    debug('Ending active conversation');
    const endConv = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'endConversation',
        userId: userId
      })
    });
    const endResult = await endConv.json();
    debug(`endConversation response: ${JSON.stringify(endResult)}`);

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
          debug(`Notifying partner ${endResult.partnerId} about stop`);
          await bot.telegram.sendMessage(endResult.partnerId, 
            `Your partner has stopped the dialog 😞\n` +
            `Type /search to find a new partner\n` +
            `Conversation id: ${endResult.conversationId || 'N/A'}\n` +
            `To report partner: @itzfew`
          );
        } catch (partnerError) {
          debug(`Error notifying partner about stop: ${partnerError}`);
          console.error('Error notifying partner about stop:', partnerError);
        }
      }
    } else {
      await ctx.reply('🤔 No active conversation found. Start a new one with /start or /search!');
    }
  } catch (error) {
    debug(`Error in /stop: ${error}`);
    console.error('Error in /stop:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again.');
  }
});

// Next command: End current conversation and find new partner
bot.command('next', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) {
    debug('No userId found in /next');
    return;
  }
  
  debug(`Starting /next for userId: ${userId}`);
  try {
    // Find and end user's active conversation
    debug('Ending active conversation');
    const endConv = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'endConversation',
        userId: userId
      })
    });
    const endResult = await endConv.json();
    debug(`endConversation response: ${JSON.stringify(endResult)}`);

    if (endResult.success && endResult.partnerId) {
      await ctx.reply(
        `You stopped the dialog 🙄\n` +
        `Type /search to find a new partner\n` +
        `Conversation id: ${endResult.conversationId || 'N/A'}\n` +
        `To report partner: @itzfew`
      );
      
      // Notify partner
      try {
        debug(`Notifying partner ${endResult.partnerId} about next`);
        await bot.telegram.sendMessage(endResult.partnerId, 
          `Your partner has stopped the dialog 😞\n` +
          `Type /search to find a new partner\n` +
          `Conversation id: ${endResult.conversationId || 'N/A'}\n` +
          `To report partner: @itzfew`
        );
      } catch (partnerError) {
        debug(`Error notifying partner about next: ${partnerError}`);
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
    debug(`Error in /next: ${error}`);
    console.error('Error in /next:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again with /start or /search.');
  }
});

// Link command: Request partner's profile
bot.command('link', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) {
    debug('No userId found in /link');
    return;
  }
  
  debug(`Starting /link for userId: ${userId}`);
  try {
    // Check if user is in an active conversation
    debug('Checking active conversation');
    const activeConv = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getActiveConversation',
        userId: userId
      })
    });
    const convData = await activeConv.json();
    debug(`getActiveConversation response: ${JSON.stringify(convData)}`);

    if (!convData.success || !convData.partnerId) {
      await ctx.reply('🤔 You’re not in an active conversation. Use /start or /search to find a partner!');
      return;
    }
    
    // Notify partner of profile request
    try {
      debug(`Notifying partner ${convData.partnerId} about link request`);
      await bot.telegram.sendMessage(convData.partnerId, 
        `Your partner wants your profile /share here\n` +
        `Conversation id: ${convData.conversationId}`
      );
      await ctx.reply(`📬 Profile request sent to your partner! They can share with /share.\nConversation id: ${convData.conversationId}`);
    } catch (partnerError) {
      debug(`Error notifying partner about link request: ${partnerError}`);
      console.error('Error notifying partner about link request:', partnerError);
      await ctx.reply('😓 Sorry, I couldn’t send the profile request. Please try again.');
    }
  } catch (error) {
    debug(`Error in /link: ${error}`);
    console.error('Error in /link:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again.');
  }
});

// Share command: Share profile URL with partner
bot.command('share', async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id?.toString();
  
  if (!userId) {
    debug('No userId found in /share');
    return;
  }
  
  debug(`Starting /share for userId: ${userId}`);
  try {
    // Check if user is in an active conversation
    debug('Checking active conversation');
    const activeConv = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getActiveConversation',
        userId: userId
      })
    });
    const convData = await activeConv.json();
    debug(`getActiveConversation response: ${JSON.stringify(convData)}`);

    if (!convData.success || !convData.partnerId) {
      await ctx.reply('🤔 You’re not in an active conversation. Use /start or /search to find a partner!');
      return;
    }
    
    // Get user profile URL
    const profileUrl = `https://t.me/${ctx.from?.username || userId}`;
    
    // Send profile to partner
    try {
      debug(`Sharing profile with partner ${convData.partnerId}`);
      await bot.telegram.sendMessage(convData.partnerId, 
        `Your partner shared their profile: ${profileUrl}\n` +
        `Conversation id: ${convData.conversationId}`
      );
      await ctx.reply(`📤 Your profile has been shared with your partner!\nConversation id: ${convData.conversationId}`);
    } catch (partnerError) {
      debug(`Error sharing profile: ${partnerError}`);
      console.error('Error sharing profile:', partnerError);
      await ctx.reply('😓 Sorry, I couldn’t share your profile. Please try again.');
    }
  } catch (error) {
    debug(`Error in /share: ${error}`);
    console.error('Error in /share:', error);
    await ctx.reply('😓 Sorry, there was an error. Please try again.');
  }
});

// About command (Line ~433, fixing TS2345)
bot.command('about', about);

// Handle text messages for active conversations or fall back to greeting
bot.on('text', async (ctx: Context, next: () => Promise<void>): Promise<void> => {
  const message = ctx.message;
  const userId = ctx.from?.id?.toString();
  
  if (!userId || !message || !isTextMessage(message)) {
    debug('Invalid message or userId in text handler');
    return next();
  }
  
  const messageText = message.text;
  if (messageText.startsWith('/')) {
    debug(`Ignoring command text: ${messageText}`);
    return next();
  }
  
  debug(`Handling text message from ${userId}: ${messageText}`);
  
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
    debug(`getActiveConversation response: ${JSON.stringify(convData)}`);
    
    if (convData.success && convData.partnerId) {
      // Forward message to partner
      try {
        await bot.telegram.sendMessage(convData.partnerId, messageText); // Line ~470
        debug(`Message forwarded to partner ${convData.partnerId}`);
      } catch (forwardError) {
        debug(`Error forwarding message: ${forwardError}`);
        console.error('Error forwarding message:', forwardError);
        await ctx.reply('😓 Sorry, I couldn’t send your message. Please try again.');
      }
    } else {
      // No active conversation, use greeting middleware
      debug('No active conversation, falling back to greeting');
      await greeting(ctx); // Line ~479, fixing TS2554
    }
    await next();
  } catch (error) {
    debug(`Error handling message: ${error}`);
    console.error('Error handling message:', error);
    await ctx.reply('😓 Something went wrong. Please use /start or /search to find a partner.');
    await next();
  }
});

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  debug('Starting Vercel production mode');
  await production(req, res, bot);
};

//dev mode
if (ENVIRONMENT !== 'production') {
  debug('Starting development mode');
  development(bot);
}
