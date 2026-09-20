import type { ExtractedAnswer } from '../utils/answers';
import { cleanMathInElement } from '../utils/answers';
import { solveTaskWithGigaChat, type AiTaskPayload } from '../services/gigachat';
import { formatTaskWithStats } from '../utils/taskFormatter';
import { solveActiveTask, clickNextButton, clickElement, getTargetDocument, hasTaskVisuals, skipToNextStepperItem, dismissPopups } from '../utils/autoSolver';
import { getGigaChatAuthKey, setGigaChatAuthKey, isDebugMode, setDebugMode } from '../utils/settings';

const PANEL_ID = 'tampermonkey-answers-panel';

let currentExtracted: ExtractedAnswer | null = null;
let autoModeInterval: ReturnType<typeof setInterval> | null = null;
let lastSolvedTaskId = '';
let lastSolvedTime = 0;
let isSolvingNow = false;

export function broadcastToAllFrames(win: Window = window, message: unknown): void {
  try {
    win.postMessage(message, '*');
  } catch (e) {
    console.debug(e);
  }
  for (let i = 0; i < win.frames.length; i++) {
    try {
      broadcastToAllFrames(win.frames[i], message);
    } catch (e) {
      console.debug(e);
    }
  }
}

export function isCompoundWorkPage(): boolean {
  try {
    const path = window.location.pathname;
    if (path.includes('/students/compound_work/') || path.includes('students/compound_work')) {
      return true;
    }
    if (window.self !== window.top) {
      try {
        if (window.top && window.top.location.pathname.includes('students/compound_work')) {
          return true;
        }
      } catch {
        if (document.referrer && document.referrer.includes('students/compound_work')) {
          return true;
        }
      }
    }
  } catch (e) {
    console.debug(e);
  }
  return false;
}

export function isTaskPage(): boolean {
  return isCompoundWorkPage();
}

export function removeAnswersPanel(): void {
  if (autoModeInterval) {
    clearInterval(autoModeInterval);
    autoModeInterval = null;
  }
  const panel = document.getElementById(PANEL_ID);
  if (panel) {
    panel.remove();
  }
}

export function setupAutoModeWatcher(): void {
  if (autoModeInterval) {
    return;
  }
  autoModeInterval = setInterval(() => {
    const isAuto = typeof GM_getValue === 'function' ? Boolean(GM_getValue('UCHI_AUTO_MODE', true)) : true;
    if (!isAuto || !isTaskPage()) {
      return;
    }

    // 1. If on compound work landing page, click Play to continue
    if (window.location.pathname.includes('/compound_work/')) {
      const playBtn = document.querySelector<HTMLButtonElement>(
        'button svg[class*="icon-Play"], [class*="taskButton"] button'
      )?.closest('button');
      if (playBtn && !playBtn.disabled) {
        clickElement(playBtn);
        return;
      }
    }

    const targetDoc = getTargetDocument();
    dismissPopups(document);
    dismissPopups(targetDoc);
    void clickNextButton(targetDoc);
    void clickNextButton(document);

    const iframes = Array.from(document.querySelectorAll('iframe'));
    for (const ifr of iframes) {
      try {
        if (ifr.contentDocument) {
          dismissPopups(ifr.contentDocument);
          void clickNextButton(ifr.contentDocument);
        }
      } catch (e) {
        console.debug(e);
      }
    }

    if (!isSolvingNow) {
      if (hasTaskVisuals(targetDoc) || hasTaskVisuals(document)) {
        skipToNextStepperItem(document);
        return;
      }
      const buttons = Array.from(targetDoc.querySelectorAll<HTMLButtonElement>('button, div[role="button"]'));
      const submitBtn = buttons.find((b) => {
        const text = (b.textContent || '').trim().toLowerCase();
        const isDisabled = b.hasAttribute('disabled') || b.disabled;
        return text.includes('понятно') && !isDisabled;
      });
      if (submitBtn) {
        clickElement(submitBtn);
      }
      const docText = targetDoc.body?.innerText || '';
      const hasGradedMessage =
        docText.includes('Ответ верен') ||
        docText.includes('не выполнено') ||
        docText.includes('Завершить выполнение');
      const submitDisabled = buttons.some((b) => {
        const text = (b.textContent || '').trim().toLowerCase();
        const isDisabled = b.hasAttribute('disabled') || b.disabled;
        return text.includes('готово') && isDisabled;
      });
      if (hasGradedMessage && submitDisabled) {
        const stepped = skipToNextStepperItem(document);
        if (!stepped) {
          const finishBtn = Array.from(targetDoc.querySelectorAll<HTMLElement>('button, a, span, div[role="button"]')).find((b) => {
            const t = (b.textContent || '').trim().toLowerCase();
            return t === 'завершить выполнение' || t === 'завершить';
          });
          if (finishBtn) {
            clickElement(finishBtn);
          }
        }
      }
    }
  }, 1000);
}

