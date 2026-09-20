import type { AnswerItem } from './answers';

export function getTargetDocument(rootDoc: Document = document): Document {
  const iframes = Array.from(rootDoc.querySelectorAll('iframe'));
  for (const ifr of iframes) {
    try {
      if (ifr.contentDocument && ifr.contentDocument.body) {
        return getTargetDocument(ifr.contentDocument);
      }
    } catch (e) {
      console.debug(e);
    }
  }
  return rootDoc;
}

export function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  try {
    element.focus();
  } catch (e) {
    console.debug(e);
  }
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
  try {
    element.blur();
  } catch (e) {
    console.debug(e);
  }
}

export function clickElement(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  } catch (e) {
    console.debug(e);
  }

  const win = el.ownerDocument?.defaultView || window;
  const MouseEvt = win.MouseEvent || MouseEvent;
  const PointerEvt = win.PointerEvent || PointerEvent;

  try {
    el.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, cancelable: true }));
    el.click();
  } catch (e) {
    console.debug(e);
  }

  const isButton = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
  const isDisabled = el.hasAttribute('disabled') || (el as HTMLButtonElement).disabled;

  if (isDisabled || !isButton) {
    try {
      const reactKey = Object.keys(el).find(
        (k) => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber') || k.startsWith('__reactEventHandlers') || k.startsWith('__reactProps')
      );
      let curr = reactKey ? ((el as unknown as Record<string, unknown>)[reactKey] as Record<string, unknown> | null) : null;
      while (curr) {
        const props = (curr.memoizedProps || curr) as { onClick?: (e: unknown) => void } | undefined;
        if (typeof props?.onClick === 'function') {
          props.onClick({
            preventDefault: () => {},
            stopPropagation: () => {},
            target: el,
            currentTarget: el
          });
          break;
        }
        curr = (curr.return as Record<string, unknown> | null) || null;
      }
    } catch (e) {
      console.debug(e);
    }
  }
}

export function fillInputs(doc: Document, answers: string[]): number {
  const inputs = Array.from(
    doc.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="number"], input:not([type])')
  ).filter((el) => {
    const style = doc.defaultView?.getComputedStyle(el);
    return style && style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled;
  });

  let filled = 0;
  for (let i = 0; i < Math.min(inputs.length, answers.length); i++) {
    const ans = answers[i];
    if (ans !== null && ans !== undefined) {
      if (!inputs[i].readOnly) {
        setNativeInputValue(inputs[i], ans);
        filled++;
      }
    }
  }
  return filled;
}

