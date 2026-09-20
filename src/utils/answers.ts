export type MechanicKind =
  | 'inputs'
  | 'dropdown'
  | 'variant'
  | 'variants_all'
  | 'single_choice'
  | 'multiple_choice'
  | 'matching'
  | 'sorting'
  | 'table'
  | 'unknown';

export interface ExtractedAnswer {
  kind: MechanicKind;
  taskTitle?: string;
  items: AnswerItem[];
}

export interface AnswerItem {
  question: string;
  answer: string | null;
  options?: string[];
  inputType?: string;
}

interface LessonTaskNode {
  id: string;
  generations?: Array<{
    id?: string | number;
    name?: string;
    title?: string;
    kind?: string;
    appearance?: string;
    data?: Record<string, unknown>;
    mechanics?: Array<{
      id?: string | number;
      kind?: string;
      appearance?: string;
      title?: string;
      data?: Record<string, unknown>;
    }>;
  }>;
}

// Намеренно без сброса при смене урока: uchi.ru перезагружает страницу при навигации
// между задачами, поэтому кэш живёт ровно столько, сколько нужно.
let cachedLessonTasks: LessonTaskNode[] | null = null;

export function cleanMathInElement(root: Element): void {
  const mathEls = Array.from(root.querySelectorAll('.katex, math'));
  for (const m of mathEls) {
    const ann = m.querySelector('annotation');
    let tex = ann ? ann.textContent || '' : m.textContent || '';
    if (tex) {
      tex = tex
        .replace(/(\d+)\s*\\(?:d)?frac(?:\s*\{([^}]+)\}|\s*([a-zA-Z0-9]))(?:\s*\{([^}]+)\}|\s*([a-zA-Z0-9]))/g, (_, intPart, n1, n2, d1, d2) => `${intPart} ${(n1 || n2)}/${(d1 || d2)}`)
        .replace(/\\(?:d)?frac(?:\s*\{([^}]+)\}|\s*([a-zA-Z0-9]))(?:\s*\{([^}]+)\}|\s*([a-zA-Z0-9]))/g, (_, n1, n2, d1, d2) => ` ${(n1 || n2)}/${(d1 || d2)} `)
        .replace(/\\sqrt(?:\s*\{([^}]+)\}|\s*([a-zA-Z0-9]))/g, (_, g1, g2) => `√${g1 || g2}`)
        .replace(/\\cdot/g, '*')
        .replace(/\\times/g, '*')
        .replace(/\\le\b/g, '<=')
        .replace(/\\ge\b/g, '>=')
        .replace(/\\neq\b/g, '!=')
        .replace(/\\pm\b/g, '±')
        .replace(/\\degree\b|\\circ\b/g, '°')
        .replace(/\\[a-zA-Z]+/g, ' ')
        .replace(/[{}]/g, '')
        .trim();
      const textNode = root.ownerDocument ? root.ownerDocument.createTextNode(' ' + tex + ' ') : document.createTextNode(' ' + tex + ' ');
      m.replaceWith(textNode);
    }
  }
}

