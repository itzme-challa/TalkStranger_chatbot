import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

if (!GOOGLE_API_KEY) {
  console.error('Missing GOOGLE_API_KEY in environment.');
  process.exit(1);
}

// Init Gemini via ai-sdk.dev
const google = createGoogleGenerativeAI({ apiKey: GOOGLE_API_KEY });

// Store conversation contexts
const userContexts = new Map();
const MAX_CONTEXT_TURNS = parseInt(process.env.MAX_CONTEXT_TURNS || '10', 10);

export function pushToContext(chatId: number, role: string, content: string) {
  const ctx = userContexts.get(chatId) || [];
  ctx.push({ role, content });
  // Trim oldest messages to cap memory
  while (ctx.length > MAX_CONTEXT_TURNS * 2) ctx.shift();
  userContexts.set(chatId, ctx);
}

export function resetContext(chatId: number) {
  userContexts.set(chatId, []);
}

export async function generateGeminiResponse(chatId: number, userMessage: string): Promise<string> {
  const context = userContexts.get(chatId) || [];

  const result = streamText({
    model: google(GEMINI_MODEL),
    maxOutputTokens: 512,
    messages: [
      { role: 'system', content: 'You are a helpful, concise assistant inside a Telegram bot. Keep answers compact unless asked.' },
      ...context,
      { role: 'user', content: userMessage }
    ],
  });

  const reader = result.textStream.getReader();
  let text = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += value;
  }

  // Save to context
  pushToContext(chatId, 'user', userMessage);
  pushToContext(chatId, 'assistant', text);

  return text;
}