function renderSettingsView(container: HTMLElement, onDone: () => void): void {
  container.innerHTML = '';

  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display: flex !important; justify-content: space-between !important; align-items: center !important; margin-bottom: 6px !important;';

  const title = document.createElement('span');
  title.textContent = 'Настройки';
  title.style.cssText = 'font-size: 13px !important; font-weight: 700 !important; color: #362f73 !important;';
  headerRow.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'border: none !important; background: transparent !important; font-size: 14px !important; color: #64748b !important; cursor: pointer !important; padding: 2px 6px !important;';
  closeBtn.addEventListener('click', onDone);
  headerRow.appendChild(closeBtn);

  container.appendChild(headerRow);

  const keySection = document.createElement('div');
  keySection.style.cssText = 'display: flex !important; flex-direction: column !important; gap: 4px !important;';

  const keyLabel = document.createElement('label');
  keyLabel.textContent = 'API ключ GigaChat:';
  keyLabel.style.cssText = 'font-size: 11px !important; font-weight: 600 !important; color: #475569 !important;';
  keySection.appendChild(keyLabel);

  const keyInputWrapper = document.createElement('div');
  keyInputWrapper.style.cssText = 'display: flex !important; gap: 4px !important; align-items: center !important;';

  const keyInput = document.createElement('input');
  keyInput.id = 'uchi-settings-key-input';
  keyInput.type = 'password';
  keyInput.placeholder = 'Authorization Key (Base64)';
  keyInput.value = getGigaChatAuthKey() || '';
  keyInput.style.cssText = `
    flex: 1 !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 6px !important;
    padding: 6px 8px !important;
    font-size: 12px !important;
    color: #0f172a !important;
    outline: none !important;
    box-sizing: border-box !important;
  `;
  keyInputWrapper.appendChild(keyInput);

  const toggleEyeBtn = document.createElement('button');
  toggleEyeBtn.textContent = 'Показать';
  toggleEyeBtn.style.cssText = `
    border: 1px solid #e2e8f0 !important;
    background: #f8fafc !important;
    color: #475569 !important;
    border-radius: 6px !important;
    padding: 6px 8px !important;
    font-size: 11px !important;
    cursor: pointer !important;
    white-space: nowrap !important;
  `;
  toggleEyeBtn.addEventListener('click', () => {
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      toggleEyeBtn.textContent = 'Скрыть';
    } else {
      keyInput.type = 'password';
      toggleEyeBtn.textContent = 'Показать';
    }
  });
  keyInputWrapper.appendChild(toggleEyeBtn);

  keySection.appendChild(keyInputWrapper);

  const keyHint = document.createElement('span');
  keyHint.textContent = 'Ключ в формате Base64 из личного кабинета Сбер Салют';
  keyHint.style.cssText = 'font-size: 10px !important; color: #94a3b8 !important;';
  keySection.appendChild(keyHint);

  container.appendChild(keySection);

  const debugSection = document.createElement('div');
  debugSection.style.cssText = 'display: flex !important; flex-direction: column !important; gap: 4px !important; padding: 8px 0 !important; border-top: 1px solid #f1f5f9 !important;';

  const debugLabel = document.createElement('label');
  debugLabel.style.cssText = 'display: flex !important; align-items: center !important; gap: 8px !important; font-size: 12px !important; font-weight: 600 !important; color: #1e293b !important; cursor: pointer !important; user-select: none !important;';

  const debugCheckbox = document.createElement('input');
  debugCheckbox.id = 'uchi-settings-debug-toggle';
  debugCheckbox.type = 'checkbox';
  debugCheckbox.checked = isDebugMode();
  debugCheckbox.style.cssText = 'cursor: pointer !important;';

  const debugText = document.createElement('span');
  debugText.textContent = 'Режим DEBUG (отладка)';

  debugLabel.appendChild(debugCheckbox);
  debugLabel.appendChild(debugText);
  debugSection.appendChild(debugLabel);

  const debugHint = document.createElement('span');
  debugHint.textContent = 'Вывод подробных логов операций в консоль';
  debugHint.style.cssText = 'font-size: 10px !important; color: #94a3b8 !important; margin-left: 20px !important;';
  debugSection.appendChild(debugHint);

  container.appendChild(debugSection);

  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display: flex !important; gap: 8px !important; justify-content: flex-end !important; margin-top: 4px !important;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Отмена';
  cancelBtn.style.cssText = `
    border: 1px solid #cbd5e1 !important;
    background: #f8fafc !important;
    color: #475569 !important;
    padding: 6px 12px !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
  `;
  cancelBtn.addEventListener('click', onDone);
  actionRow.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Сохранить';
  saveBtn.style.cssText = `
    border: none !important;
    background: #362f73 !important;
    color: #ffffff !important;
    padding: 6px 14px !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
  `;
  saveBtn.addEventListener('click', () => {
    setGigaChatAuthKey(keyInput.value);
    setDebugMode(debugCheckbox.checked);
    saveBtn.textContent = 'Сохранено ✓';
    saveBtn.style.background = '#059669';
    setTimeout(() => {
      onDone();
    }, 400);
  });
  actionRow.appendChild(saveBtn);

  container.appendChild(actionRow);
}

export function openSettingsView(): void {
  const p = ensureAnswersPanel();
  if (!p) {
    return;
  }
  const main = document.getElementById('tampermonkey-main-body');
  const settings = document.getElementById('tampermonkey-settings-view');
  const btn = document.getElementById('tampermonkey-settings-btn');
  if (main && settings) {
    main.style.display = 'none';
    settings.style.display = 'flex';
    if (btn) {
      btn.textContent = 'Назад';
    }
    const keyInput = document.getElementById('uchi-settings-key-input') as HTMLInputElement | null;
    if (keyInput) {
      keyInput.value = getGigaChatAuthKey() || '';
    }
    const debugCb = document.getElementById('uchi-settings-debug-toggle') as HTMLInputElement | null;
    if (debugCb) {
      debugCb.checked = isDebugMode();
    }
  }
}

export function closeSettingsView(): void {
  const main = document.getElementById('tampermonkey-main-body');
  const settings = document.getElementById('tampermonkey-settings-view');
  const btn = document.getElementById('tampermonkey-settings-btn');
  if (main && settings) {
    settings.style.display = 'none';
    main.style.display = 'flex';
    if (btn) {
      btn.textContent = 'Настройки';
    }
  }
}