export function cleanHtmlText(raw: string): string {
  if (!raw) {
    return '';
  }
  const temp = document.createElement('div');
  temp.innerHTML = raw;
  cleanMathInElement(temp);
  temp.querySelectorAll('style, script').forEach(el => {
    el.remove();
  });
  temp.querySelectorAll('br').forEach(el => {
    el.replaceWith('\n');
  });
  temp.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6').forEach(el => {
    el.prepend(' ');
    el.append(' ');
  });
  return (temp.textContent || temp.innerText || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractAnswers(payload: unknown): ExtractedAnswer {
  try {
    const root = payload as {
      data?: {
        tasks?: {
          nodes?: LessonTaskNode[];
        };
        job?: {
          name?: string;
        };
        generation?: {
          name?: string;
          title?: string;
          mechanics?: Array<{
            kind?: string;
            appearance?: string;
            title?: string;
            data?: Record<string, unknown>;
          }>;
          data?: Record<string, {
            kind?: string;
            appearance?: string;
            title?: string;
            data?: Record<string, unknown>;
            solution?: unknown;
          }>;
          solution?: unknown;
        };
      };
    };

    if (root?.data?.tasks?.nodes && Array.isArray(root.data.tasks.nodes)) {
      cachedLessonTasks = root.data.tasks.nodes;
      return extractCurrentLessonTask();
    }

    const gen = root?.data?.generation;
    const taskTitle = cleanHtmlText(gen?.name || gen?.title || root?.data?.job?.name || '');

    if (!gen) {
      return { kind: 'unknown', taskTitle, items: [] };
    }

    return extractFromGeneration(gen, taskTitle);
  } catch (e) {
    console.warn('[uchi.ru Helper] extractAnswers error:', e);
    return { kind: 'unknown', items: [] };
  }
}

export function extractCurrentLessonTask(): ExtractedAnswer {
  if (!cachedLessonTasks || cachedLessonTasks.length === 0) {
    return { kind: 'unknown', items: [] };
  }

  const urlParams = new URLSearchParams(window.location.search);
  const currentTaskId = urlParams.get('taskid');

  const activeNode = currentTaskId
    ? (cachedLessonTasks.find(n => n.id === currentTaskId) || cachedLessonTasks[0])
    : (cachedLessonTasks.find(n => window.location.pathname.includes(n.id)) || cachedLessonTasks[0]);

  const gen = activeNode.generations?.[0];
  if (!gen) {
    return { kind: 'unknown', items: [] };
  }

  const taskTitle = cleanHtmlText(gen.name || gen.title || '');
  return extractFromGeneration(gen, taskTitle);
}

export function setupTaskUrlWatcher(onTaskChange: (extracted: ExtractedAnswer) => void): () => void {
  let lastUrl = window.location.href;

  const check = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (cachedLessonTasks) {
        const extracted = extractCurrentLessonTask();
        onTaskChange(extracted);
      }
    }
  };

  window.addEventListener('popstate', check);
  window.addEventListener('hashchange', check);
  const interval = setInterval(check, 500);

  return () => {
    window.removeEventListener('popstate', check);
    window.removeEventListener('hashchange', check);
    clearInterval(interval);
  };
}

function extractFromGeneration(
  gen: {
    name?: string;
    title?: string;
    mechanics?: Array<{
      kind?: string;
      appearance?: string;
      title?: string;
      data?: Record<string, unknown>;
    }>;
    data?: Record<string, unknown>;
  },
  taskTitle: string
): ExtractedAnswer {
  const allItems: AnswerItem[] = [];
  let mainKind: MechanicKind = 'unknown';

  if (Array.isArray(gen.mechanics) && gen.mechanics.length > 0) {
    gen.mechanics.forEach(mech => {
      const k = (mech.kind || 'unknown') as MechanicKind;
      if (mainKind === 'unknown') {
        mainKind = k;
      }
      const data = mech.data || {};
      const res = processMechanicData(k, data, mech.appearance, mech.title);
      allItems.push(...res.items);
    });

    return {
      kind: mainKind,
      taskTitle,
      items: allItems
    };
  }

  const genData = gen.data;
  if (genData && typeof genData === 'object') {
    const firstBlock = Object.values(genData)[0] as { kind?: string; appearance?: string; title?: string; data?: Record<string, unknown> } | undefined;
    const k = (firstBlock?.kind || 'unknown') as MechanicKind;
    const data = firstBlock?.data || genData;
    const res = processMechanicData(k, data, firstBlock?.appearance, firstBlock?.title);
    const combinedTitle = [taskTitle, res.taskTitle].filter(Boolean).join('\n\n');
    res.taskTitle = combinedTitle || taskTitle;
    return res;
  }

  const genericRes = extractGeneric(gen as Record<string, unknown>, taskTitle);
  const combinedGenTitle = [taskTitle, genericRes.taskTitle].filter(Boolean).join('\n\n');
  genericRes.taskTitle = combinedGenTitle || taskTitle;
  return genericRes;
}

