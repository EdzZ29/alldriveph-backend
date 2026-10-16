// The chat's automatic replies. A visitor's message is matched against the FAQs managed in the
// admin panel; a good match is answered at once. Otherwise the visitor is told (once) that the
// team has been notified. While a team member is chatting, the bot stays out of the way.

import type { Faq } from '../../entities/content.entity';

const STOPWORDS = new Set(
  (
    'the and for are you your can how what when where which who will with have has had does ' +
    'did not but any all our out its this that these those from into about there their them ' +
    'they then than too very just also get got may might must should would could please ' +
    'hello thanks thank want need like know tell much many some more most is am be do of to ' +
    'in on at it me my we us or an as by if so no yes ok hi'
  ).split(' '),
);

/** Lowercase words of 3+ letters without common filler, lightly stemmed ("cars" -> "car"). */
export function keywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
  return new Set(words);
}

/** The FAQ that best answers a message, or null when none fits well enough. */
export function bestFaq(message: string, faqs: Faq[]): Faq | null {
  const asked = keywords(message);
  if (!asked.size) return null;
  let best: { faq: Faq; score: number } | null = null;
  for (const faq of faqs) {
    const question = keywords(faq.question);
    if (!question.size) continue;
    let hits = 0;
    for (const word of question) if (asked.has(word)) hits += 1;
    const score = hits / question.size;
    const enough = hits >= 2 || (hits === 1 && question.size <= 2);
    if (enough && score >= 0.4 && (!best || score > best.score))
      best = { faq, score };
  }
  return best?.faq ?? null;
}

type Lang = 'en' | 'fil' | 'ceb' | 'ko' | 'ja' | 'zh' | 'es';

const HANDOFF: Record<Lang, string> = {
  en: "Thanks for your message! Our team has been notified and will reply right here shortly. If you'd like us to reach you later, leave your phone number or email.",
  fil: 'Salamat sa iyong mensahe! Naabisuhan na ang aming team at sasagot sila dito sa lalong madaling panahon. Kung gusto mong makontak ka namin mamaya, iwan ang iyong numero o email.',
  ceb: 'Salamat sa imong mensahe! Nahibal-an na sa among team ug motubag sila diri sa dili madugay. Kung gusto ka nga kontakon namo unya, ibilin ang imong numero o email.',
  ko: '메시지 감사합니다! 담당 팀에 알림이 전달되었으며 곧 이곳에서 답변드리겠습니다. 나중에 연락받기를 원하시면 전화번호나 이메일을 남겨 주세요.',
  ja: 'メッセージありがとうございます！担当チームに通知しましたので、まもなくこちらで返信いたします。後ほどご連絡をご希望の場合は、電話番号またはメールアドレスをお知らせください。',
  zh: '感谢您的留言！我们的团队已收到通知，很快会在这里回复您。如希望我们稍后联系您，请留下您的电话或邮箱。',
  es: '¡Gracias por tu mensaje! Nuestro equipo ya fue avisado y te responderá aquí en breve. Si quieres que te contactemos más tarde, deja tu teléfono o correo.',
};

const FOLLOW_UP: Record<Lang, string> = {
  en: 'Need more help? Reply here and our team will answer.',
  fil: 'Kailangan pa ng tulong? Sumagot dito at sasagot ang aming team.',
  ceb: 'Kinahanglan pa og tabang? Tubag diri ug motubag ang among team.',
  ko: '더 도움이 필요하시면 이곳에 답장해 주세요. 담당 팀이 답변드립니다.',
  ja: 'さらにお手伝いが必要な場合は、こちらに返信してください。担当チームがお答えします。',
  zh: '还需要帮助吗？请在这里回复，我们的团队会为您解答。',
  es: '¿Necesitas más ayuda? Responde aquí y nuestro equipo te contestará.',
};

const lang = (value: string): Lang => (value in HANDOFF ? value : 'en') as Lang;

/** How long a staff reply or a handoff notice keeps the bot from repeating itself. */
const QUIET_MS = 30 * 60_000;

export interface Recent {
  /** when a team member last wrote in this conversation */
  lastStaffAt: Date | null;
  /** when the bot last told the visitor the team was notified */
  lastHandoffAt: Date | null;
}

/**
 * The bot's reply to a visitor message, or null to stay quiet. `handoff` is true when the reply
 * is the "team notified" notice (so the caller can remember when it was sent).
 */
export function botReply(
  message: string,
  language: string,
  faqs: Faq[],
  recent: Recent,
  now = new Date(),
): { body: string; handoff: boolean } | null {
  const quiet = (at: Date | null) =>
    !!at && now.getTime() - at.getTime() < QUIET_MS;
  // a person is already on it
  if (quiet(recent.lastStaffAt)) return null;
  const l = lang(language);
  const faq = bestFaq(message, faqs);
  if (faq) return { body: `${faq.answer}\n\n${FOLLOW_UP[l]}`, handoff: false };
  if (quiet(recent.lastHandoffAt)) return null;
  return { body: HANDOFF[l], handoff: true };
}

export const HANDOFF_TEXTS = new Set(Object.values(HANDOFF));
