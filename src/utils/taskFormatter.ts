export function extractMessageCandidates(text: string): string[] {
  const results: string[] = [];
  const guillemets = /[«""]([^»""]{3,})[»""]/g;
  let m: RegExpExecArray | null;
  while ((m = guillemets.exec(text)) !== null) {
    results.push(m[1]);
  }
  if (results.length > 0) {
    return results;
  }
  const speechTrigger = /(?:написал[аи]?|отправил[аи]?|сказал[аи]?|напечатал[аи]?)[^.!?]*[.,]\s*(.+?)(?:\s*(?:Мощность|Использу|Алфавит|Кодиров|Длина|Символов|Размер)[^\n]*)?$/i;
  const match = speechTrigger.exec(text);
  if (match) {
    results.push(match[1].trim());
  }
  return results;
}

export function formatTaskWithStats(taskText: string): string {
  if (!taskText) {
    return 'Реши задание';
  }
  const candidates = extractMessageCandidates(taskText);
  if (candidates.length > 0) {
    const stats = candidates.map(s => `«${s}» (длина: ${s.length} симв. с пробелами)`);
    return `${taskText}\n\n[Справочные данные JS — длина ТОЛЬКО самого сообщения: ${stats.join('; ')}]`;
  }
  return taskText;
}
