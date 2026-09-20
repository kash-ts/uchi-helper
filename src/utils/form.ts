export function setReactInputValue(element: HTMLInputElement, value: string): void {
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
}

export function fillVisibleInputs(answers: string[]): number {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input:not([type])'
    )
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled;
  });

  let filledCount = 0;
  for (let i = 0; i < Math.min(inputs.length, answers.length); i++) {
    setReactInputValue(inputs[i], answers[i]);
    filledCount++;
  }

  return filledCount;
}

export function clickSubmitButton(): boolean {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  const submitBtn = buttons.find((btn) => {
    const text = btn.textContent?.trim().toLowerCase();
    return text.includes('готово') || text.includes('ответить');
  });

  if (submitBtn && !submitBtn.disabled) {
    submitBtn.click();
    return true;
  }

  return false;
}
