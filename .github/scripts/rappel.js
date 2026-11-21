// Notifications ntfy (rappel mensurations, et depuis la v81 de l'appli rappel des compléments alimentaires),
// lancées chaque heure par .github/workflows/rappel.yml.
// Envoie au plus une notification par jour, le jour de la semaine choisi, à partir de l'heure choisie (heure de Paris),
// tant que les mensurations ne sont pas à jour. Réglage : reminders.json (écrit par l'appli iPhone).
// Compléments : à l'heure de rappel de chaque complément, si sa case du jour n'est pas cochée (supplements.json).
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

// Copie des règles des compléments (muscu-app/reminder.js) : garder les deux identiques.
/* Compléments alimentaires (v81) : règles partagées par l'appli (Corps › Nutrition) et l'automate de notification
   (copie dans .github/scripts/rappel.js du dépôt de données : garder les deux identiques). Fichier supplements.json :
   { items: { id: { id, name, dose, unit, moment, days, note, remind, off: [[du, au | null]], from, deleted, u } },
     log: { 'AAAA-MM-JJ': { id: { on, u } } }, trainDays: [jours de séance du programme, 0 = dimanche], updatedAt }
   days : 'all' | 'train' (jours de séance) | 'rest' (jours de repos). remind : heure du rappel ntfy, ou null.
   off : périodes de pause (au = jour de reprise, exclu ; null = toujours en pause). */
const SUPP_MOMENTS = [['matin', 'Matin', 'du matin'], ['midi', 'Midi', 'du midi'], ['avant', 'Avant la séance', 'avant la séance'], ['apres', 'Après la séance', 'après la séance'], ['soir', 'Soir', 'du soir']];
const SUPP_DAYS = [['all', 'Tous les jours'], ['train', 'Jours de séance'], ['rest', 'Jours de repos']];
const suppPaused = (it, d) => (it.off || []).some(([a, b]) => d >= a && (b == null || d < b));
// Prise prévue ce jour-là ? isTrain : jour de séance prévu au programme.
function suppDue(it, d, isTrain) {
  if (!it || it.deleted || (it.from && d < it.from) || suppPaused(it, d)) return false;
  return it.days === 'train' ? !!isTrain : it.days === 'rest' ? !isTrain : true;
}
const suppTaken = (s, d, id) => !!(s && s.log && s.log[d] && s.log[d][id] && s.log[d][id].on);
const suppDoseTxt = it => [it.dose != null ? Number(it.dose).toLocaleString('fr-FR') : '', it.unit || ''].filter(Boolean).join(' ');
// Fusion de deux copies : la modification la plus récente l'emporte, fiche par fiche et prise par prise.
function suppMerge(a, b) {
  a = a || {}; b = b || {};
  const pick = (x, y) => !x ? y : !y ? x : (y.u || 0) > (x.u || 0) ? y : x;
  const items = { ...(a.items || {}) };
  for (const [k, v] of Object.entries(b.items || {})) items[k] = pick(items[k], v);
  const log = {};
  for (const d of new Set([...Object.keys(a.log || {}), ...Object.keys(b.log || {})])) {
    const day = { ...((a.log || {})[d] || {}) };
    for (const [k, v] of Object.entries((b.log || {})[d] || {})) day[k] = pick(day[k], v);
    log[d] = day;
  }
  const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  return { items, log, trainDays: newer.trainDays || a.trainDays || b.trainDays || null, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
}
// Rappel à envoyer à l'heure `hour` du jour d : une seule notification qui regroupe les prises prévues, non cochées,
// dont l'heure de rappel est passée et pas encore signalée (sent : clés 'AAAA-MM-JJ@heure' déjà envoyées). null : rien.
function suppReminder(s, d, hour, isTrain, sent) {
  const list = Object.values((s && s.items) || {})
    .filter(it => it.remind != null && it.remind <= hour && suppDue(it, d, isTrain) && !suppTaken(s, d, it.id) && !(sent || []).includes(`${d}@${it.remind}`))
    .sort((x, y) => x.remind - y.remind || SUPP_MOMENTS.findIndex(m => m[0] === x.moment) - SUPP_MOMENTS.findIndex(m => m[0] === y.moment));
  if (!list.length) return null;
  const moments = [...new Set(list.map(it => it.moment))];
  const m = moments.length === 1 && SUPP_MOMENTS.find(x => x[0] === moments[0]);
  return {
    keys: [...new Set(list.map(it => `${d}@${it.remind}`))],
    title: m ? `Compléments ${m[2]}` : 'Compléments à prendre',
    message: `Pas encore coché${list.length > 1 ? 's' : ''} : ${list.map(it => [it.name, suppDoseTxt(it)].filter(Boolean).join(' ')).join(', ')}.`,
  };
}

async function send(payload) {
  if (process.env.DRY_RUN) { console.log('DRY_RUN', JSON.stringify({ ...payload, topic: '***' })); return; }
  const res = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`ntfy : ${res.status}`);
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
  const next = { ...state };
  if (why) console.log(`${todayStr} ${hour} h : mensurations, rien à envoyer, ${why}.`);
  else {
    const message = `Dernière mesure il y a ${s.daysSince} jours (${s.last.split('-').reverse().slice(0, 2).join('/')}). Le matin à jeun, avant la séance.`;
    await send({ topic: process.env.NTFY_TOPIC, title: 'Mensurations à mettre à jour', message, tags: ['straight_ruler'] });
    next.mensurations = todayStr;
    console.log(`${todayStr} ${hour} h : mensurations, notification envoyée.`);
  }

  // Compléments alimentaires : une seule notification, qui regroupe les prises prévues aujourd'hui, non cochées,
  // dont l'heure de rappel est passée. Jours de séance : trainDays, écrit par l'appli d'après le programme.
  const supp = readJson('supplements.json', null);
  const isTrain = ((supp && supp.trainDays) || []).includes(parse(todayStr).getDay());
  const sent = (state.supplements || []).filter(k => k.startsWith(todayStr));
  const rs = supp ? suppReminder(supp, todayStr, hour, isTrain, sent) : null;
  if (!process.env.NTFY_TOPIC && !process.env.DRY_RUN) console.log(`${todayStr} ${hour} h : compléments, pas de sujet ntfy réglé (secret NTFY_TOPIC).`);
  else if (!rs) console.log(`${todayStr} ${hour} h : compléments, rien à envoyer.`);
  else {
    await send({ topic: process.env.NTFY_TOPIC, title: rs.title, message: rs.message, tags: ['pill'] });
    sent.push(...rs.keys);
    console.log(`${todayStr} ${hour} h : compléments, notification envoyée.`);
  }
  if (sent.length) next.supplements = sent; else delete next.supplements;
  if (JSON.stringify(next) !== JSON.stringify(state)) fs.writeFileSync('notify-state.json', JSON.stringify(next, null, 1) + '\n');
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
