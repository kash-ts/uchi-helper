export function createAssistantButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = 'Решить задание';
  btn.id = 'tampermonkey-solver-btn';
  btn.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 10000;
    padding: 10px 18px;
    border: none;
    border-radius: 6px;
    background: #4CAF50;
    color: white;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    transition: background 0.2s;
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#43A047';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#4CAF50';
  });

  btn.addEventListener('click', onClick);
  return btn;
}

export function mountAssistantButton(onClick: () => void): void {
  const mount = () => {
    if (!document.getElementById('tampermonkey-solver-btn')) {
      const btn = createAssistantButton(onClick);
      document.body.appendChild(btn);
    }
  };

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
}
