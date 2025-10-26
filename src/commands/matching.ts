import { Context } from 'telegraf';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { v4 as uuidv4 } from 'uuid';

const SHEET_ID = '1Qzgu7YnL23Nxf-2oznc77wYKuc2EXtMKDp8Ztm9p4J4';
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';

interface Chat {
  chatid: number;
  status: 'live' | 'offline';
  timestamp?: string;
}

interface Talk {
  conversationid: string;
  partnerid1: number;
  partnerid2: number;
  status: 'start' | 'end';
  timestamp: string;
}

const doc = new GoogleSpreadsheet(SHEET_ID);
let isInitialized = false;

const initializeSheets = async () => {
  if (isInitialized) return;
  
  await doc.useServiceAccountAuth({
    client_email: SERVICE_ACCOUNT_EMAIL,
    private_key: PRIVATE_KEY,
  });
  
  await doc.loadInfo();
  
  // Ensure sheets exist
  let chatsSheet, talkSheet;
  
  try {
    chatsSheet = doc.sheetsByTitle['chats'];
  } catch {
    chatsSheet = await doc.addSheet({ title: 'chats', headerValues: ['chatid', 'status', 'timestamp'] });
  }
  
  try {
    talkSheet = doc.sheetsByTitle['talk'];
  } catch {
    talkSheet = await doc.addSheet({ title: 'talk', headerValues: ['conversationid', 'partnerid1', 'partnerid2', 'status', 'timestamp'] });
  }
  
  isInitialized = true;
  return { chatsSheet, talkSheet };
};

const getChatsSheet = async () => {
  await initializeSheets();
  return doc.sheetsByTitle['chats'];
};

const getTalkSheet = async () => {
  await initializeSheets();
  return doc.sheetsByTitle['talk'];
};

const saveChat = async (chatid: number, status: 'live' | 'offline') => {
  const sheet = await getChatsSheet();
  const timestamp = new Date().toISOString();
  
  // Check if user exists
  const existingRows = await sheet.getRows();
  const existingChat = existingRows.find(row => parseInt(row.chatid) === chatid);
  
  if (existingChat) {
    existingChat.status = status;
    existingChat.timestamp = timestamp;
    await existingChat.save();
  } else {
    await sheet.addRow({ chatid, status, timestamp });
  }
};

const getLiveChats = async () => {
  const sheet = await getChatsSheet();
  const rows = await sheet.getRows();
  return rows
    .filter(row => row.status === 'live')
    .map(row => parseInt(row.chatid));
};

const getUserConversation = async (chatid: number) => {
  const sheet = await getTalkSheet();
  const rows = await sheet.getRows();
  return rows.find(row => 
    (parseInt(row.partnerid1) === chatid || parseInt(row.partnerid2) === chatid) && 
    row.status === 'start'
  );
};

const createConversation = async (user1: number, user2: number | null = null) => {
  const sheet = await getTalkSheet();
  const conversationId = uuidv4();
  const timestamp = new Date().toISOString();
  
  if (user2) {
    // Match two users
    await sheet.addRow({
      conversationid: conversationId,
      partnerid1: user1,
      partnerid2: user2,
      status: 'start',
      timestamp
    });
    
    // Set both users to offline in chats
    await saveChat(user1, 'offline');
    await saveChat(user2, 'offline');
    
    return { conversationId, partner1: user1, partner2: user2 };
  } else {
    // Start single user
    await sheet.addRow({
      conversationid: conversationId,
      partnerid1: user1,
      partnerid2: null,
      status: 'start',
      timestamp
    });
    
    await saveChat(user1, 'offline');
    return { conversationId, partner1: user1, partner2: null };
  }
};

const endConversation = async (conversationId: string) => {
  const sheet = await getTalkSheet();
  const rows = await sheet.getRows();
  const conversation = rows.find(row => row.conversationid === conversationId);
  
  if (conversation) {
    conversation.status = 'end';
    await conversation.save();
    
    // Set both partners to offline
    const partner1 = parseInt(conversation.partnerid1);
    const partner2 = conversation.partnerid2 ? parseInt(conversation.partnerid2) : null;
    
    if (partner1) await saveChat(partner1, 'offline');
    if (partner2) await saveChat(partner2, 'offline');
    
    return true;
  }
  
  return false;
};

const updateConversationStatus = async (conversationId: string, status: 'start' | 'end') => {
  const sheet = await getTalkSheet();
  const rows = await sheet.getRows();
  const conversation = rows.find(row => row.conversationid === conversationId);
  
  if (conversation) {
    conversation.status = status;
    await conversation.save();
    return true;
  }
  
  return false;
};

