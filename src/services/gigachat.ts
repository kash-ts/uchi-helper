import { GIGACHAT_SYSTEM_PROMPT } from './gigachatPrompt';

interface GigaChatTokenResponse {
  access_token: string;
  expires_at: number;
}


interface GigaChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface AiTaskItem {
  id: string | number;
  question: string;
  inputType?: string;
  options?: string[];
}

export interface AiTaskPayload {
  instruction: string;
  task: string;
  kind: string;
  items: AiTaskItem[];
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export { getGigaChatAuthKey, setGigaChatAuthKey, promptForGigaChatKey } from '../utils/settings';
import { getGigaChatAuthKey, promptForGigaChatKey, debugLog } from '../utils/settings';

export async function fetchAccessToken(authKey: string): Promise<string> {
  const cachedToken = GM_getValue<string | null>('GIGACHAT_ACCESS_TOKEN', null);
  const expiresAt = GM_getValue<number>('GIGACHAT_TOKEN_EXPIRES', 0);
  const now = Date.now();

  if (cachedToken && expiresAt > now + 60000) {
    return cachedToken;
  }

  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
      headers: {
        'Authorization': `Basic ${authKey}`,
        'RqUID': generateUuid(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: 'scope=GIGACHAT_API_PERS',
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const data = JSON.parse(res.responseText) as GigaChatTokenResponse;
            GM_setValue('GIGACHAT_ACCESS_TOKEN', data.access_token);
            GM_setValue('GIGACHAT_TOKEN_EXPIRES', data.expires_at);
            resolve(data.access_token);
          } catch (e) {
            reject(new Error(`Ошибка парсинга токена: ${(e as Error).message}`));
          }
        } else {
          reject(new Error(`Ошибка авторизации API (${res.status}): ${res.responseText}`));
        }
      },
      onerror: (err) => {
        reject(new Error(`Сетевая ошибка авторизации: ${JSON.stringify(err)}`));
      }
    });
  });
}

const MODELS_CASCADE = ['GigaChat-Pro', 'GigaChat-Max', 'GigaChat'];

async function requestCompletionWithModel(
  accessToken: string,
  modelName: string,
  systemPrompt: string,
  payload: AiTaskPayload
): Promise<string> {
  const requestBody = {
    model: modelName,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: JSON.stringify(payload)
      }
    ],
    temperature: 0.1,
    max_tokens: 1024
  };

  console.log(`[AI Request (${modelName}) JSON]:`, JSON.stringify(requestBody));

  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(requestBody),
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const data = JSON.parse(res.responseText) as GigaChatCompletionResponse;
            console.log(`[AI Response (${modelName}) JSON]:`, data);
            const rawContent = data.choices?.[0]?.message?.content || '';
            console.log(`[AI Response (${modelName}) Content]:\n`, rawContent);

            let finalAnswer = '';
            const answerMatch = rawContent.match(/<answer>([\s\S]*?)<\/answer>/i);
            if (answerMatch) {
              finalAnswer = answerMatch[1];
            } else {
              finalAnswer = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            }

            const cleaned = (finalAnswer || rawContent)
              .replace(/<\/?think>/gi, '')
              .replace(/<\/?answer>/gi, '')
              .replace(/\r\n/g, '\n')
              .replace(/\\n/g, '\n')
              .replace(/\*\*/g, '')
              .replace(/###/g, '')
              .replace(/##/g, '')
              .replace(/#/g, '')
              .trim();

            console.log(`[AI Cleaned Answer]:\n`, cleaned);

            if (cleaned) {
              resolve(cleaned);
            } else {
              reject(new Error(`Модель ${modelName} вернула пустой ответ`));
            }
          } catch (e) {
            reject(new Error(`Ошибка парсинга ответа (${modelName}): ${(e as Error).message}`));
          }
        } else {
          console.warn(`[AI Error (${modelName})]:`, res.status, res.responseText);
          reject(new Error(`Ошибка ${modelName} (${res.status}): ${res.responseText}`));
        }
      },
      onerror: (err) => {
        console.error(`[AI Network Error (${modelName})]:`, err);
        reject(new Error(`Сетевая ошибка ${modelName}: ${JSON.stringify(err)}`));
      }
    });
  });
}

export async function solveTaskWithGigaChat(payload: AiTaskPayload): Promise<string> {
  let authKey = getGigaChatAuthKey();
  if (!authKey) {
    authKey = promptForGigaChatKey();
    if (!authKey) {
      throw new Error('API ключ не указан');
    }
  }

  const accessToken = await fetchAccessToken(authKey);
  debugLog('Requesting completion for payload:', payload);

  let lastError: Error | null = null;

  for (let i = 0; i < MODELS_CASCADE.length; i++) {
    const model = MODELS_CASCADE[i];
    try {
      const res = await requestCompletionWithModel(accessToken, model, GIGACHAT_SYSTEM_PROMPT, payload);
      debugLog(`Model ${model} responded:`, res);
      return res;
    } catch (err) {
      lastError = err as Error;
      debugLog(`Model ${model} error:`, lastError.message);
      console.warn(`[AI Cascade] ${model} не сработала: ${lastError.message}`);
      if (i < MODELS_CASCADE.length - 1) {
        console.log(`[AI Cascade] Переключение на модель: ${MODELS_CASCADE[i + 1]}`);
      }
    }
  }

  throw lastError || new Error('Все доступные модели вернули ошибку');
}