function processMechanicData(
  kind: MechanicKind,
  data: Record<string, unknown>,
  appearance?: string,
  title?: string
): ExtractedAnswer {
  if (kind === 'inputs' || data['inputs']) {
    return extractInputs(data['inputs'] ? (data['inputs'] as Record<string, unknown>) : data, title);
  }

  if (kind === 'dropdown' || data['dropdown']) {
    return extractDropdown(data['dropdown'] ? (data['dropdown'] as Record<string, unknown>) : data);
  }

  if (kind === 'variant' || kind === 'variants_all' || data['variants']) {
    return extractVariant(data, appearance, title);
  }

  if (kind === 'single_choice' || kind === 'multiple_choice' || data['choice'] || data['single_choice'] || data['multiple_choice']) {
    return extractChoice(data, kind);
  }

  if (kind === 'matching' || data['matching']) {
    return extractMatching(data['matching'] ? (data['matching'] as Record<string, unknown>) : data);
  }

  if (kind === 'sorting' || data['sorting']) {
    return extractSorting(data['sorting'] ? (data['sorting'] as Record<string, unknown>) : data);
  }

  if (kind === 'table' || data['table']) {
    return extractInputs(data['table'] ? (data['table'] as Record<string, unknown>) : data, title);
  }

  return extractGeneric(data, title || '');

}

function formatInputQuestion(
  rawQuestion: string,
  key: string,
  mechTitle?: string,
  setting?: { type?: string; simple?: boolean; prefix?: string; suffix?: string; label?: string; unit?: string }
): string {
  let q = cleanHtmlText(rawQuestion);
  const mTitle = cleanHtmlText(mechTitle || '');
  const prefix = cleanHtmlText(setting?.prefix || setting?.label || '');
  const suffix = cleanHtmlText(setting?.suffix || setting?.unit || '');

  const hasOnlyPlaceholders = !q || q.replace(/%\{.*?\}/g, '').trim().length === 0;

  if (hasOnlyPlaceholders) {
    if (mTitle) {
      q = mTitle;
    } else {
      q = `Поле %{${key}}`;
    }
  } else if (mTitle && !q.includes(mTitle) && !mTitle.includes(q)) {
    q = `${mTitle}: ${q}`;
  }

  if (prefix && !q.includes(prefix)) {
    q = `${q} ${prefix}`.trim();
  }
  if (suffix && !q.includes(suffix)) {
    q = `${q} ${suffix}`.trim();
  }

  q = q.replace(new RegExp(`%\\{${key}\\}`, 'g'), `[ Поле ${key} ]`);
  q = q.replace(/%\{.*?\}/g, '[ Поле ввода ]');

  return q.trim();
}

function extractInputs(data: Record<string, unknown>, title?: string): ExtractedAnswer {
  const inputsBlock = (data['inputs'] || data) as Record<string, {
    question?: string;
    answers?: Record<string, string | number>;
    settings?: Record<string, { type?: string; simple?: boolean; prefix?: string; suffix?: string; label?: string; unit?: string }>;
  }>;

  const items: AnswerItem[] = [];
  const mechTitle = title ? cleanHtmlText(title) : '';

  for (const inputKey of Object.keys(inputsBlock)) {
    const input = inputsBlock[inputKey];
    if (!input || typeof input !== 'object') {
      continue;
    }

    const answersObj = input.answers;
    const settings = input.settings;
    const rawQuestion = input.question || '';

    if (answersObj && typeof answersObj === 'object') {
      const keys = Object.keys(answersObj);
      const sortedKeys = (typeof rawQuestion === 'string')
        ? [...keys].sort((k1, k2) => {
            const i1 = rawQuestion.indexOf(`%{${k1}}`);
            const i2 = rawQuestion.indexOf(`%{${k2}}`);
            if (i1 === -1 && i2 === -1) {
              return k1.localeCompare(k2);
            }
            if (i1 === -1) {
              return 1;
            }
            if (i2 === -1) {
              return -1;
            }
            return i1 - i2;
          })
        : [...keys].sort();

      for (const key of sortedKeys) {
        const val = answersObj[key];
        const setting = settings?.[key];
        const fieldType = setting?.type || 'text';
        const formattedQuestion = formatInputQuestion(rawQuestion, key, mechTitle, setting);
        items.push({
          question: formattedQuestion,
          answer: val !== undefined ? String(val) : null,
          inputType: fieldType === 'number' || fieldType === 'numeric' ? 'Число' : 'Текст / Число'
        });
      }
    } else if (settings && typeof settings === 'object') {
      for (const key of Object.keys(settings)) {
        const setting = settings[key];
        const fieldType = setting?.type || 'text';
        const formattedQuestion = formatInputQuestion(rawQuestion, key, mechTitle, setting);
        items.push({
          question: formattedQuestion,
          answer: null,
          inputType: fieldType === 'number' || fieldType === 'numeric' ? 'Число' : 'Текст / Число'
        });
      }
    }
  }

  return { kind: 'inputs', items };
}

