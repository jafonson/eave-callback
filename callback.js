// The logic of Eave's bank callback page (index.html). Pure functions, no dependencies, so `node --test` can run them.

const APP_CALLBACK = 'eave://bank/callback';
const COMPLETE_URL =
  'https://akhfynhyjnxsvrrusmhg.supabase.co/functions/v1/bank-link-complete?forceFunctionRegion=eu-west-1';
// Safe to publish: this is the project's publishable key, public by design (it ships in every copy of the app, and
// CLAUDE.md lists it as bundle-safe). It only identifies the project to Supabase's gateway; the function needs no
// sign-in, and the single-use link state is its proof. verify_jwt is off for bank-link-complete, so no Authorization
// header is sent: the gateway checks `apikey` only.
const PUBLISHABLE_KEY = 'sb_publishable_BFGLFI19ErqPykainMRPvA_ks5KDpjj';
const REQUEST_TIMEOUT_MS = 15000;

/** `eave://bank/callback` with exactly the state, code and error of the bank's redirect; null without a state. */
export function appUrl(search) {
  const params = new URLSearchParams(search);
  if (!params.get('state')) return null;
  const out = new URLSearchParams();
  for (const name of ['state', 'code', 'error']) {
    const value = params.get(name);
    if (value) out.set(name, value);
  }
  return `${APP_CALLBACK}?${out}`;
}

/**
 * Whether the page should complete the link itself: only if it is still showing and never went away. A page that
 * went hidden (the app took over, or iOS asked "Open in Eave?") may be visible again later; its timer must not run.
 */
export function shouldFinishHere({ wentAway, visibilityState }) {
  return !wentAway && visibilityState === 'visible';
}

/** Portuguese when the browser lists it first, or lists nothing; English for any other first language. */
export function pageLanguage(navigatorLanguages) {
  const first = navigatorLanguages[0];
  return !first || first.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

/**
 * Completes the link with Eave's server (the person came back in a browser the app can't be reached from).
 * Resolves `{ result }`, plus `bankName` when connected. Never throws; any trouble is `failed`.
 */
export async function completeLink(search, fetchImpl) {
  const params = new URLSearchParams(search);
  const state = params.get('state');
  if (!state) return { result: 'used' };
  const code = params.get('code');
  const error = params.get('error');
  const body = code ? { state, code } : error ? { state, error } : null;
  if (!body) return { result: 'unreachable' };
  try {
    const response = await fetchImpl(COMPLETE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: PUBLISHABLE_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const answer = await response.json();
    // The server's own `failed` (a 502) means it created nothing. Any other trouble leaves the outcome unknown.
    if (answer.result === 'failed') return { result: 'failed' };
    if (!response.ok) return { result: 'unreachable' };
    if (answer.result === 'connected') {
      return typeof answer.bankName === 'string'
        ? { result: 'connected', bankName: answer.bankName }
        : { result: 'connected' };
    }
    if (['refused', 'empty', 'used'].includes(answer.result)) return { result: answer.result };
  } catch {
    // Network, timeout or a body that isn't JSON: the page can't tell what happened.
  }
  return { result: 'unreachable' };
}

/** 'connected' | 'refused' | 'empty' | 'used' | 'failed' (the server created nothing) | 'unreachable' (outcome unknown) */
export async function finishHere(search, fetchImpl) {
  return (await completeLink(search, fetchImpl)).result;
}

const COPY = {
  pt: {
    bounce: {
      title: 'A voltar à Eave…',
      body: 'Se a Eave não abrir sozinha, toca no botão.',
      button: 'Abrir Eave',
    },
    connected: {
      title: 'Banco ligado',
      button: 'Abrir Eave',
      note: 'Podes fechar esta página.',
    },
    refused: {
      title: 'A ligação não foi concluída',
      body: 'O banco não confirmou, por isso nada foi guardado. Volta à Eave e tenta de novo.',
      button: 'Abrir Eave',
    },
    used: {
      title: 'Esta página já não é válida',
      body: 'Este link já foi usado ou expirou. Abre a Eave para veres o estado do banco.',
      button: 'Abrir Eave',
    },
  },
  en: {
    bounce: {
      title: 'Going back to Eave…',
      body: "If Eave doesn't open on its own, tap the button.",
      button: 'Open Eave',
    },
    connected: {
      title: 'Bank connected',
      button: 'Open Eave',
      note: 'You can close this page.',
    },
    refused: {
      title: "The connection wasn't completed",
      body: "The bank didn't confirm, so nothing was saved. Go back to Eave and try again.",
      button: 'Open Eave',
    },
    used: {
      title: 'This page is no longer valid',
      body: 'This connection was already used or has expired. Open Eave to see the bank’s status.',
      button: 'Open Eave',
    },
  },
};

/** The words of one screen: `{ title, body, button, note? }`. `bank` is the server's name for the bank. */
export function screenCopy(state, lang, bank) {
  const copy = COPY[lang][state];
  if (state !== 'connected') return copy;
  const body =
    lang === 'pt'
      ? `Ligação com ${bank ?? 'o banco'} concluída. Abre a app para veres as contas.`
      : `${bank ?? 'The bank'} is connected to Eave. Open the app to see your accounts.`;
  return { ...copy, body };
}

// ---- The page. Only runs in a browser; node --test imports this file for the functions above. ----
if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  // First thing: take the code and state into memory and out of the address bar and history.
  const search = location.search;
  history.replaceState(null, '', location.pathname);

  const SETTLE_MS = 3000;
  const target = appUrl(search);
  const ui = {
    state: target ? 'bounce' : 'used',
    bank: undefined,
    lang: pageLanguage(navigator.languages ?? []),
  };
  const el = (id) => document.getElementById(id);

  const render = () => {
    const copy = screenCopy(ui.state, ui.lang, ui.bank);
    document.documentElement.lang = ui.lang === 'pt' ? 'pt-PT' : 'en';
    document.title = copy.title;
    for (const icon of document.querySelectorAll('[data-icon]')) {
      icon.hidden = icon.dataset.icon !== ui.state;
    }
    el('title').textContent = copy.title;
    el('body').textContent = copy.body;
    el('body').hidden = !copy.body;
    const open = el('open');
    open.textContent = copy.button;
    // Only the bounce keeps the code: the person may tap to try the app again. Later screens open the app plain.
    open.href = ui.state === 'bounce' && target ? target : 'eave://';
    open.className = ui.state === 'bounce' || ui.state === 'used' ? 'button quiet' : 'button';
    el('note').textContent = copy.note ? `${copy.note} · ` : '';
    el('lang').textContent = ui.lang === 'pt' ? 'English' : 'Português';
    el('lang').lang = ui.lang === 'pt' ? 'en' : 'pt';
  };

  el('lang').addEventListener('click', () => {
    ui.lang = ui.lang === 'pt' ? 'en' : 'pt';
    render();
  });
  render();

  if (target) {
    location.href = target;
    let wentAway = false;
    // If the app took over, the page goes hidden: cancel the fallback for good, even if the person returns later.
    const timer = setTimeout(async () => {
      if (!shouldFinishHere({ wentAway, visibilityState: document.visibilityState })) return;
      const { result, bankName } = await completeLink(search, fetch);
      if (wentAway || result === 'unreachable') return; // outcome unknown: stay on the bounce screen, its button works
      ui.state = result === 'failed' || result === 'empty' ? 'refused' : result;
      ui.bank = bankName;
      render();
    }, SETTLE_MS);
    const away = () => {
      wentAway = true;
      clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') away();
    });
    window.addEventListener('pagehide', away);
  }
}
