export function getGigaChatAuthKey(): string | null {
  try {
    if (typeof GM_getValue === 'function') {
      const val = GM_getValue<string | null>('GIGACHAT_AUTH_KEY', null);
      if (val) {
        return val;
      }
    }
    return localStorage.getItem('GIGACHAT_AUTH_KEY');
  } catch {
    return null;
  }
}

export function setGigaChatAuthKey(key: string): void {
  const trimmed = key.trim();
  try {
    if (typeof GM_setValue === 'function') {
      GM_setValue('GIGACHAT_AUTH_KEY', trimmed);
    }
    localStorage.setItem('GIGACHAT_AUTH_KEY', trimmed);
  } catch (e) {
    console.debug(e);
  }
}

export function isDebugMode(): boolean {
  try {
    if (typeof GM_getValue === 'function') {
      const val = GM_getValue<boolean>('UCHI_DEBUG_MODE', false);
      if (typeof val === 'boolean') {
        return val;
      }
    }
    return localStorage.getItem('UCHI_DEBUG_MODE') === 'true';
  } catch {
    return false;
  }
}

export function setDebugMode(enabled: boolean): void {
  try {
    if (typeof GM_setValue === 'function') {
      GM_setValue('UCHI_DEBUG_MODE', enabled);
    }
    localStorage.setItem('UCHI_DEBUG_MODE', String(enabled));
  } catch (e) {
    console.debug(e);
  }
}

export function debugLog(...args: unknown[]): void {
  if (isDebugMode()) {
    console.log('[uchi.ru Helper DEBUG]', ...args);
  }
}

export function promptForGigaChatKey(): string | null {
  const current = getGigaChatAuthKey() || '';
  const input = window.prompt('Введите API ключ (Authorization Key от GigaChat):', current);
  if (input !== null) {
    const trimmed = input.trim();
    if (trimmed) {
      setGigaChatAuthKey(trimmed);
      return trimmed;
    }
  }
  return null;
}