export function ensureAnswersPanel(): HTMLElement | null {
  if (window.self !== window.top || !isCompoundWorkPage()) {
    return null;
  }

  setupAutoModeWatcher();

  let panel = document.getElementById(PANEL_ID);
  if (panel) {
    return panel;
  }

  let initialTop = '16px';
  let initialLeft = 'auto';
  let initialRight = '16px';

  try {
    const rawPos =
      (typeof GM_getValue === 'function' ? GM_getValue('UCHI_PANEL_POSITION', null) : null) ||
      localStorage.getItem('UCHI_PANEL_POSITION');
    if (rawPos) {
      const parsed = typeof rawPos === 'string' ? JSON.parse(rawPos) : rawPos;
      if (parsed && parsed.left && parsed.top) {
        initialLeft = parsed.left;
        initialTop = parsed.top;
        initialRight = 'auto';
      }
    }
  } catch (e) {
    console.debug(e);
  }

  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = `
    position: fixed !important;
    top: ${initialTop} !important;
    left: ${initialLeft} !important;
    right: ${initialRight} !important;
    bottom: auto !important;
    z-index: 2147483647 !important;
    background: #ffffff !important;
    color: #1e293b !important;
    padding: 14px 16px !important;
    border-radius: 12px !important;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05) !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
    font-size: 13px !important;
    line-height: 1.4 !important;
    min-width: 290px !important;
    max-width: 380px !important;
    border: 1px solid #e2e8f0 !important;
    border-top: 3px solid #362f73 !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    font-weight: 700 !important;
    margin-bottom: 10px !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    border-bottom: 1px solid #f1f5f9 !important;
    padding-bottom: 8px !important;
    color: #362f73 !important;
    cursor: grab !important;
    user-select: none !important;
  `;

  const titleText = document.createElement('span');
  titleText.textContent = 'Uchi.ru Helper';
  titleText.style.cssText = `color: #362f73 !important; font-weight: 700 !important;`;
  header.appendChild(titleText);

  const headerRight = document.createElement('div');
  headerRight.style.cssText = `display: flex !important; align-items: center !important; gap: 6px !important;`;

  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'tampermonkey-settings-btn';
  settingsBtn.textContent = 'Настройки';
  settingsBtn.style.cssText = `
    font-size: 10px !important;
    font-weight: 600 !important;
    color: #475569 !important;
    background: #f8fafc !important;
    border: 1px solid #cbd5e1 !important;
    padding: 2px 8px !important;
    border-radius: 4px !important;
    cursor: pointer !important;
  `;
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const settingsView = document.getElementById('tampermonkey-settings-view');
    if (settingsView && settingsView.style.display === 'none') {
      openSettingsView();
    } else {
      closeSettingsView();
    }
  });
  headerRight.appendChild(settingsBtn);

  const onTask = isTaskPage();
  const statusDot = document.createElement('span');
  statusDot.id = 'tampermonkey-panel-status';
  statusDot.style.cssText = `
    font-size: 11px !important;
    font-weight: 500 !important;
    color: ${onTask ? '#64748b' : '#362f73'} !important;
    background: ${onTask ? '#f1f5f9' : '#ede9fe'} !important;
    padding: 2px 8px !important;
    border-radius: 6px !important;
  `;
  statusDot.textContent = onTask ? 'Ожидание...' : 'Готов';
  headerRight.appendChild(statusDot);

  header.appendChild(headerRight);
  panel.appendChild(header);

  setupDraggable(panel, header);

  const mainBodyWrapper = document.createElement('div');
  mainBodyWrapper.id = 'tampermonkey-main-body';
  mainBodyWrapper.style.cssText = 'display: flex !important; flex-direction: column !important;';

  const content = document.createElement('div');
  content.id = 'tampermonkey-answers-content';
  content.style.cssText = `font-size: 13px !important; color: #64748b !important;`;
  content.textContent = 'Ожидание сетевого запроса задания...';
  mainBodyWrapper.appendChild(content);

  const aiActionContainer = document.createElement('div');
  aiActionContainer.id = 'tampermonkey-ai-action-container';
  aiActionContainer.style.cssText = `margin-top: 10px !important; padding-top: 8px !important; border-top: 1px solid #f1f5f9 !important;`;
  mainBodyWrapper.appendChild(aiActionContainer);

  renderAiButton(aiActionContainer);
  panel.appendChild(mainBodyWrapper);

  const settingsWrapper = document.createElement('div');
  settingsWrapper.id = 'tampermonkey-settings-view';
  settingsWrapper.style.cssText = 'display: none !important; flex-direction: column !important; gap: 8px !important;';
  renderSettingsView(settingsWrapper, () => {
    closeSettingsView();
  });
  panel.appendChild(settingsWrapper);

  const tryAttach = () => {
    if (window.self !== window.top) {
      return;
    }
    if (document.body && !document.body.contains(panel)) {
      document.body.appendChild(panel);
    }
  };

  tryAttach();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAttach);
  }
  window.addEventListener('load', tryAttach);
  const interval = setInterval(tryAttach, 300);
  setTimeout(() => {
    clearInterval(interval);
  }, 30000);

  return panel;
}

function setupDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = panel.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    panel.style.left = `${initialLeft}px`;
    panel.style.top = `${initialTop}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    handle.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) {
      return;
    }

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const newLeft = initialLeft + deltaX;
    const newTop = initialTop + deltaY;

    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;

    const clampedLeft = Math.max(0, Math.min(newLeft, maxLeft));
    const clampedTop = Math.max(0, Math.min(newTop, maxTop));

    panel.style.left = `${clampedLeft}px`;
    panel.style.top = `${clampedTop}px`;
  };

  const onPointerUp = () => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    handle.style.cursor = 'grab';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);

    try {
      const pos = { left: panel.style.left, top: panel.style.top };
      if (typeof GM_setValue === 'function') {
        GM_setValue('UCHI_PANEL_POSITION', JSON.stringify(pos));
      }
      localStorage.setItem('UCHI_PANEL_POSITION', JSON.stringify(pos));
    } catch (e) {
      console.debug(e);
    }
  };

  handle.addEventListener('pointerdown', onPointerDown);
}

function renderAiButton(container: HTMLElement): void {
  container.innerHTML = '';
  const hasTask = Boolean(currentExtracted && currentExtracted.items.length > 0);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = `display: flex !important; gap: 8px !important; margin-bottom: 8px !important;`;

  const autoSolveBtn = document.createElement('button');
  autoSolveBtn.id = 'tampermonkey-auto-solve-btn';
  autoSolveBtn.textContent = 'Решить автоматически';
  autoSolveBtn.disabled = !hasTask;
  autoSolveBtn.style.cssText = `
    flex: 1 !important;
    background: ${hasTask ? '#10b981' : '#cbd5e1'} !important;
    color: ${hasTask ? '#ffffff' : '#64748b'} !important;
    border: none !important;
    padding: 8px 10px !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
    font-size: 12px !important;
    cursor: ${hasTask ? 'pointer' : 'not-allowed'} !important;
    transition: background 0.15s ease !important;
  `;
  autoSolveBtn.addEventListener('click', () => {
    if (!autoSolveBtn.disabled) {
      handleAutoSolve(container);
    }
  });
  btnRow.appendChild(autoSolveBtn);

  const solveBtn = document.createElement('button');
  solveBtn.id = 'tampermonkey-ai-solve-btn';
  solveBtn.textContent = 'Показать ответ';
  solveBtn.disabled = !hasTask;
  solveBtn.style.cssText = `
    flex: 1 !important;
    background: ${hasTask ? '#362f73' : '#cbd5e1'} !important;
    color: ${hasTask ? '#ffffff' : '#64748b'} !important;
    border: none !important;
    padding: 8px 10px !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
    font-size: 12px !important;
    cursor: ${hasTask ? 'pointer' : 'not-allowed'} !important;
    transition: background 0.15s ease !important;
  `;
  solveBtn.addEventListener('click', () => {
    if (!solveBtn.disabled) {
      handleAiSolve(container);
    }
  });
  btnRow.appendChild(solveBtn);

  container.appendChild(btnRow);

  const autoModeRow = document.createElement('label');
  autoModeRow.style.cssText = `
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    font-size: 11px !important;
    color: #475569 !important;
    cursor: pointer !important;
    user-select: none !important;
  `;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = typeof GM_getValue === 'function' ? Boolean(GM_getValue('UCHI_AUTO_MODE', true)) : true;
  cb.style.cssText = `cursor: pointer !important;`;
  cb.addEventListener('change', () => {
    if (typeof GM_setValue === 'function') {
      GM_setValue('UCHI_AUTO_MODE', cb.checked);
    }
    if (cb.checked && hasTask) {
      handleAutoSolve(container);
    }
  });

  const cbLabel = document.createElement('span');
  cbLabel.textContent = 'Авто-режим (решать и переходить)';

  autoModeRow.appendChild(cb);
  autoModeRow.appendChild(cbLabel);
  container.appendChild(autoModeRow);
}

function getDomTaskContext(targetDoc: Document): string {
  try {
    if (!targetDoc.body) {
      return '';
    }
    const clone = targetDoc.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('style, script, #tampermonkey-answers-panel').forEach(el => el.remove());
    cleanMathInElement(clone);
    const text = clone.innerText || '';
    return text
      .replace(/Сообщить об ошибке/g, '')
      .replace(/Готово/g, '')
      .replace(/Выбери ответ/g, '[ ? ]')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (e) {
    console.debug(e);
    return '';
  }
}

function normalizeMathAnswer(ans: string, options?: string[]): string {
  let res = ans.trim();
  if (options && options.length > 0) {
    return res;
  }
  // Convert dot decimals to comma decimals for Russian school math: 0.1(6) -> 0,1(6), 3.(09) -> 3,(09)
  res = res.replace(/(\d+)\.(\d+)/g, '$1,$2');
  res = res.replace(/(\d+)\.\(/g, '$1,(');
  return res;
}

function isInsufficientInfoResponse(text: string): boolean {
  if (!text) {
    return false;
  }
  const lower = text.toLowerCase();
  const triggers = [
    'недостаточно информации',
    'не хватает информации',
    'недостаточно данных',
    'не хватает данных',
    'нет данных',
    'невозможно определить',
    'невозможно решить',
    'нужен рисунок',
    'нужен график',
    'нужно изображение',
    'требуется рисунок',
    'требуется график',
    'требуется изображение',
    'отсутствует рисунок',
    'отсутствует график',
    'отсутствует изображение',
    'нет рисунка',
    'нет графика',
    'нет изображения'
  ];
  return triggers.some((t) => lower.includes(t));
}

function parseAnswerFromAiResponse(solutionText: string, itemIndex: number, options?: string[], totalItemsCount = 1): string | null {
  if (isInsufficientInfoResponse(solutionText)) {
    return null;
  }
  const lines = solutionText.split('\n').map((l) => l.trim()).filter(Boolean);

  // If there is only 1 question item and options are provided (e.g. variants_all or multiple choice), find all matching options
  if (totalItemsCount === 1 && options && options.length > 1) {
    const matched = options.filter(opt => {
      const cleanOpt = opt.trim().toLowerCase().replace(/\s+/g, '');
      return lines.some(l => {
        const cleanLine = l.toLowerCase().replace(/\s+/g, '');
        return cleanLine === cleanOpt || cleanLine.includes(cleanOpt) || cleanOpt.includes(cleanLine);
      });
    });
    if (matched.length > 0) {
      return matched.join(', ');
    }
  }

  // 1. Try numbered prefix matching: "1. answer", "1) answer", "Вопрос 1: answer"
  const targetPrefix = new RegExp(`^(?:вопрос\\s*|пункт\\s*)?${itemIndex + 1}[.)\\s:-]+(.*)$`, 'i');
  for (const line of lines) {
    const match = targetPrefix.exec(line);
    if (match) {
      const rawAns = match[1].trim();
      if (options && options.length > 0) {
        const exactOpt = options.find((o) => o.toLowerCase() === rawAns.toLowerCase());
        if (exactOpt) {
          return exactOpt;
        }
        const containedOpt = options.find((o) => rawAns.includes(o));
        if (containedOpt) {
          return containedOpt;
        }
      }
      return normalizeMathAnswer(rawAns, options);
    }
  }

  // 2. Direct line indexing: if lines correspond to questions 1-to-1
  if (itemIndex < lines.length) {
    const candidate = lines[itemIndex].trim();
    if (options && options.length > 0) {
      const exactOpt = options.find((o) => o.toLowerCase() === candidate.toLowerCase());
      if (exactOpt) {
        return exactOpt;
      }
      const containedOpt = options.find((o) => candidate.includes(o));
      if (containedOpt) {
        return containedOpt;
      }
    } else if (candidate) {
      return normalizeMathAnswer(candidate, options);
    }
  }

  // 3. Fallback to regex in full solution text
  if (options && options.length > 0) {
    for (const opt of options) {
      const optRegex = new RegExp(`\\b${itemIndex + 1}\\b.*?([<>=]|${opt})`, 'i');
      const m = optRegex.exec(solutionText);
      if (m) {
        return m[1];
      }
    }
  }

  return null;
}

interface SavedTaskSolution {
  solutionText: string;
  answers: (string | null)[];
  timestamp: number;
}

function getStorageKey(taskId: string): string {
  return `UCHI_SAVED_SOLUTION_${taskId}`;
}

function saveTaskSolution(taskId: string, solutionText: string, answers: (string | null)[]): void {
  try {
    const data: SavedTaskSolution = {
      solutionText,
      answers,
      timestamp: Date.now()
    };
    const serialized = JSON.stringify(data);
    if (typeof GM_setValue === 'function') {
      GM_setValue(getStorageKey(taskId), serialized);
    }
    localStorage.setItem(getStorageKey(taskId), serialized);
  } catch (e) {
    console.debug(e);
  }
}

function loadTaskSolution(taskId: string): SavedTaskSolution | null {
  try {
    let raw: unknown = null;
    if (typeof GM_getValue === 'function') {
      raw = GM_getValue(getStorageKey(taskId), null);
    }
    if (!raw) {
      raw = localStorage.getItem(getStorageKey(taskId));
    }
    if (typeof raw === 'string') {
      return JSON.parse(raw) as SavedTaskSolution;
    }
    if (raw && typeof raw === 'object') {
      return raw as SavedTaskSolution;
    }
  } catch (e) {
    console.debug(e);
  }
  return null;
}

function getUniqueTaskId(extracted?: ExtractedAnswer | null): string {
  try {
    const topPath = window.location.pathname.split('/').filter(Boolean).pop();
    if (topPath && !['compound_work', 'students', 'profile', 'homeworks', 'player'].includes(topPath)) {
      return topPath;
    }
    const targetDoc = getTargetDocument();
    const subPath = targetDoc.location?.pathname?.split('/').filter(Boolean).pop();
    if (subPath && !['start', 'player', 'homeworks'].includes(subPath)) {
      return subPath;
    }
  } catch (e) {
    console.debug(e);
  }
  if (extracted && extracted.items.length > 0) {
    const questions = extracted.items.map((it) => it.question).join('|');
    return `${extracted.taskTitle || ''}::${questions}`.slice(0, 150);
  }
  return window.location.pathname;
}

function renderInsufficientInfo(container: HTMLElement, message = 'Недостаточно информации для решения задания.'): void {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display: flex !important; flex-direction: column !important; gap: 6px !important;';

  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display: flex !important; justify-content: space-between !important; align-items: center !important;';

  const title = document.createElement('span');
  title.style.cssText = 'font-size: 12px !important; font-weight: 600 !important; color: #b45309 !important;';
  title.textContent = 'Внимание:';
  headerRow.appendChild(title);

  const retryBtn = document.createElement('button');
  retryBtn.textContent = '↺ Заново';
  retryBtn.style.cssText = `
    border: none !important;
    background: transparent !important;
    cursor: pointer !important;
    font-size: 11px !important;
    color: #64748b !important;
    padding: 0 !important;
  `;
  retryBtn.addEventListener('click', () => {
    try {
      const id = getUniqueTaskId(currentExtracted);
      if (typeof GM_setValue === 'function') {
        GM_setValue(getStorageKey(id), '');
      }
      localStorage.removeItem(getStorageKey(id));
    } catch (e) {
      console.debug(e);
    }
    renderAiButton(container);
  });
  headerRow.appendChild(retryBtn);

  wrapper.appendChild(headerRow);

  const alertBox = document.createElement('div');
  alertBox.style.cssText = `
    background: #fffbeb !important;
    color: #92400e !important;
    border: 1px solid #fde68a !important;
    border-radius: 8px !important;
    padding: 8px 10px !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
    white-space: pre-wrap !important;
    max-height: 180px !important;
    overflow-y: auto !important;
    user-select: text !important;
  `;
  alertBox.textContent = message;
  wrapper.appendChild(alertBox);

  container.appendChild(wrapper);
}

async function handleAutoSolve(container: HTMLElement): Promise<void> {
  if (!currentExtracted || isSolvingNow) {
    return;
  }

  const currentTaskId = getUniqueTaskId(currentExtracted);
  const saved = loadTaskSolution(currentTaskId);
  if (saved && isInsufficientInfoResponse(saved.solutionText)) {
    renderInsufficientInfo(container, saved.solutionText);
    return;
  }

  const now = Date.now();
  if (lastSolvedTaskId && lastSolvedTaskId === currentTaskId && now - lastSolvedTime < 6000) {
    void clickNextButton(getTargetDocument());
    void clickNextButton(document);
    return;
  }

  lastSolvedTaskId = currentTaskId;
  lastSolvedTime = now;

  isSolvingNow = true;
  container.innerHTML = '';

  const loadingBox = document.createElement('div');
  loadingBox.style.cssText = `
    background: #ecfdf5 !important;
    color: #047857 !important;
    border: 1px solid #a7f3d0 !important;
    padding: 8px 12px !important;
    border-radius: 8px !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    text-align: center !important;
  `;
  loadingBox.textContent = 'Авто-решение...';
  container.appendChild(loadingBox);

  try {
    const targetDoc = getTargetDocument();
    if (hasTaskVisuals(targetDoc) || hasTaskVisuals(document)) {
      loadingBox.textContent = 'Пропуск задания с графиком/картинкой...';
      skipToNextStepperItem(targetDoc);
      skipToNextStepperItem(document);
      lastSolvedTaskId = currentTaskId;
      lastSolvedTime = Date.now();
      setTimeout(() => {
        renderAiButton(container);
      }, 1200);
      return;
    }

    let itemsToSolve = [...currentExtracted.items];
    if (saved && Array.isArray(saved.answers)) {
      itemsToSolve = itemsToSolve.map((it, idx) => ({
        ...it,
        answer: it.answer || saved.answers[idx] || null
      }));
    }
    const hasUnanswered = itemsToSolve.some((it) => !it.answer);

    if (hasUnanswered) {
      try {
        loadingBox.textContent = 'AI запрос ответов...';
        const domContext = getDomTaskContext(targetDoc);
        const combinedTaskText = [currentExtracted.taskTitle, domContext ? `Текст задания на экране:\n${domContext}` : '']
          .filter(Boolean)
          .join('\n\n');

        const payload: AiTaskPayload = {
          instruction: 'Реши задание.',
          task: formatTaskWithStats(combinedTaskText),
          kind: currentExtracted.kind,
          items: itemsToSolve.map((it, idx) => ({
            id: `Вопрос ${idx + 1}`,
            question: it.question,
            inputType: it.inputType,
            options: it.options
          }))
        };
        const solutionText = await solveTaskWithGigaChat(payload);
        if (isInsufficientInfoResponse(solutionText)) {
          saveTaskSolution(currentTaskId, solutionText, []);
          renderInsufficientInfo(container, solutionText);
          return;
        }
        itemsToSolve = itemsToSolve.map((it, idx) => {
          if (it.answer) {
            return it;
          }
          return {
            ...it,
            answer: parseAnswerFromAiResponse(solutionText, idx, it.options, itemsToSolve.length)
          };
        });
        saveTaskSolution(currentTaskId, solutionText, itemsToSolve.map((it) => it.answer));
      } catch (e) {
        console.debug(e);
        itemsToSolve = itemsToSolve.map((it) => ({
          ...it,
          answer: it.answer || null
        }));
      }
    }

    const hasAnyAnswer = itemsToSolve.some((it) => Boolean(it.answer));
    if (!hasAnyAnswer) {
      renderInsufficientInfo(container, 'Недостаточно информации для решения задания.');
      return;
    }

    loadingBox.textContent = 'Заполнение и отправка...';
    await solveActiveTask(itemsToSolve, targetDoc);
    lastSolvedTaskId = currentTaskId;

    broadcastToAllFrames(window, { type: 'UCHI_EXECUTE_AUTOSOLVE', items: itemsToSolve });

    let pollAttempts = 0;
    const pollTimer = setInterval(async () => {
      pollAttempts++;
      const advanced = (await clickNextButton(getTargetDocument())) || (await clickNextButton(document));
      if (advanced || pollAttempts >= 10) {
        clearInterval(pollTimer);
        renderAiButton(container);
      }
    }, 500);
  } catch (err) {
    console.error('[uchi.ru Helper] AutoSolve error:', err);
    renderAiButton(container);
  } finally {
    isSolvingNow = false;
  }
}

export function setupIframeWatcher(): void {
  setInterval(() => {
    const isAuto = typeof GM_getValue === 'function' ? Boolean(GM_getValue('UCHI_AUTO_MODE', true)) : true;
    if (!isAuto) {
      return;
    }
    void clickNextButton(document);

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button, div[role="button"]'));
    const submitBtn = buttons.find((b) => {
      const text = (b.textContent || '').trim().toLowerCase();
      const isDisabled = b.hasAttribute('disabled') || b.disabled;
      return text.includes('понятно') && !isDisabled;
    });
    if (submitBtn) {
      clickElement(submitBtn);
    }
  }, 1000);
}

function handleAiSolve(container: HTMLElement): void {
  if (!currentExtracted) {
    window.alert('Сначала дождитесь загрузки задания на странице');
    return;
  }

  const currentTaskId = getUniqueTaskId(currentExtracted);
  const saved = loadTaskSolution(currentTaskId);
  if (saved && isInsufficientInfoResponse(saved.solutionText)) {
    renderInsufficientInfo(container, saved.solutionText);
    return;
  }

  container.innerHTML = '';

  const loadingBox = document.createElement('div');
  loadingBox.style.cssText = `
    background: #f0f9ff !important;
    color: #0284c7 !important;
    border: 1px solid #bae6fd !important;
    padding: 8px 12px !important;
    border-radius: 8px !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    text-align: center !important;
  `;
  loadingBox.textContent = 'Решение...';
  container.appendChild(loadingBox);

  const targetDoc = getTargetDocument();
  const domContext = getDomTaskContext(targetDoc);
  const combinedTaskText = [currentExtracted.taskTitle, domContext ? `Текст задания на экране:\n${domContext}` : '']
    .filter(Boolean)
    .join('\n\n');

  const payload: AiTaskPayload = {
    instruction: 'Реши задание.',
    task: formatTaskWithStats(combinedTaskText),
    kind: currentExtracted.kind,
    items: currentExtracted.items.map((it, idx) => {
      const id = it.question.startsWith('Поле') || it.question.startsWith('Список') || it.question.startsWith('Позиция')
        ? it.question
        : `Вопрос ${idx + 1}`;
      return {
        id,
        question: it.question,
        inputType: it.inputType,
        options: it.options
      };
    })
  };

  solveTaskWithGigaChat(payload)
    .then((solutionText) => {
      const taskId = getUniqueTaskId(currentExtracted);
      if (isInsufficientInfoResponse(solutionText)) {
        if (taskId) {
          saveTaskSolution(taskId, solutionText, []);
        }
        renderInsufficientInfo(container, solutionText);
        return;
      }
      const computedAnswers = currentExtracted?.items.map((it, idx) =>
        it.answer || parseAnswerFromAiResponse(solutionText, idx, it.options, currentExtracted!.items.length)
      ) || [];
      if (taskId) {
        saveTaskSolution(taskId, solutionText, computedAnswers);
      }
      if (currentExtracted) {
        currentExtracted.items.forEach((it, idx) => {
          if (!it.answer && computedAnswers[idx]) {
            it.answer = computedAnswers[idx];
          }
        });
      }

      container.innerHTML = '';

      const solutionWrapper = document.createElement('div');
      solutionWrapper.style.cssText = `display: flex !important; flex-direction: column !important; gap: 6px !important;`;

      const headerRow = document.createElement('div');
      headerRow.style.cssText = `display: flex !important; justify-content: space-between !important; align-items: center !important;`;

      const title = document.createElement('span');
      title.style.cssText = `font-size: 12px !important; font-weight: 600 !important; color: #059669 !important;`;
      title.textContent = 'Ответ:';
      headerRow.appendChild(title);

      const retryBtn = document.createElement('button');
      retryBtn.textContent = '↺ Заново';
      retryBtn.style.cssText = `
        border: none !important;
        background: transparent !important;
        cursor: pointer !important;
        font-size: 11px !important;
        color: #64748b !important;
        padding: 0 !important;
      `;
      retryBtn.addEventListener('click', () => {
        try {
          const id = getUniqueTaskId(currentExtracted);
          if (typeof GM_setValue === 'function') {
            GM_setValue(getStorageKey(id), '');
          }
          localStorage.removeItem(getStorageKey(id));
        } catch (e) {
          console.debug(e);
        }
        renderAiButton(container);
      });
      headerRow.appendChild(retryBtn);

      solutionWrapper.appendChild(headerRow);

      const textBlock = document.createElement('div');
      textBlock.style.cssText = `
        background: #f8fafc !important;
        color: #0f172a !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        padding: 8px 10px !important;
        font-size: 12px !important;
        line-height: 1.45 !important;
        white-space: pre-wrap !important;
        max-height: 180px !important;
        overflow-y: auto !important;
        user-select: text !important;
      `;
      textBlock.textContent = solutionText;
      solutionWrapper.appendChild(textBlock);

      container.appendChild(solutionWrapper);
    })
    .catch((err) => {
      container.innerHTML = '';

      const errorWrapper = document.createElement('div');
      errorWrapper.style.cssText = `display: flex !important; flex-direction: column !important; gap: 6px !important;`;

      const errorBlock = document.createElement('div');
      errorBlock.style.cssText = `
        background: #fef2f2 !important;
        color: #dc2626 !important;
        border: 1px solid #fecaca !important;
        border-radius: 8px !important;
        padding: 8px 10px !important;
        font-size: 12px !important;
        line-height: 1.4 !important;
      `;
      errorBlock.textContent = `Ошибка: ${(err as Error).message}`;
      errorWrapper.appendChild(errorBlock);

      const retryBtn = document.createElement('button');
      retryBtn.textContent = 'Повторить';
      retryBtn.style.cssText = `
        width: 100% !important;
        background: #f1f5f9 !important;
        color: #334155 !important;
        border: 1px solid #cbd5e1 !important;
        padding: 6px 10px !important;
        border-radius: 6px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
      `;
      retryBtn.addEventListener('click', () => {
        renderAiButton(container);
      });
      errorWrapper.appendChild(retryBtn);

      container.appendChild(errorWrapper);
    });
}

