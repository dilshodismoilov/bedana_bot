export const money = (n: number) => `${n.toLocaleString('en-US').replaceAll(',', ' ')} so'm`;

const pad = (n: number) => String(n).padStart(2, '0');

/** 17.11 14:30, or 17.11.2025 14:30 for other years. Manual because uz locale support varies across webviews. */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : `.${d.getFullYear()}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}${year} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
