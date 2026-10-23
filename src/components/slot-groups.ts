// Separa os horários do dia em manhã, tarde e noite (lista longa fica mais fácil de ler no celular).
export function groupTimes(times: string[]): [string, string[]][] {
  const groups: [string, string[]][] = [
    ['Manhã', times.filter((t) => t < '12:00')],
    ['Tarde', times.filter((t) => t >= '12:00' && t < '18:00')],
    ['Noite', times.filter((t) => t >= '18:00')],
  ];
  return groups.filter(([, l]) => l.length > 0);
}
