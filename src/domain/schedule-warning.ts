import type { Cycle, Data } from './model';

export function scheduleWarning(data: Data, cycle: Cycle, warning: { slotId: string; message: string }): string {
  const slot = cycle.slots.find((item) => item.id === warning.slotId);
  const club = data.clubs.find((item) => item.id === slot?.clubId);
  let message = warning.message;
  for (const kit of data.kits) {
    message = message.replaceAll(`Kit ${kit.id} `, `Kit ${kit.barcode} `).replaceAll(`kit ${kit.id} `, `kit ${kit.barcode} `);
  }
  for (const value of data.clubs) message = message.replaceAll(`Club ${value.id} `, `${value.name} `);
  for (const title of data.titles) message = message.replaceAll(`title ${title.id}.`, `"${title.name}".`).replaceAll(`title ${title.id} `, `"${title.name}" `);
  for (const value of data.cycles) {
    message = message.replaceAll(`cycle ${value.id},`, `cycle ${value.name},`);
    for (const item of value.slots) {
      const name = data.clubs.find((entry) => entry.id === item.clubId)?.name ?? item.clubId;
      message = message.replaceAll(`slot ${item.id} `, `meeting ${name} · ${item.month} `);
    }
  }
  return `${club?.name ?? 'Unknown club'} · ${slot?.month ?? warning.slotId}: ${message}`;
}
