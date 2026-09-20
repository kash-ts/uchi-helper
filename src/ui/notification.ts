import type { MessageType } from '../types';

export function showMessage(text: string, type: MessageType = 'success'): void {
  const existing = document.getElementById('tampermonkey-message');
  if (existing) {
    existing.remove();
  }

  const msg = document.createElement('div');
  msg.id = 'tampermonkey-message';
  msg.style.cssText = `
    position: fixed;
    top: 15px;
    right: 15px;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 10001;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    background: ${type === 'error' ? '#f44336' : '#4CAF50'};
    color: white;
  `;

  const span = document.createElement('span');
  span.className = 'uchi-message-text';
  span.textContent = text;
  msg.appendChild(span);

  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 3000);
}
