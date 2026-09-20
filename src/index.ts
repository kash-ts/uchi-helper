import { interceptGatewaySessionsFetch } from './interceptor/fetchInterceptor';
import { ensureAnswersPanel, updateAnswersPanel, setupIframeWatcher, removeAnswersPanel, isCompoundWorkPage, openSettingsView } from './ui/answersPanel';
import { extractAnswers, setupTaskUrlWatcher } from './utils/answers';
import { solveActiveTask } from './utils/autoSolver';
import { debugLog } from './utils/settings';

declare const unsafeWindow: (Window & typeof globalThis) | undefined;
const targetWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

if (typeof (targetWin as unknown as { MutationEvent?: unknown }).MutationEvent === 'undefined') {
  (targetWin as unknown as { MutationEvent: unknown }).MutationEvent = class MutationEvent extends Event {};
}

let isInitialized = false;
let taskUrlWatcherCleanup: (() => void) | null = null;

function onTopWindowMessage(event: MessageEvent): void {
  if (event.data?.type === 'UCHI_ANSWERS') {
    updateAnswersPanel(event.data.extracted);
  }
}

async function onChildFrameMessage(event: MessageEvent): Promise<void> {
  if (event.data?.type === 'UCHI_EXECUTE_AUTOSOLVE' && Array.isArray(event.data.items)) {
    await solveActiveTask(event.data.items, document);
  }
}

function onFetchIntercepted(out: { data: unknown; url: string; response: Response }): void {
  if (!isCompoundWorkPage()) {
    return;
  }
  const extracted = extractAnswers(out.data);

  if (window.self === window.top) {
    updateAnswersPanel(extracted);
  } else {
    try {
      window.top?.postMessage({ type: 'UCHI_ANSWERS', extracted }, '*');
    } catch (e) {
      console.warn('[uchi.ru Helper] postMessage error:', e);
    }
  }
}

function initApp(): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;
  debugLog('Инициализация Uchi.ru Helper выполнена на странице students/compound_work');

  if (window.self === window.top) {
    ensureAnswersPanel();

    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Настройки', () => {
        openSettingsView();
      });
    }

    taskUrlWatcherCleanup = setupTaskUrlWatcher((extracted) => {
      updateAnswersPanel(extracted);
    });

    window.addEventListener('message', onTopWindowMessage);
  } else {
    setupIframeWatcher();
    window.addEventListener('message', onChildFrameMessage);
  }

  interceptGatewaySessionsFetch(onFetchIntercepted);
}

function destroyApp(): void {
  if (!isInitialized) {
    return;
  }
  isInitialized = false;
  debugLog('Деинициализация Uchi.ru Helper');

  if (window.self === window.top) {
    removeAnswersPanel();
    if (taskUrlWatcherCleanup) {
      taskUrlWatcherCleanup();
      taskUrlWatcherCleanup = null;
    }
    window.removeEventListener('message', onTopWindowMessage);
  } else {
    window.removeEventListener('message', onChildFrameMessage);
  }
}

function checkAndSyncState(): void {
  const onCompound = isCompoundWorkPage();
  if (onCompound) {
    if (!isInitialized) {
      initApp();
    }
  } else {
    if (isInitialized) {
      destroyApp();
      console.log('[uchi.ru Helper] Инициализация не выполнена, так как не открыта страница с заданиями (students/compound_work/...)');
    }
  }
}

if (isCompoundWorkPage()) {
  initApp();
} else {
  console.log('[uchi.ru Helper] Инициализация не выполнена, так как не открыта страница с заданиями (students/compound_work/...)');
}

setInterval(checkAndSyncState, 1000);
window.addEventListener('popstate', checkAndSyncState);
window.addEventListener('hashchange', checkAndSyncState);
