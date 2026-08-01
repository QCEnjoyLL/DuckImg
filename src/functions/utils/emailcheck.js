/**
 * 邮箱可达性预检：发验证码之前拦掉「收不了信」的地址，保护发信域名信誉。
 * 1) 一次性/临时邮箱域名 → 直接拒绝；
 * 2) DNS-over-HTTPS 查 MX 记录（无 MX 按 RFC 5321 回退 A 记录）→ 都没有则拒绝；
 * 原则：DNS 查询失败一律放行（fail-open，不因基础设施抖动误伤真人），
 * 结果按域名缓存：isolate 内存 + kv_store 各 1 天。
 */
import { kvGet, kvPut } from './db.js';

// ponytail: 精选常见一次性邮箱域名，不追求全量（全量列表上万条且天天变）；
// 真要扩充时把域名加进来即可，子域一并命中（x.yopmail.com 也拦）。
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'yopmail.com', 'guerrillamail.com', 'guerrillamail.net',
  'sharklasers.com', '10minutemail.com', '10minutemail.net', 'temp-mail.org',
  'temp-mail.io', 'tempmail.plus', 'tempmail.dev', 'tmpmail.org', 'tmpmail.net',
  'throwawaymail.com', 'trashmail.com', 'trash-mail.com', 'getnada.com',
  'nada.email', 'maildrop.cc', 'mailnesia.com', 'dispostable.com',
  'mintemail.com', 'mohmal.com', 'moakt.com', 'emailondeck.com',
  'fakeinbox.com', 'mailcatch.com', 'spamgourmet.com', 'mytemp.email',
  'burnermail.io', '33mail.com', 'discard.email', 'discardmail.com',
  'tempr.email', '1secmail.com', '1secmail.org', '1secmail.net',
  'snapmail.cc', 'mail.tm', 'mail.gw', 'dropmail.me', 'minuteinbox.com',
  'tempmailo.com', 'disbox.net', 'mailsac.com', 'inboxkitten.com',
  'harakirimail.com', 'linshiyouxiang.net', 'chacuo.net', 'zwoho.com',
  'nqmo.com', 'yzm.de',
]);

const NO_MX_MSG = '该邮箱域名无法接收邮件，请检查是否拼写有误';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const _mxMem = new Map(); // domain -> { ok, exp }

function extractDomain(email) {
  const s = String(email || '');
  const at = s.lastIndexOf('@');
  if (at < 0) return '';
  return s.slice(at + 1).trim().toLowerCase();
}

function isDisposable(domain) {
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  for (const d of DISPOSABLE_DOMAINS) {
    if (domain.endsWith('.' + d)) return true;
  }
  return false;
}

async function dohQuery(domain, type) {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
    { headers: { accept: 'application/dns-json' } }
  );
  if (!res.ok) return null;
  return res.json();
}

/** true=能收信 / false=不能收信 / null=查询失败（调用方放行） */
async function domainAcceptsMail(domain) {
  let mx;
  try { mx = await dohQuery(domain, 'MX'); } catch { return null; }
  if (!mx || typeof mx.Status !== 'number') return null;
  if (mx.Status === 3) return false;   // NXDOMAIN：域名根本不存在
  if (mx.Status !== 0) return null;    // SERVFAIL 等：说不准，放行

  const answers = (Array.isArray(mx.Answer) ? mx.Answer : []).filter((a) => a.type === 15);
  if (answers.length) {
    // RFC 7505 Null MX（"0 ."）= 域名明确声明不收邮件
    const allNull = answers.every((a) => /^0\s+\.?$/.test(String(a.data || '').trim()));
    return !allNull;
  }

  // 无 MX：RFC 5321 允许回退 A 记录收信（部分自建域如此），别误伤
  try {
    const a = await dohQuery(domain, 'A');
    if (a && a.Status === 0 && Array.isArray(a.Answer) && a.Answer.some((x) => x.type === 1)) {
      return true;
    }
  } catch { return null; }
  return false;
}

/**
 * 校验邮箱是否值得发信。返回 { ok: true } 或 { ok: false, error }。
 * 只做域名级判断；「域名真实但账号不存在」需退信 Webhook 才能识别（未实现）。
 */
export async function checkEmailDeliverable(env, email) {
  const domain = extractDomain(email);
  if (!domain || !domain.includes('.')) return { ok: false, error: '邮箱格式不正确' };
  if (isDisposable(domain)) {
    return { ok: false, error: '不支持一次性/临时邮箱，请使用常用邮箱' };
  }

  const now = Date.now();
  const mem = _mxMem.get(domain);
  if (mem && mem.exp > now) {
    return mem.ok ? { ok: true } : { ok: false, error: NO_MX_MSG };
  }

  const kvKey = `mxok:${domain}`;
  try {
    const cached = await kvGet(env, kvKey);
    if (cached === '1' || cached === '0') {
      const ok = cached === '1';
      if (_mxMem.size > 2000) _mxMem.clear();
      _mxMem.set(domain, { ok, exp: now + CACHE_TTL_MS });
      return ok ? { ok: true } : { ok: false, error: NO_MX_MSG };
    }
  } catch { /* kv 不可用则只用内存缓存 */ }

  const accepts = await domainAcceptsMail(domain);
  if (accepts === null) return { ok: true }; // 查询失败：放行且不缓存

  if (_mxMem.size > 2000) _mxMem.clear();
  _mxMem.set(domain, { ok: accepts, exp: now + CACHE_TTL_MS });
  try { await kvPut(env, kvKey, accepts ? '1' : '0', { expirationTtl: 86400 }); } catch { /* ignore */ }
  return accepts ? { ok: true } : { ok: false, error: NO_MX_MSG };
}
