import { Context } from 'telegraf';
import createDebug from 'debug';

const debug = createDebug('bot:greeting_text');

// Google Sheets configuration
const SHEET_ID = '1Qzgu7YnL23Nxf-2oznc77wYKuc2EXtMKDp8Ztm9p4J4';
const CHATS_SHEET = 'chats';
const TALK_SHEET = 'talk';

interface ChatUser {
  chatid: string;
  status: string;
  timestamp: string;
}

interface Conversation {
  conversationid: string;
  partnerid1: string;
  partnerid2: string;
  status: string;
  timestamp: string;
}

// Google Sheets service
class SheetService {
  private baseURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=`;

  private async getSheetData(sheetName: string): Promise<any[]> {
    try {
      let sheetGid = '0';
      if (sheetName === CHATS_SHEET) sheetGid = '1736350533';
      else if (sheetName === TALK_SHEET) sheetGid = '0'; // Update with actual gid for talk sheet

      const response = await fetch(this.baseURL + sheetGid);
      const text = await response.text();
      const json = JSON.parse(text.substring(47).slice(0, -2));
      
      if (!json.table.rows) return [];
      
      return json.table.rows.map((row: any) => {
        const obj: any = {};
        row.c.forEach((cell: any, index: number) => {
          obj[json.table.cols[index].label] = cell ? cell.v : '';
        });
        return obj;
      });
    } catch (error) {
      console.error('Error fetching sheet data:', error);
      return [];
    }
  }

  private async appendToSheet(sheetName: string, data: any[]): Promise<void> {
    // This would require Google Sheets API implementation
    // For now, we'll use a simplified approach
    console.log(`Appending to ${sheetName}:`, data);
  }

  private async updateSheet(sheetName: string, updates: {[key: string]: any}[], keyField: string): Promise<void> {
    // This would require Google Sheets API implementation
    console.log(`Updating ${sheetName}:`, updates);
  }

  async getChatUsers(): Promise<ChatUser[]> {
    return await this.getSheetData(CHATS_SHEET);
  }

  async getConversations(): Promise<Conversation[]> {
    return await this.getSheetData(TALK_SHEET);
  }

  async updateUserStatus(chatid: string, status: string): Promise<void> {
    const updates = [{ chatid, status, timestamp: new Date().toISOString() }];
    await this.updateSheet(CHATS_SHEET, updates, 'chatid');
  }

  async createUser(chatid: string, status: string): Promise<void> {
    const data = [[chatid, status, new Date().toISOString()]];
    await this.appendToSheet(CHATS_SHEET, data);
  }

  async createConversation(conversationid: string, partnerid1: string, partnerid2: string): Promise<void> {
    const data = [[conversationid, partnerid1, partnerid2, 'start', new Date().toISOString()]];
    await this.appendToSheet(TALK_SHEET, data);
  }

  async updateConversationStatus(conversationid: string, status: string): Promise<void> {
    const updates = [{ conversationid, status }];
    await this.updateSheet(TALK_SHEET, updates, 'conversationid');
  }
}

const sheetService = new SheetService();

const replyToMessage = (ctx: Context, messageId: number, string: string) =>
  ctx.reply(string, {
    reply_to_message_id: messageId,
  });

const generateConversationId = (): string => {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const handleStart = () => async (ctx: Context) => {
  const debug = createDebug('bot:start_command');
  debug('Triggered "start" command');

  const messageId = ctx.message?.message_id;
  const chatId = ctx.message?.chat.id.toString();
  const userName = `${ctx.message?.from.first_name} ${ctx.message?.from.last_name || ''}`.trim();

  if (!chatId) {
    await ctx.reply('Error: Could not get chat ID');
    return;
  }

  try {
    // Update user status to live
    await sheetService.updateUserStatus(chatId, 'live');
    
    if (messageId) {
      await replyToMessage(ctx, messageId, `Welcome ${userName}! You are now online. Use /search to find a partner.`);
    } else {
      await ctx.reply(`Welcome ${userName}! You are now online. Use /search to find a partner.`);
    }
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('An error occurred. Please try again.');
  }
};

const handleSearch = () => async (ctx: Context) => {
  const debug = createDebug('bot:search_command');
  debug('Triggered "search" command');

  const messageId = ctx.message?.message_id;
  const chatId = ctx.message?.chat.id.toString();
  const userName = `${ctx.message?.from.first_name} ${ctx.message?.from.last_name || ''}`.trim();

  if (!chatId) {
    await ctx.reply('Error: Could not get chat ID');
    return;
  }

  try {
    // Check if user is already in an active conversation
    const conversations = await sheetService.getConversations();
    const activeConversation = conversations.find(conv => 
      (conv.partnerid1 === chatId || conv.partnerid2 === chatId) && conv.status === 'start'
    );

    if (activeConversation) {
      await ctx.reply('You are already matched with a partner. Please use /stop to end the current conversation before searching again.');
      return;
    }

    // Update user status to live
    await sheetService.updateUserStatus(chatId, 'live');

    // Find random user with status live (excluding current user)
    const users = await sheetService.getChatUsers();
    const availableUsers = users.filter(user => 
      user.chatid !== chatId && user.status === 'live' && user.chatid
    );

    if (availableUsers.length === 0) {
      await ctx.reply('No users available at the moment. Please try again later.');
      return;
    }

    // Select random user
    const randomUser = availableUsers[Math.floor(Math.random() * availableUsers.length)];
    
    // Create conversation
    const conversationId = generateConversationId();
    await sheetService.createConversation(conversationId, chatId, randomUser.chatid);

    // Update both users status to indicate they're in conversation
    await sheetService.updateUserStatus(chatId, 'in_conversation');
    await sheetService.updateUserStatus(randomUser.chatid, 'in_conversation');

    // Notify both users
    await ctx.reply(`You've been matched with a partner! Start chatting now. Use /stop to end the conversation.`);
    