export function selectChoices(doc: Document, answers: string[]): number {
  let selected = 0;
  const clickables = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'button, label, [role="button"], [role="radio"], [role="checkbox"], div[class*="variant"], div[class*="choice"], div[class*="item"], div[class*="option"], div[class*="pRSgm"]'
    )
  );

  const flatAnswers = answers
    .flatMap((a) => a.split(/[,|\n]/))
    .map((s) => s.trim().toLowerCase().replace(/[−–—]/g, '-').replace(/\s+/g, ''))
    .filter(Boolean);

  function getMathTokens(el: HTMLElement) {
    const rawAnn = el.querySelector('annotation')?.textContent || '';
    const ann = rawAnn
      .trim()
      .toLowerCase()
      .replace(/[−–—]/g, '-')
      .replace(/\\(?:d)?frac(?:\s*\{([^}]+)\}|\s*([a-zA-Z0-9]))(?:\s*\{([^}]+)\}|\s*([a-zA-Z0-9]))/g, (_, n1, n2, d1, d2) => `${n1 || n2}/${d1 || d2}`)
      .replace(/\\sqrt(?:\s*\{([^}]+)\}|\s*([a-zA-Z0-9]))/g, (_, g1, g2) => `√${g1 || g2}`)
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, '');

    const text = (el.textContent || '').trim().toLowerCase().replace(/[−–—]/g, '-').replace(/\s+/g, '');
    return { ann, text };
  }

  for (const el of clickables) {
    const isSelected =
      el.className.includes('cTENcL') ||
      el.className.includes('selected') ||
      el.className.includes('active') ||
      el.getAttribute('aria-checked') === 'true' ||
      Boolean(el.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked);

    if (isSelected) {
      const { ann, text } = getMathTokens(el);
      const isTarget = flatAnswers.some((ans) => (ann && ann === ans) || text === ans || text.replace(/^[a-zа-я0-9][.)]/i, '') === ans);
      if (!isTarget) {
        clickElement(el);
      }
    }
  }

  for (const ans of flatAnswers) {
    let match = clickables.find((el) => {
      const { ann, text } = getMathTokens(el);
      return (ann && ann === ans) || text === ans;
    });

    if (!match) {
      match = clickables.find((el) => {
        const { ann, text } = getMathTokens(el);
        const strippedText = text.replace(/^[a-zа-я0-9][.)]/i, '');
        const strippedAnn = ann ? ann.replace(/^[a-zа-я0-9][.)]/i, '') : '';
        return strippedText === ans || (Boolean(strippedAnn) && strippedAnn === ans);
      });
    }

    if (!match) {
      match = clickables.find((el) => {
        const { ann, text } = getMathTokens(el);
        const candidate = ann || text;
        if (!candidate) {
          return false;
        }
        const ansHasMinus = ans.startsWith('-');
        if (ansHasMinus) {
          if (!candidate.includes('-')) {
            return false;
          }
          return candidate.includes(ans);
        } else {
          const idx = candidate.indexOf(ans);
          if (idx > 0 && candidate[idx - 1] === '-') {
            return false;
          }
          if (idx === 0 && candidate.startsWith('-')) {
            return false;
          }
          return idx !== -1;
        }
      });
    }

    if (match) {
      const isAlreadySelected =
        match.className.includes('cTENcL') ||
        match.className.includes('selected') ||
        match.className.includes('active') ||
        match.getAttribute('aria-checked') === 'true' ||
        Boolean(match.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked);

      if (!isAlreadySelected) {
        clickElement(match);
        selected++;
      } else {
        selected++;
      }
    }
  }
  return selected;
}

