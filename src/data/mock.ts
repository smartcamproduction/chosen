import type { L10n } from '@/lib/l10n';

/**
 * SAMPLE DATA for preview mode (no backend): the sample coach chat and the
 * Coach teaser for Free users. Everything else (roadmaps, XP, ranks,
 * money, the AI coach and prices from RevenueCat) is real.
 */

/** Coach allowance shown until the AI coach phase tracks real usage. */
export const MOCK_USER = {
  coachMessagesUsed: 112,
  coachResetDays: 11,
};
/** Sample coach conversation (Pro / Elite). */
export type ChatMessage =
  | { id: string; from: 'coach'; time: string; text: L10n; swap?: { scrap: L10n; use: L10n }; actions?: L10n[]; outro?: L10n; highlight?: L10n }
  | { id: string; from: 'user'; time: string; text: L10n; attachment?: { name: string; lines: L10n[] } };

export const COACH_THREAD: ChatMessage[] = [
  {
    id: 'm1',
    from: 'coach',
    time: '14:28',
    text: {
      en: 'I reviewed the landing page from step 1.4. Your headline is too vague.',
      pl: 'Strona zapisu z kroku 1.4 przejrzana. Nagłówek jest zbyt ogólny.',
    },
    swap: {
      scrap: { en: '"Weekly updates about AI"', pl: '„Cotygodniowe nowości o AI”' },
      use: {
        en: '"The 5 AI tools worth your time in marketing. Every Friday, in 3 minutes."',
        pl: '„5 narzędzi AI, które naprawdę pomagają w marketingu. W każdy piątek, w 3 minuty.”',
      },
    },
    outro: { en: "What's your subscriber goal for the next 7 days?", pl: 'Jaki masz cel subskrybentów na najbliższe 7 dni?' },
  },
  {
    id: 'm2',
    from: 'user',
    time: '14:31',
    text: {
      en: "I'm aiming for 100 subscribers by Sunday. I'm worried I can't get traffic without an existing audience.",
      pl: 'Celuję w 100 subskrybentów do niedzieli. Boję się, że bez publiczności nie zdobędę ruchu.',
    },
  },
  {
    id: 'm3',
    from: 'coach',
    time: '14:32',
    text: {
      en: "Realistic goal, but posting the link once won't get you there. Two moves for today:",
      pl: 'Realny cel, ale jednorazowe wrzucenie linku nie wystarczy. Dwa ruchy na dziś:',
    },
    actions: [
      {
        en: 'Share issue #1 in 3 niche communities with a one-line summary, not a bare link.',
        pl: 'Udostępnij wydanie #1 w 3 niszowych społecznościach z jednozdaniowym opisem, a nie samym linkiem.',
      },
      {
        en: 'Message 15 people who would genuinely enjoy it and ask them to forward it.',
        pl: 'Napisz do 15 osób, którym naprawdę się spodoba, i poproś, żeby przekazały dalej.',
      },
    ],
    outro: { en: 'Did your Stripe test payment go through yet?', pl: 'Czy płatność testowa w Stripe już przeszła?' },
  },
  {
    id: 'm4',
    from: 'user',
    time: '14:35',
    text: { en: 'Yes, here it is:', pl: 'Tak, proszę:' },
    attachment: {
      name: 'stripe_test_payment.png',
      lines: [
        { en: 'Payment: $50.00 · Succeeded', pl: 'Płatność: 50,00 $ · Udana' },
        { en: 'Product: Newsletter sponsor slot', pl: 'Produkt: Miejsce sponsorskie' },
        { en: 'Mode: Test', pl: 'Tryb: Testowy' },
      ],
    },
  },
  {
    id: 'm5',
    from: 'coach',
    time: '14:36',
    text: { en: 'Checkout works. Your sponsor offer is live.', pl: 'Płatność działa. Twoja oferta dla sponsorów jest gotowa.' },
    highlight: { en: 'Send your first 5 pitches now.', pl: 'Wyślij teraz pierwsze 5 ofert.' },
  },
];

/** Free-user teaser sample. */
export const TEASER = {
  coach: {
    en: "Day 3 check: most of your time went into design and none into finding readers. Let's fix that today.",
    pl: 'Kontrola dnia 3: większość czasu poszła na wygląd, a nic na zdobywanie czytelników. Naprawmy to dziś.',
  },
  blueprintLabel: { en: 'Next step', pl: 'Następny krok' },
  blueprint: {
    en: '"Here is a short message to get your first 50 subscribers by tonight…"',
    pl: '„Oto krótka wiadomość, dzięki której zdobędziesz pierwszych 50 subskrybentów jeszcze dziś…”',
  },
  user: {
    en: 'How do I share my newsletter without sounding spammy?',
    pl: 'Jak polecać newsletter, żeby nie brzmieć jak spam?',
  },
  blurred: {
    en: 'Never lead with the link. Lead with one useful insight from your last issue, then offer the rest. Paste this word for word:',
    pl: 'Nigdy nie zaczynaj od linku. Zacznij od jednej przydatnej wskazówki z ostatniego wydania, a potem zaproponuj resztę. Wklej to dosłownie:',
  },
} satisfies Record<string, L10n>;