function extractDropdown(data: Record<string, unknown>): ExtractedAnswer {
  const dropdownBlock = (data['dropdown'] || data) as Record<string, {
    question?: string;
    answers?: Record<string, { type?: string; values?: string[] } | { values?: string[] }>;
  }>;

  const items: AnswerItem[] = [];
  let wholeQuestionText = '';

  for (const blockKey of Object.keys(dropdownBlock)) {
    const entry = dropdownBlock[blockKey];
    let rawQuestion = cleanHtmlText(entry?.question || '');
    const answersMap = entry?.answers;

    if (!answersMap || typeof answersMap !== 'object') {
      continue;
    }

    const answerKeys = Object.keys(answersMap);
    const sortedKeys = rawQuestion
      ? [...answerKeys].sort((k1, k2) => {
          const i1 = rawQuestion.indexOf(`%{${k1}}`);
          const i2 = rawQuestion.indexOf(`%{${k2}}`);
          if (i1 === -1 && i2 === -1) {
            return k1.localeCompare(k2);
          }
          if (i1 === -1) {
            return 1;
          }
          if (i2 === -1) {
            return -1;
          }
          return i1 - i2;
        })
      : [...answerKeys].sort();

    sortedKeys.forEach((key, idx) => {
      rawQuestion = rawQuestion.replace(new RegExp(`%\\{${key}\\}`, 'g'), `[ Список ${idx + 1} ]`);
    });

    if (!wholeQuestionText && rawQuestion) {
      wholeQuestionText = rawQuestion;
    }

    sortedKeys.forEach((key, idx) => {
      const answerVal = answersMap[key];
      const values = Array.isArray(answerVal?.values) ? answerVal.values : [];

      let contextLine = '';
      if (rawQuestion) {
        const lines = rawQuestion.split('\n');
        const found = lines.find((l) => l.includes(`[ Список ${idx + 1} ]`));
        if (found) {
          contextLine = found.trim();
        }
      }

      items.push({
        question: contextLine || `Список ${idx + 1} (%{${key}})`,
        answer: null,
        options: values.map((v) => cleanHtmlText(String(v))).filter(Boolean),
        inputType: 'Выпадающий список'
      });
    });
  }

  return {
    kind: 'dropdown',
    taskTitle: wholeQuestionText || undefined,
    items
  };
}

function extractVariant(data: Record<string, unknown>, appearance?: string, title?: string): ExtractedAnswer {
  const variantsBlock = (data['variants'] || data) as Record<string, {
    name?: string;
    value?: string;
    text?: string;
    correct?: boolean;
  }>;

  const options: string[] = [];
  let correctOption: string | null = null;

  for (const key of Object.keys(variantsBlock)) {
    const item = variantsBlock[key];
    if (!item || typeof item !== 'object') {
      continue;
    }
    const text = cleanHtmlText(item.name || item.value || item.text || '');
    if (text) {
      options.push(text);
      if (item.correct) {
        correctOption = text;
      }
    }
  }

  const isMulti = appearance === 'checkboxes';

  return {
    kind: 'variant',
    items: [
      {
        question: title ? cleanHtmlText(title) : 'Выбери вариант ответа',
        answer: correctOption,
        options,
        inputType: isMulti ? 'Выбор из вариантов' : 'Выбор одного варианта'
      }
    ]
  };
}