export const handleStart = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
  try {
    // Check if user is already in a conversation
    const existingConversation = await getUserConversation(chatId);
    if (existingConversation && existingConversation.status === 'start') {
      return ctx.reply(
        'You are already in a conversation. Use /stop to end it first, then try /start again.'
      );
    }
    
    // Save user as live
    await saveChat(chatId, 'live');
    
    // Check if there's another live user to match with
    const liveChats = await getLiveChats();
    const otherLiveUsers = liveChats.filter(id => id !== chatId);
    
    if (otherLiveUsers.length > 0) {
      // Match with random live user
      const randomPartner = otherLiveUsers[Math.floor(Math.random() * otherLiveUsers.length)];
      const conversation = await createConversation(chatId, randomPartner);
      
      await ctx.reply(
        `🎉 Great! You've been matched with a partner!\n\n` +
        `Start chatting by sending messages. Use /stop to end the conversation.`
      );
      
      // Notify the other user
      try {
        await ctx.telegram.sendMessage(
          randomPartner,
          `🎉 You've been matched with a new partner!\n\n` +
          `Start chatting by sending messages. Use /stop to end the conversation.`
        );
      } catch (error) {
        console.error('Failed to notify partner:', error);
      }
    } else {
      // No other users available
      await createConversation(chatId);
      await ctx.reply(
        '👋 Welcome! You are now live and waiting for a match.\n\n' +
        `Use /search to find a partner or wait for someone to join.`
      );
    }
  } catch (error) {
    console.error('Error in handleStart:', error);
    await ctx.reply('Sorry, something went wrong. Please try again.');
  }
};

export const handleSearch = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
  try {
    // Check if user is already in a conversation
    const existingConversation = await getUserConversation(chatId);
    if (existingConversation && existingConversation.status === 'start') {
      return ctx.reply(
        'You are already matched with a partner. Use /stop to end this conversation, then try /search again.'
      );
    }
    
    // Set user to live
    await saveChat(chatId, 'live');
    
    // Check for other live users
    const liveChats = await getLiveChats();
    const otherLiveUsers = liveChats.filter(id => id !== chatId);
    
    if (otherLiveUsers.length > 0) {
      // Match with random live user
      const randomPartner = otherLiveUsers[Math.floor(Math.random() * otherLiveUsers.length)];
      const conversation = await createConversation(chatId, randomPartner);
      
      await ctx.reply(
        `🎉 Perfect match! You've been paired with a partner!\n\n` +
        `Send messages to start chatting. Use /stop anytime to end.`
      );
      
      // Notify the other user
      try {
        await ctx.telegram.sendMessage(
          randomPartner,
          `🎉 A new partner found you! Start chatting now.\n\n` +
          `Use /stop to end the conversation anytime.`
        );
      } catch (error) {
        console.error('Failed to notify partner:', error);
      }
    } else {
      // No matches available
      await createConversation(chatId);
      await ctx.reply(
        '🔍 Searching for partners... No one available right now.\n\n' +
        `Stay live with /start or try /search again soon!`
      );
    }
  } catch (error) {
    console.error('Error in handleSearch:', error);
    await ctx.reply('Sorry, search failed. Please try again.');
  }
};

export const handleStop = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
  try {
    const conversation = await getUserConversation(chatId);
    
    if (conversation) {
      const ended = await endConversation(conversation.conversationid);
      if (ended) {
        await saveChat(chatId, 'live');
        await ctx.reply(
          '👋 Conversation ended. You are now available for new matches!\n\n' +
          `Use /search to find a new partner.`
        );
        
        // Notify the other partner
        const partner1 = parseInt(conversation.partnerid1);
        const partner2 = conversation.partnerid2 ? parseInt(conversation.partnerid2) : null;
        const otherPartner = partner1 === chatId ? partner2 : partner1;
        
        if (otherPartner) {
          try {
            await ctx.telegram.sendMessage(
              otherPartner,
              '💔 Your partner has ended the conversation.\n\n' +
              `You can use /search to find a new partner!`
            );
          } catch (error) {
            console.error('Failed to notify other partner:', error);
          }
        }
      }
    } else {
      await ctx.reply('You are not currently in any conversation.');
    }
  } catch (error) {
    console.error('Error in handleStop:', error);
    await ctx.reply('Failed to stop conversation. Please try again.');
  }
};

export const handleMessageForwarding = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId || !ctx.message?.text) return;
  
  // Ignore commands
  if (ctx.message.text.startsWith('/')) return;
  
  try {
    const conversation = await getUserConversation(chatId);
    
    if (!conversation) {
      return ctx.reply(
        "I don't understand 😕 Please use /search to find a partner first!"
      );
    }
    
    if (conversation.status === 'end') {
      return ctx.reply(
        "This conversation has ended. Use /stop to close it, then /search for a new partner!"
      );
    }
    
    // Forward message to partner
    const partner1 = parseInt(conversation.partnerid1);
    const partner2 = conversation.partnerid2 ? parseInt(conversation.partnerid2) : null;
    const partnerChatId = partner1 === chatId ? partner2 : partner1;
    
    if (partnerChatId) {
      try {
        await ctx.telegram.sendMessage(
          partnerChatId,
          ctx.message.text
        );
      } catch (error) {
        console.error('Failed to forward message:', error);
        await ctx.reply(
          'Sorry, I couldn\'t deliver your message. Your partner might have left.'
        );
      }
    } else {
      await ctx.reply(
        'No partner available right now. Use /search to find someone new!'
      );
    }
  } catch (error) {
    console.error('Error in message forwarding:', error);
    await ctx.reply('Something went wrong. Please try again.');
  }
};