    // Notify the partner (this would require the bot to message the other user)
    try {
      await ctx.telegram.sendMessage(randomUser.chatid, `You've been matched with a partner! Start chatting now. Use /stop to end the conversation.`);
    } catch (error) {
      console.error('Could not notify partner:', error);
    }

  } catch (error) {
    console.error('Error in search command:', error);
    await ctx.reply('An error occurred while searching for a partner. Please try again.');
  }
};

const handleStop = () => async (ctx: Context) => {
  const debug = createDebug('bot:stop_command');
  debug('Triggered "stop" command');

  const chatId = ctx.message?.chat.id.toString();

  if (!chatId) {
    await ctx.reply('Error: Could not get chat ID');
    return;
  }

  try {
    // Find active conversation
    const conversations = await sheetService.getConversations();
    const activeConversation = conversations.find(conv => 
      (conv.partnerid1 === chatId || conv.partnerid2 === chatId) && conv.status === 'start'
    );

    if (!activeConversation) {
      await ctx.reply('You are not in any active conversation.');
      return;
    }

    // Update conversation status to end
    await sheetService.updateConversationStatus(activeConversation.conversationid, 'end');

    // Get partner ID
    const partnerId = activeConversation.partnerid1 === chatId ? activeConversation.partnerid2 : activeConversation.partnerid1;

    // Update both users status to offline
    await sheetService.updateUserStatus(chatId, 'offline');
    await sheetService.updateUserStatus(partnerId, 'offline');

    // Notify both users
    await ctx.reply('Conversation ended. Use /search to find a new partner.');
    
    // Notify partner
    try {
      await ctx.telegram.sendMessage(partnerId, 'Your partner has ended the conversation. Use /search to find a new partner.');
    } catch (error) {
      console.error('Could not notify partner:', error);
    }

  } catch (error) {
    console.error('Error in stop command:', error);
    await ctx.reply('An error occurred while ending the conversation. Please try again.');
  }
};

const handleMessage = () => async (ctx: Context) => {
  const debug = createDebug('bot:message_handler');
  debug('Handling message');

  const chatId = ctx.message?.chat.id.toString();
  const messageText = 'text' in ctx.message ? ctx.message.text : '';

  if (!chatId) {
    return;
  }

  // Ignore command messages
  if (messageText.startsWith('/')) {
    return;
  }

  try {
    // Check if user is in an active conversation
    const conversations = await sheetService.getConversations();
    const activeConversation = conversations.find(conv => 
      (conv.partnerid1 === chatId || conv.partnerid2 === chatId) && conv.status === 'start'
    );

    if (!activeConversation) {
      await ctx.reply("I don't understand. Please use /search to find a partner.");
      return;
    }

    // Get partner ID
    const partnerId = activeConversation.partnerid1 === chatId ? activeConversation.partnerid2 : activeConversation.partnerid1;

    // Forward message to partner
    try {
      const userName = `${ctx.message?.from.first_name} ${ctx.message?.from.last_name || ''}`.trim();
      await ctx.telegram.sendMessage(partnerId, `${userName}: ${messageText}`);
    } catch (error) {
      console.error('Error forwarding message:', error);
      await ctx.reply('Error sending message to partner. They may have ended the conversation.');
    }

  } catch (error) {
    console.error('Error handling message:', error);
    await ctx.reply('An error occurred while processing your message.');
  }
};

const greeting = () => async (ctx: Context) => {
  debug('Triggered "greeting" text command');

  const messageId = ctx.message?.message_id;
  const userName = `${ctx.message?.from.first_name} ${ctx.message?.from.last_name || ''}`.trim();

  if (messageId) {
    await replyToMessage(ctx, messageId, `Hello, ${userName}! Use /start to begin.`);
  }
};

export { greeting, handleMessage, handleSearch, handleStop, handleStart };
