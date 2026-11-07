// Notification ntfy du rappel mensurations, lancée chaque heure par .github/workflows/rappel.yml.
// Envoie au plus une notification par jour, le jour de la semaine choisi, à partir de l'heure choisie (heure de Paris),
// tant que les mensurations ne sont pas à jour. Réglage : reminders.json (écrit par l'appli iPhone).
// Le sujet ntfy est le secret NTFY_TOPIC du dépôt. DRY_RUN=1 : n'envoie rien (tests).
const fs = require('fs');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// Copie de reminderStatus (muscu-app/reminder.js) : garder les deux identiques.
const REMINDER_DEFAULT = { on: true, weeks: 2, day: 0, measures: ['waist', 'chest', 'biceps', 'thigh'], notifyHour: 8 };
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function reminderStatus(body, r, todayStr) {
  r = { ...REMINDER_DEFAULT, ...(r || {}) };
  const keys = r.measures && r.measures.length ? r.measures : REMINDER_DEFAULT.measures;
  const dates = Object.values(body || {}).filter(b => b && !b.deleted && keys.some(k => b[k] != null)).map(b => b.date).sort();
  const last = dates[dates.length - 1] || null;
  let due = todayStr;
  if (last) {
    const d = parse(last); d.setDate(d.getDate() + r.weeks * 7);
    while (d.getDay() !== r.day) d.setDate(d.getDate() + 1);
    due = fmt(d);
  }
  const daysSince = last ? Math.round((parse(todayStr) - parse(last)) / 864e5) : null;
  return { on: !!r.on, last, due, isDue: !!r.on && todayStr >= due, daysSince };
}

async function main() {
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(x => [x.type, x.value]));
  const todayStr = `${p.year}-${p.month}-${p.day}`, hour = Number(p.hour);
  const r = { ...REMINDER_DEFAULT, ...(readJson('reminders.json', {}).mensurations || {}) };
  const state = readJson('notify-state.json', {});
  const s = reminderStatus(readJson('data.json', {}).body, r, todayStr);
  // Rien avant la toute première mesure (comme l'appli : c'est sa carte « Bien démarrer » qui y invite),
  // ni sans sujet ntfy réglé (secret NTFY_TOPIC facultatif : sans lui, l'automate ne fait rien, sans erreur).
  const why = !process.env.NTFY_TOPIC && !process.env.DRY_RUN ? 'pas de sujet ntfy réglé (secret NTFY_TOPIC)'
    : !s.last ? 'aucune mensuration enregistrée pour l\'instant'
    : !s.isDue ? `pas encore dû (prochain : ${s.due})`
    : r.notifyHour == null ? 'notification désactivée'
    : parse(todayStr).getDay() !== r.day ? 'pas le jour choisi'
    : hour < r.notifyHour ? `avant ${r.notifyHour} h`
    : state.mensurations === todayStr ? 'déjà envoyée aujourd\'hui' : '';
  if (why) { console.log(`${todayStr} ${hour} h : rien à envoyer, ${why}.`); return; }

  const message = `Dernière mesure il y a ${s.daysSince} jours (${s.last.split('-').reverse().slice(0, 2).join('/')}). Le matin à jeun, avant la séance.`;
  const payload = { topic: process.env.NTFY_TOPIC, title: 'Mensurations à mettre à jour', message, tags: ['straight_ruler'] };
  if (process.env.DRY_RUN) console.log('DRY_RUN', JSON.stringify({ ...payload, topic: '***' }));
  else {
    const res = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`ntfy : ${res.status}`);
  }
  fs.writeFileSync('notify-state.json', JSON.stringify({ ...state, mensurations: todayStr }, null, 1) + '\n');
  console.log(`${todayStr} ${hour} h : notification envoyée.`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
