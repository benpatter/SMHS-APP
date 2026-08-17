/**
 * Phone numbers and email addresses written inside prose.
 *
 * The school names both mid-sentence — "Contact campus security at
 * (949) 279-7690", "email registrar@smhs.org" — in policies, attendance
 * procedures, contact notes and announcements. On a phone those have to be
 * reachable in one tap, and nobody is going to hand-mark them in text we scrape
 * from smhs.org, so we find them in the string instead.
 */

/**
 * US numbers as the school writes them: (949) 279-7690, 949-279-7690,
 * 949.279.7690, 9492797690, +1 949 279 7690 — with an optional extension.
 * Comma is deliberately NOT a separator here: that's what keeps grouped figures
 * like "$1,234,567" from reading as a phone number.
 */
const PHONE_RE =
  /(?:\+?1[\s.\-–]?)?\(?\d{3}\)?[\s.\-–]?\d{3}[\s.\-–]?\d{4}(?:\s*(?:ext\.?|x\.?|extension)\s*\d{1,6})?/gi;

const EXT_RE = /(?:ext\.?|x\.?|extension)\s*(\d{1,6})\s*$/i;

/**
 * Addresses as they appear in a sentence. The trailing dot of "email
 * registrar@smhs.org." is punctuation, not part of the domain, so the TLD is
 * matched as letters only and the regex backtracks off it.
 */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

export interface LinkMatch {
  kind: 'phone' | 'email';
  /** Where it starts in the source string. */
  index: number;
  /** Exactly as the page wrote it — what we show. */
  text: string;
}

/**
 * Every phone number in a string, in order. Digit runs longer than a phone
 * number (student IDs, account numbers, order totals) are rejected rather than
 * half-matched: a match that touches another digit on either side isn't one.
 * A fax line is skipped too — the school publishes one next to its phone, and
 * dialing it is never what the tap meant.
 */
export function findPhones(text: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const index = m.index ?? 0;
    const before = text[index - 1] ?? '';
    const after = text[index + m[0].length] ?? '';
    if (/[\d$%]/.test(before) || /\d/.test(after)) continue;
    if (/fax\W*$/i.test(text.slice(Math.max(0, index - 8), index))) continue;
    out.push({ kind: 'phone', index, text: m[0] });
  }
  return out;
}

/**
 * Every email address in a string, in order. A match that grows out of the
 * character before it isn't an address of its own — that's a URL carrying an
 * @ (".../u/name@host") or the tail of a longer token.
 */
export function findEmails(text: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    const index = m.index ?? 0;
    const before = text[index - 1] ?? '';
    if (/[a-z0-9@/\\]/i.test(before)) continue;
    out.push({ kind: 'email', index, text: m[0] });
  }
  return out;
}

/** Both kinds, in the order they appear, with overlaps resolved to the first. */
export function findLinkables(text: string): LinkMatch[] {
  const all = [...findPhones(text), ...findEmails(text)].sort((a, b) => a.index - b.index);
  const out: LinkMatch[] = [];
  let end = 0;
  for (const m of all) {
    if (m.index < end) continue;
    out.push(m);
    end = m.index + m.text.length;
  }
  return out;
}

/**
 * A number as written → a dialable `tel:` URI. Ten digits are dialed as US
 * numbers (`+1…`) so the link works from any network; an extension becomes the
 * pauses a dialer understands, so "x1234" still gets you the extension.
 * Anything we can't read as a US number is passed through as its bare digits
 * rather than dropped.
 */
export function telHref(phone: string): string {
  const ext = EXT_RE.exec(phone);
  const digits = (ext ? phone.slice(0, ext.index) : phone).replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const base = national.length === 10 ? `+1${national}` : digits;
  return ext && base ? `tel:${base},,${ext[1]}` : `tel:${base}`;
}

export function mailtoHref(email: string, subject?: string): string {
  return subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
}

/** The href a match should open. */
export function hrefFor(m: LinkMatch): string {
  return m.kind === 'phone' ? telHref(m.text) : mailtoHref(m.text);
}

/** The pieces of a string, split so the numbers and addresses can be linked. */
export function splitOnLinkables(text: string): Array<{ match: LinkMatch | null; text: string }> {
  const parts: Array<{ match: LinkMatch | null; text: string }> = [];
  let at = 0;
  for (const m of findLinkables(text)) {
    if (m.index > at) parts.push({ match: null, text: text.slice(at, m.index) });
    parts.push({ match: m, text: m.text });
    at = m.index + m.text.length;
  }
  if (at < text.length) parts.push({ match: null, text: text.slice(at) });
  return parts;
}

const LINK_CLASS = 'font-semibold text-brand underline underline-offset-2 dark:text-gold';
// A number never breaks across lines; a long address has to be allowed to,
// or it pushes the card sideways.
const TEL_CLASS = `tnum whitespace-nowrap ${LINK_CLASS}`;
const MAIL_CLASS = `${LINK_CLASS} [overflow-wrap:anywhere]`;

/**
 * The same job for a blob of HTML (the weekly-post bodies, which arrive as
 * sanitized markup rather than plain text). Tags are stepped over, and text
 * inside an existing <a> is left alone — something that is already a link must
 * not become a link inside a link.
 */
export function linkifyHtml(html: string): string {
  let out = '';
  let i = 0;
  let depth = 0; // open <a> elements
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    const chunk = html.slice(i, lt < 0 ? html.length : lt);
    out += depth > 0 ? chunk : linkifyText(chunk);
    if (lt < 0) break;
    const gt = html.indexOf('>', lt);
    const tag = html.slice(lt, gt < 0 ? html.length : gt + 1);
    if (/^<a\b/i.test(tag)) depth++;
    else if (/^<\/a\s*>/i.test(tag) && depth > 0) depth--;
    out += tag;
    i = gt < 0 ? html.length : gt + 1;
  }
  return out;
}

/** Text → the same text with `tel:`/`mailto:` anchors. Only ever called on text nodes. */
function linkifyText(text: string): string {
  if (!text) return text;
  return splitOnLinkables(text)
    .map((p) => {
      if (!p.match) return p.text;
      const cls = p.match.kind === 'phone' ? TEL_CLASS : MAIL_CLASS;
      return `<a href="${hrefFor(p.match)}" class="${cls}">${p.text}</a>`;
    })
    .join('');
}