export async function selectDropdowns(doc: Document, answers: string[]): Promise<number> {
  let selected = 0;

  function getTriggers(): HTMLElement[] {
    let triggers: HTMLElement[] = [];
    const arrows = Array.from(doc.querySelectorAll<HTMLElement>('[data-component="Select/Arrow"]'));
    if (arrows.length > 0) {
      triggers = arrows.map((a) => (a.parentElement || a) as HTMLElement);
    }

    if (triggers.length === 0) {
      triggers = Array.from(
        doc.querySelectorAll<HTMLElement>(
          '[data-component*="Select"], button[class*="dropdown"], div[class*="dropdown"], div[class*="select"], [role="combobox"]'
        )
      );
    }

    if (triggers.length === 0) {
      triggers = Array.from(doc.querySelectorAll<HTMLElement>('*'))
        .filter((el) => el.children.length === 0 && (el.textContent || '').trim() === 'Выбери ответ')
        .map((el) => (el.parentElement || el) as HTMLElement);
    }

    return Array.from(new Set(triggers)).filter((t, idx, arr) => {
      return !arr.some((other, oIdx) => oIdx !== idx && other.contains(t));
    });
  }

  for (let i = 0; i < answers.length; i++) {
    const ans = answers[i];
    if (!ans) {
      continue;
    }

    const currentTriggers = getTriggers();
    if (i >= currentTriggers.length) {
      break;
    }

    const trigger = currentTriggers[i];
    clickElement(trigger);
    await new Promise((resolve) => setTimeout(resolve, 350));

    const selectContainer =
      trigger.closest<HTMLElement>('[data-component="Select"]') ||
      trigger.parentElement ||
      doc;

    let options = Array.from(
      selectContainer.querySelectorAll<HTMLElement>(
        '[data-component="Select/Option"], [role="option"], div[class*="option"], li[class*="option"], div[class*="item"]'
      )
    );

    if (options.length === 0) {
      options = Array.from(
        doc.querySelectorAll<HTMLElement>(
          '[data-component="Select/Option"], [role="option"], div[class*="option"], li[class*="option"], div[class*="item"]'
        )
      );
    }

    const cleanAns = ans.trim().toLowerCase();
    const normCleanAns = cleanAns.replace(/[−–—]/g, '-').replace(/\s+/g, '');
    const optMatch = options.find((o) => {
      const text = (o.textContent || '').trim().toLowerCase();
      const normText = text.replace(/[−–—]/g, '-').replace(/\s+/g, '');
      if (normText === normCleanAns) {
        return true;
      }
      if (normCleanAns === '>' && (normText === '&gt;' || normText === '>')) {
        return true;
      }
      if (normCleanAns === '<' && (normText === '&lt;' || normText === '<')) {
        return true;
      }
      if (normCleanAns === '=' && normText === '=') {
        return true;
      }
      return false;
    });

    if (optMatch) {
      clickElement(optMatch);
      selected++;
      await new Promise((resolve) => setTimeout(resolve, 350));
    } else {
      clickElement(trigger);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return selected;
}

export async function submitTask(doc: Document): Promise<boolean> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const buttons = Array.from(doc.querySelectorAll<HTMLElement>('button, div[role="button"], a'));
    const submitBtn = buttons.find((b) => {
      const text = (b.textContent || '').trim().toLowerCase();
      return (
        text.includes('готово') ||
        text.includes('ответить') ||
        text.includes('понятно') ||
        text.includes('проверить')
      );
    });

    if (submitBtn) {
      const isDisabled = submitBtn.hasAttribute('disabled') || (submitBtn as HTMLButtonElement).disabled;
      if (!isDisabled) {
        clickElement(submitBtn);
        return true;
      }

      const reactKey = Object.keys(submitBtn).find(
        (k) => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber')
      );
      let curr = reactKey
        ? ((submitBtn as unknown as Record<string, unknown>)[reactKey] as Record<string, unknown>)
        : null;
      while (curr) {
        const props = curr.memoizedProps as { onClick?: (e: unknown) => void } | undefined;
        if (typeof props?.onClick === 'function') {
          try {
            props.onClick({
              preventDefault: () => {},
              stopPropagation: () => {},
              target: submitBtn,
              currentTarget: submitBtn
            });
            return true;
          } catch (e) {
            console.debug(e);
          }
        }
        curr = curr.return as Record<string, unknown> | null;
      }

      clickElement(submitBtn);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return false;
}

export async function clickNextButton(doc: Document): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const cancelFinishBtn = Array.from(doc.querySelectorAll<HTMLElement>('button, div[role="button"]')).find((b) => {
      const t = (b.textContent || '').trim().toLowerCase();
      const isDisabled = b.hasAttribute('disabled') || (b as HTMLButtonElement).disabled;
      return !isDisabled && (t === 'выполнить' || t === 'исправить');
    });
    if (cancelFinishBtn) {
      clickElement(cancelFinishBtn);
      return true;
    }

    const skipModalBtn = Array.from(doc.querySelectorAll<HTMLElement>('button, div[role="button"], a')).find((b) => {
      const t = (b.textContent || '').trim().toLowerCase();
      const isDisabled = b.hasAttribute('disabled') || (b as HTMLButtonElement).disabled;
      return !isDisabled && t.includes('все равно пропустить');
    });
    if (skipModalBtn) {
      clickElement(skipModalBtn);
      return true;
    }

    const buttons = Array.from(doc.querySelectorAll<HTMLElement>('button, div[role="button"], a'));

    const safeButtons = buttons.filter((b) => {
      const isDisabled = b.hasAttribute('disabled') || (b as HTMLButtonElement).disabled;
      if (isDisabled) {
        return false;
      }
      const href = b.getAttribute('href') || '';
      if (
        href.includes('/profile') ||
        href.includes('/student') ||
        href.includes('/b2t') ||
        href.includes('/chat') ||
        href.includes('/teachers') ||
        href.includes('payments') ||
        href.includes('get_premium') ||
        href.startsWith('http')
      ) {
        return false;
      }
      const cls = (b.className || '').toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const text = (b.textContent || '').trim().toLowerCase();
      if (
        cls.includes('close') ||
        cls.includes('exit') ||
        cls.includes('back') ||
        cls.includes('sound') ||
        cls.includes('audio') ||
        cls.includes('avatar') ||
        cls.includes('profile') ||
        cls.includes('logo') ||
        aria.includes('закрыть') ||
        aria.includes('назад') ||
        aria.includes('выход') ||
        aria.includes('купить') ||
        text.includes('завершить') ||
        text.includes('назад') ||
        text.includes('пополнить') ||
        text.includes('полный доступ')
      ) {
        return false;
      }
      if (b.closest('header, nav, [class*="Header"], [class*="header"]')) {
        return false;
      }
      return true;
    });

    let nextBtn = safeButtons.find((b) => {
      const text = (b.textContent || '').trim().toLowerCase();
      return (
        text === 'дальше' ||
        text === 'следующее' ||
        text === 'следующее задание' ||
        text === 'продолжить' ||
        text === 'вперёд' ||
        text === '>' ||
        text === '→' ||
        text.includes('дальш') ||
        text.includes('продолж') ||
        text.includes('следующ') ||
        text.includes('вперёд')
      );
    });

    if (!nextBtn) {
      nextBtn = safeButtons.find((b) => {
        const pathD = b.querySelector('path')?.getAttribute('d') || '';
        return pathD.includes('M1 1L7 7L1 13') || pathD.includes('M1 1L7 7');
      });
    }

    if (!nextBtn) {
      nextBtn = safeButtons.find((b) => {
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return (
          aria.includes('дальше') ||
          aria.includes('следующ') ||
          aria.includes('вперед') ||
          aria.includes('next')
        );
      });
    }

    if (nextBtn) {
      clickElement(nextBtn);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

export async function solveActiveTask(items: AnswerItem[], doc: Document = getTargetDocument()): Promise<boolean> {
  const validItems = items.filter((it) => it.answer !== null && it.answer !== undefined && it.answer !== '');
  const validAnswers = validItems.map((it) => it.answer as string);

  const inputAnswers = validItems
    .filter((it) => {
      const type = (it.inputType || '').toLowerCase();
      const hasOpts = Array.isArray(it.options) && it.options.length > 0;
      return type.includes('числ') || type.includes('текст') || type.includes('ввод') || (!hasOpts && !type.includes('выбор'));
    })
    .map((it) => it.answer as string);

  const choiceAnswers = validItems
    .filter((it) => {
      const type = (it.inputType || '').toLowerCase();
      const hasOpts = Array.isArray(it.options) && it.options.length > 0;
      return type.includes('выбор') || type.includes('чекбокс') || type.includes('радио') || hasOpts;
    })
    .map((it) => it.answer as string);

  const dropdownAnswers = validItems
    .filter((it) => {
      const type = (it.inputType || '').toLowerCase();
      return type.includes('выпадающ') || type.includes('списк');
    })
    .map((it) => it.answer as string);

  let filled = 0;
  filled += fillInputs(doc, inputAnswers.length > 0 ? inputAnswers : validAnswers);
  filled += selectChoices(doc, choiceAnswers.length > 0 ? choiceAnswers : validAnswers);
  filled += await selectDropdowns(doc, dropdownAnswers.length > 0 ? dropdownAnswers : validAnswers);

  if (filled === 0 && validAnswers.length === 0) {
    return await submitTask(doc);
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
  const submitted = await submitTask(doc);

  if (submitted) {
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const advanced =
        (await clickNextButton(doc)) ||
        (await clickNextButton(getTargetDocument())) ||
        (await clickNextButton(document));
      if (advanced) {
        break;
      }
    }
  }

  return submitted;
}

export function hasTaskVisuals(doc: Document): boolean {
  const images = Array.from(doc.querySelectorAll<HTMLImageElement>('img')).filter((img) => {
    const src = (img.src || '').toLowerCase();
    const cls = (img.className || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    if (cls.includes('avatar') || cls.includes('logo') || cls.includes('icon') || cls.includes('sound') || cls.includes('audio') || cls.includes('play')) {
      return false;
    }
    if (src.includes('avatar') || src.includes('logo') || src.includes('icon') || src.includes('sound') || src.includes('audio') || src.includes('play')) {
      return false;
    }
    if (alt.includes('avatar') || alt.includes('logo') || alt.includes('sound')) {
      return false;
    }
    const rect = img.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40;
  });

  if (images.length > 0) {
    return true;
  }

  const canvases = Array.from(doc.querySelectorAll<HTMLCanvasElement>('canvas')).filter((c) => {
    const rect = c.getBoundingClientRect();
    return rect.width > 50 && rect.height > 50;
  });

  if (canvases.length > 0) {
    return true;
  }

  const svgs = Array.from(doc.querySelectorAll<SVGSVGElement>('svg')).filter((s) => {
    if (s.closest('button, [role="button"], a, nav, [class*="stepper"], [class*="header"]')) {
      return false;
    }
    const cls = (s.getAttribute('class') || '').toLowerCase();
    if (cls.includes('icon') || cls.includes('sound') || cls.includes('arrow') || cls.includes('close') || cls.includes('play')) {
      return false;
    }
    const rect = s.getBoundingClientRect();
    if (rect.width > 120 && rect.height > 120) {
      return true;
    }
    return (
      cls.includes('graph') ||
      cls.includes('chart') ||
      cls.includes('plot') ||
      cls.includes('coordinate') ||
      cls.includes('grid') ||
      Boolean(s.querySelector('polyline, polygon, line[x1]'))
    );
  });

  return svgs.length > 0;
}

export function skipToNextStepperItem(rootDoc: Document = document): boolean {
  const allDocs = [rootDoc, getTargetDocument(), document];
  for (const doc of allDocs) {
    const listItems = Array.from(doc.querySelectorAll<HTMLElement>('li, div[class*="stepper"] > *, [role="tab"]'));
    const stepItems = listItems.filter((el) => {
      const num = parseInt(el.textContent?.trim() || '', 10);
      return !isNaN(num) && num >= 1 && num <= 50;
    });

    if (stepItems.length > 1) {
      let currentIndex = stepItems.findIndex((el) => {
        const cls = (el.className || '').toLowerCase();
        const ariaCurrent = el.getAttribute('aria-current');
        const ariaSelected = el.getAttribute('aria-selected');
        return (
          ariaCurrent === 'true' ||
          ariaCurrent === 'step' ||
          ariaSelected === 'true' ||
          cls.includes('current') ||
          cls.includes('active') ||
          cls.includes('selected')
        );
      });

      if (currentIndex === -1) {
        currentIndex = stepItems.findIndex((el) => {
          const compStyle = doc.defaultView?.getComputedStyle(el);
          return compStyle && compStyle.borderWidth && compStyle.borderWidth !== '0px';
        });
      }

      const nextTargetIndex = currentIndex >= 0 && currentIndex < stepItems.length - 1 ? currentIndex + 1 : -1;
      if (nextTargetIndex >= 0) {
        const targetEl = stepItems[nextTargetIndex];
        clickElement(targetEl);
        setTimeout(() => {
          for (const d of allDocs) {
            const skipBtn = Array.from(d.querySelectorAll<HTMLElement>('button, div[role="button"], a')).find((b) => {
              const t = (b.textContent || '').trim().toLowerCase();
              const isDisabled = b.hasAttribute('disabled') || (b as HTMLButtonElement).disabled;
              return !isDisabled && (t.includes('пропустить') || t.includes('все равно'));
            });
            if (skipBtn) {
              clickElement(skipBtn);
            }
          }
        }, 500);
        return true;
      }

      if (currentIndex === stepItems.length - 1) {
        for (const d of allDocs) {
          const finishBtn = Array.from(d.querySelectorAll<HTMLElement>('button, a, span, div[role="button"]')).find((b) => {
            const t = (b.textContent || '').trim().toLowerCase();
            return t === 'завершить выполнение' || t === 'завершить';
          });
          if (finishBtn) {
            clickElement(finishBtn);
            return true;
          }
        }
      }
    }
  }

  return false;
}

export function dismissPopups(rootDoc: Document = document): boolean {
  let dismissed = false;
  const allDocs = [rootDoc, getTargetDocument(), document];
  for (const d of allDocs) {
    const closeBtns = Array.from(
      d.querySelectorAll<HTMLElement>(
        'button._close_hfwiv_12, button[class*="_close_"], button[class*="closeBtn"], button[class*="Close"], [aria-label*="закры" i], [aria-label*="close" i]'
      )
    );
    for (const btn of closeBtns) {
      if (btn.offsetWidth > 0 && btn.offsetHeight > 0) {
        clickElement(btn);
        dismissed = true;
      }
    }
  }
  return dismissed;
}

