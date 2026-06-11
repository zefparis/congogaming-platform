import crypto from 'node:crypto';

const SECRET = '48362df0dc6207a35c76a6111ae10bee4ecbf319cf5758fbb1b70648cbe34c57';
const EVENT_ID = 'test-evt-' + Date.now();
const PROVIDER_USER_ID = 'test-123'; // remplace par ton vrai UUID si dispo

const body = JSON.stringify({
  id: EVENT_ID,
  event: 'limit_changed',
  subject: PROVIDER_USER_ID
});

const sig = 'sha256=' + crypto
  .createHmac('sha256', SECRET)
  .update(body)
  .digest('hex');

async function send() {
  const res = await fetch('https://core-api.adipredictstreet.com/api/partners/limits/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Partner-Id': 'congo-gaming',
      'X-Limits-Signature': sig
    },
    body
  });
  console.log(`Status: ${res.status}`);
  console.log(await res.text());
}

// 1er envoi
console.log('EVENT_ID:', EVENT_ID);
console.log('Sending...');
await send();

// Replay — même id
console.log('Replaying same event...');
await send();