export function updateAnswersPanel(extracted: ExtractedAnswer): void {
  const currentTaskId = getUniqueTaskId(extracted);
  const saved = loadTaskSolution(currentTaskId);
  if (saved && Array.isArray(saved.answers)) {
    extracted.items.forEach((it, idx) => {
      if (!it.answer && saved.answers[idx]) {
        it.answer = saved.answers[idx];
      }
    });
  }

  currentExtracted = extracted;
  if (window.self !== window.top) {
    return;
  }
  ensureAnswersPanel();

  const aiContainer = document.getElementById('tampermonkey-ai-action-container');
  if (aiContainer) {
    if (saved && isInsufficientInfoResponse(saved.solutionText)) {
      renderInsufficientInfo(aiContainer, saved.solutionText);
    } else {
      renderAiButton(aiContainer);
      const isAuto = typeof GM_getValue === 'function' ? Boolean(GM_getValue('UCHI_AUTO_MODE', true)) : true;
      if (isAuto && extracted.items.length > 0) {
        const currentTaskId = getUniqueTaskId(extracted);
        const now = Date.now();
        if (!lastSolvedTaskId || currentTaskId !== lastSolvedTaskId || (now - lastSolvedTime) > 6000) {
          setTimeout(() => {
            void handleAutoSolve(aiContainer);
          }, 800);
        }
      }
    }
  }

  const statusDot = document.getElementById('tampermonkey-panel-status');
  const content = document.getElementById('tampermonkey-answers-content');
  if (!content) {
    return;
  }

  content.innerHTML = '';

  if (extracted.taskTitle) {
    const taskHeader = document.createElement('div');
    taskHeader.style.cssText = `
      background: #f8fafc !important;
      padding: 9px 12px !important;
      border-radius: 8px !important;
      margin-bottom: 10px !important;
      font-weight: 500 !important;
      color: #334155 !important;
      font-size: 12px !important;
      border: 1px solid #e2e8f0 !important;
      line-height: 1.45 !important;
      white-space: pre-wrap !important;
    `;
    taskHeader.textContent = extracted.taskTitle.replace(/\\n/g, '\n');
    content.appendChild(taskHeader);
  }

  if (extracted.items.length === 0) {
    const onTask = isTaskPage();
    if (statusDot) {
      statusDot.textContent = onTask ? 'Без вариантов' : 'Готов';
      statusDot.style.color = onTask ? '#ef4444' : '#362f73';
      statusDot.style.background = onTask ? '#fef2f2' : '#ede9fe';
    }
    const msg = document.createElement('div');
    msg.textContent = onTask
      ? `Тип: ${extracted.kind}. Ответы и поля ввода в API не найдены.`
      : 'Helper готов к работе. Требуется открыть задание или домашнюю работу.';
    content.appendChild(msg);
    return;
  }

  const hasAnswers = extracted.items.some(i => i.answer !== null);

  if (statusDot) {
    if (hasAnswers) {
      statusDot.textContent = `${extracted.items.length} ответов`;
      statusDot.style.color = '#059669';
      statusDot.style.background = '#ecfdf5';
    } else {
      statusDot.textContent = extracted.kind;
      statusDot.style.color = '#0284c7';
      statusDot.style.background = '#f0f9ff';
    }
  }

  const list = document.createElement('div');
  list.style.cssText = `display: flex !important; flex-direction: column !important; gap: 8px !important; max-height: 320px !important; overflow-y: auto !important;`;

  extracted.items.forEach((field, idx) => {
    const block = document.createElement('div');
    block.style.cssText = `
      background: #f8fafc !important;
      padding: 8px 12px !important;
      border-radius: 8px !important;
      border: 1px solid #e2e8f0 !important;
    `;

    const qLabel = document.createElement('div');
    qLabel.style.cssText = `color: #64748b !important; font-size: 12px !important; margin-bottom: 4px !important; font-weight: 500 !important; white-space: pre-wrap !important;`;
    const qText = field.question.replace(/\\n/g, '\n');
    qLabel.textContent = field.question.startsWith('Поле') || field.question.startsWith('Позиция') || field.question.startsWith('Список')
      ? qText
      : `${idx + 1}. ${qText}`;
    block.appendChild(qLabel);

    if (field.answer !== null) {
      const ansRow = document.createElement('div');
      ansRow.style.cssText = `display: flex !important; justify-content: space-between !important; align-items: center !important;`;

      const ansVal = document.createElement('span');
      ansVal.style.cssText = `font-weight: 600 !important; color: #059669 !important; font-size: 13px !important;`;
      ansVal.textContent = field.answer;

      ansRow.appendChild(ansVal);
      block.appendChild(ansRow);
    } else if (field.options && field.options.length > 0) {
      const optsContainer = document.createElement('div');
      optsContainer.style.cssText = `margin-top: 4px !important; display: flex !important; flex-wrap: wrap !important; gap: 4px !important;`;

      field.options.forEach(opt => {
        const optEl = document.createElement('div');
        optEl.style.cssText = `
          color: #334155 !important;
          font-size: 12px !important;
          padding: 3px 8px !important;
          background: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 6px !important;
        `;
        optEl.textContent = opt;
        optsContainer.appendChild(optEl);
      });

      block.appendChild(optsContainer);
    } else if (field.inputType) {
      const typeBadge = document.createElement('div');
      typeBadge.style.cssText = `font-size: 11px !important; color: #0284c7 !important; margin-top: 2px !important; font-weight: 500 !important;`;
      typeBadge.textContent = `Тип поля: ${field.inputType}`;
      block.appendChild(typeBadge);
    }

    list.appendChild(block);
  });

  content.appendChild(list);
}
