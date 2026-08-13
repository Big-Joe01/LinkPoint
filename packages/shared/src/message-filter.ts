// Server-side message protection / anti-bypass filter.
// Detects and redacts attempts to share contact info or move deals off-platform.
// This is authoritative — frontend filtering is only a convenience.

export interface FilterResult {
  blocked: boolean;
  redacted: string;
  reasons: string[];
}

// Nigerian-style phone numbers (0803..., +234..., 0700...), international formats.
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)|(\b0\d{10}\b)/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /\bhttps?:\/\/\S+/gi;
const WA_RE = /\b(?:wa\.me|whatsapp)\S*/gi;
const TG_RE = /\b(?:t\.me|telegram)\S*/gi;
const IG_RE = /\b(?:instagram\.com|instagr\.am)\/\S+/gi;
const HANDLE_RE = /(?:^|\s)@([a-z0-9._]{3,})\b/gi;
const BANK_RE = /\b\d{10}\b/g; // raw 10-digit account numbers

const ALL_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: PHONE_RE, reason: 'PHONE_NUMBER' },
  { re: EMAIL_RE, reason: 'EMAIL' },
  { re: URL_RE, reason: 'URL' },
  { re: WA_RE, reason: 'WHATSAPP' },
  { re: TG_RE, reason: 'TELEGRAM' },
  { re: IG_RE, reason: 'INSTAGRAM' },
  { re: HANDLE_RE, reason: 'SOCIAL_HANDLE' },
  { re: BANK_RE, reason: 'BANK_ACCOUNT' },
];

const REDACTION = '[redacted]';

/** Redact forbidden content. Returns whether anything was blocked. */
export function filterMessage(input: string): FilterResult {
  let redacted = input;
  const reasons: string[] = [];
  for (const { re, reason } of ALL_PATTERNS) {
    if (re.test(redacted)) {
      reasons.push(reason);
      // reset lastIndex for global regexes before replacing
      re.lastIndex = 0;
      redacted = redacted.replace(re, REDACTION);
    }
  }
  return { blocked: reasons.length > 0, redacted, reasons };
}

/** True when text contains forbidden contact info (does not mutate). */
export function containsForbiddenContactInfo(input: string): boolean {
  return ALL_PATTERNS.some(({ re }) => re.test(input));
}
