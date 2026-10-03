'use strict';

require('../db').connect().then(async () => {
  const { latestJoin, latestContact } = require('../db');
  const rows = await Promise.all([latestJoin(10), latestContact(10)]);
  const joins = rows[0] || [];
  const contacts = rows[1] || [];
  console.log('\n  ============== LAST 10 JOIN REGISTRATIONS ==============');
  if (!joins.length) console.log('  (empty — no submissions yet)');
  joins.forEach(j => {
    console.log(`  #${j.id}  ${j.created_at}  ${j.first_name} ${j.last_name}  <${j.email}>  — ${j.profession}${j.country_residence ? '  📍 ' + j.country_residence : ''}${j.specialty ? '  🎯 ' + j.specialty : ''}`);
  });
  console.log('\n  ============== LAST 10 CONTACT MESSAGES ==============');
  if (!contacts.length) console.log('  (empty — no submissions yet)');
  contacts.forEach(m => {
    console.log(`  #${m.id}  ${m.created_at}  ${m.first_name} ${m.last_name}  <${m.email}>  — ${m.topic}`);
    const msg = String(m.message || '').slice(0, 120);
    if (msg) console.log(`         ${msg}${m.message && m.message.length > 120 ? '…' : ''}\n`);
  });
}).catch(err => {
  console.error(err);
  process.exit(1);
});