function extractChoice(data: Record<string, unknown>, kind: MechanicKind): ExtractedAnswer {
  const choiceData = (data['choice'] || data['single_choice'] || data['multiple_choice'] || data) as Record<string, unknown>;
  const items: AnswerItem[] = [];

  for (const key of Object.keys(choiceData)) {
    const item = choiceData[key] as {
      question?: string;
      options?: Array<{ id?: string | number; text?: string; correct?: boolean; value?: string }>;
      answers?: unknown;
    } | undefined;

    if (!item) {
      continue;
    }

    const qText = cleanHtmlText(item.question || '') || `Вопрос ${key}`;
    const correctOptions: string[] = [];
    const allOptions: string[] = [];

    if (Array.isArray(item.options)) {
      item.options.forEach(opt => {
        const text = cleanHtmlText(opt.text || opt.value || String(opt.id || ''));
        if (text) {
          allOptions.push(text);
        }
        if (opt.correct) {
          correctOptions.push(text);
        }
      });
    }

    items.push({
      question: qText,
      answer: correctOptions.length > 0 ? correctOptions.join(', ') : null,
      options: allOptions.length > 0 ? allOptions : undefined,
      inputType: kind === 'multiple_choice' ? 'Чекбоксы (несколько вариантов)' : 'Радиокнопки (один вариант)'
    });
  }

  return { kind: kind === 'multiple_choice' ? 'multiple_choice' : 'single_choice', items };
}

function extractMatching(data: Record<string, unknown>): ExtractedAnswer {
  const items: AnswerItem[] = [];
  const pairs = (data['pairs'] || data['matches'] || data) as Record<string, string>;

  for (const key of Object.keys(pairs)) {
    const val = pairs[key];
    if (typeof val === 'string' || typeof val === 'number') {
      items.push({
        question: cleanHtmlText(key),
        answer: String(val),
        inputType: 'Сопоставление'
      });
    }
  }

  return { kind: 'matching', items };
}

function extractSorting(data: Record<string, unknown>): ExtractedAnswer {
  const items: AnswerItem[] = [];
  const order = (data['order'] || data['answers'] || data['items']) as unknown[];

  if (Array.isArray(order)) {
    order.forEach((val, idx) => {
      items.push({
        question: `Позиция ${idx + 1}`,
        answer: String(val),
        inputType: 'Сортировка'
      });
    });
  }

  return { kind: 'sorting', items };
}

function extractGeneric(gen: Record<string, unknown>, defaultQuestion: string): ExtractedAnswer {
  const items: AnswerItem[] = [];

  function search(obj: unknown, depth = 0): void {
    if (!obj || typeof obj !== 'object' || depth > 5) {
      return;
    }
    const record = obj as Record<string, unknown>;

    if (record['answers'] && typeof record['answers'] === 'object') {
      const ans = record['answers'] as Record<string, unknown>;
      for (const k of Object.keys(ans)) {
        const v = ans[k];
        if (typeof v === 'string' || typeof v === 'number') {
          items.push({ question: cleanHtmlText(k), answer: String(v) });
        }
      }
    }

    if (Array.isArray(record['options']) || Array.isArray(record['values']) || (record['variants'] && typeof record['variants'] === 'object')) {
      const variantsObj = record['variants'] as Record<string, { name?: string; value?: string; text?: string }> | undefined;
      const opts: string[] = variantsObj
        ? Object.values(variantsObj).map(v => cleanHtmlText(v.name || v.value || v.text || '')).filter(Boolean)
        : ((record['options'] || record['values']) as unknown[]).map(o => typeof o === 'string' ? cleanHtmlText(o) : cleanHtmlText(JSON.stringify(o))).filter(Boolean);

      if (opts.length > 0 && !items.some(i => i.options)) {
        items.push({
          question: defaultQuestion || 'Варианты ответа',
          answer: null,
          options: opts,
          inputType: 'Выбор из списка'
        });
      }
    }

    for (const k of Object.keys(record)) {
      if (k !== 'answers' && typeof record[k] === 'object') {
        search(record[k], depth + 1);
      }
    }
  }

  search(gen);

  if (items.length === 0 && defaultQuestion) {
    items.push({
      question: defaultQuestion,
      answer: null,
      inputType: 'Поле ввода / Интерактивный элемент'
    });
  }

  return { kind: 'unknown', items };
}
