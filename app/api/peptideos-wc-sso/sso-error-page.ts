import { EMBED_BACK_TO_DASHBOARD } from "@/features/embed/lib/embed-mode";

const DEFAULT_LOCALE = "en";

const COPY = {
  en: {
    title: "We could not sign you in",
    message: "Something went wrong while connecting your PeptideOS account. You can try again.",
    tryAgain: "Try again",
    supportNote: "If this keeps happening, contact support. Your accounts were not linked automatically."
  },
  fr: {
    title: "Connexion impossible",
    message: "Un problème est survenu lors de la connexion de votre compte PeptideOS. Vous pouvez réessayer.",
    tryAgain: "Réessayer",
    supportNote: "Si le problème continue, contactez le support. Vos comptes n'ont pas été liés automatiquement."
  },
  es: {
    title: "No pudimos iniciar tu sesión",
    message: "Algo salió mal al conectar tu cuenta de PeptideOS. Puedes intentarlo de nuevo.",
    tryAgain: "Intentar de nuevo",
    supportNote: "Si sigue ocurriendo, contacta a soporte. Tus cuentas no se vincularon automáticamente."
  },
  pt: {
    title: "Não foi possível iniciar sessão",
    message: "Ocorreu um problema ao ligar a sua conta PeptideOS. Pode tentar novamente.",
    tryAgain: "Tentar novamente",
    supportNote: "Se isto continuar, contacte o suporte. As suas contas não foram associadas automaticamente."
  },
  ru: {
    title: "Не удалось войти",
    message: "Не получилось подключить аккаунт PeptideOS. Можно попробовать ещё раз.",
    tryAgain: "Попробовать снова",
    supportNote: "Если ошибка повторяется, обратитесь в поддержку. Аккаунты не были связаны автоматически."
  },
  "zh-CN": {
    title: "无法登录",
    message: "连接 PeptideOS 账户时出错。你可以再试一次。",
    tryAgain: "再试一次",
    supportNote: "如果一直失败，请联系支持。账户没有被自动关联。"
  }
} as const;

type SupportedLocale = keyof typeof COPY;

function normalizeLocale(locale?: string): SupportedLocale {
  const raw = locale?.trim();
  if (!raw) {
    return DEFAULT_LOCALE;
  }
  if (raw in COPY) {
    return raw as SupportedLocale;
  }
  const lower = raw.toLowerCase();
  if (lower === "zh" || lower.startsWith("zh-")) {
    return "zh-CN";
  }
  const base = lower.split("-")[0] as SupportedLocale;
  return base in COPY ? base : DEFAULT_LOCALE;
}

export function prefersBrowserSsoErrorPage(accept: string | null | undefined): boolean {
  return typeof accept === "string" && /text\/html/i.test(accept);
}

export function ssoErrorCopy(locale: string, error: string): {
  title: string;
  message: string;
  tryAgain: string;
  supportNote?: string;
} {
  const copy = COPY[normalizeLocale(locale)];
  return {
    title: copy.title,
    message: copy.message,
    tryAgain: copy.tryAgain,
    supportNote: error === "sso_email_collision" ? copy.supportNote : undefined
  };
}

function embedFallbackActions(tryAgainHref: string): string {
  const links = embedSsoFallbackLinks(tryAgainHref);
  const login = escapeHtml(links.loginHref);
  const signup = escapeHtml(links.signupHref);
  const dashboard = escapeHtml(links.dashboardHref);
  const loginLink = `<a href="${login}" rel="noopener noreferrer" target="_top">Log in</a>`;
  const signupLink = `<a href="${signup}" rel="noopener noreferrer" target="_top">Sign up</a>`;
  const backLink = `<a href="${dashboard}" rel="noopener noreferrer" target="_top">${escapeHtml(EMBED_BACK_TO_DASHBOARD)}</a>`;
  return `<p>${loginLink} ${signupLink}</p>
      <p>${backLink}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function embedSsoFallbackLinks(tryAgainHref: string): { loginHref: string; signupHref: string; dashboardHref: string } {
  const origin = new URL(tryAgainHref).origin;
  return {
    loginHref: tryAgainHref,
    signupHref: new URL("/signup", `${origin}/`).toString(),
    dashboardHref: new URL("/dashboard", `${origin}/`).toString()
  };
}

export function ssoErrorHtml(input: { locale?: string; error: string; tryAgainHref: string; embed?: boolean }): string {
  const copy = ssoErrorCopy(input.locale ?? DEFAULT_LOCALE, input.error);
  const href = escapeHtml(input.tryAgainHref);
  const support = copy.supportNote ? `<p class="support">${escapeHtml(copy.supportNote)}</p>` : "";
  const actions = input.embed ? embedFallbackActions(input.tryAgainHref) : `<p><a href="${href}">${escapeHtml(copy.tryAgain)}</a></p>`;
  return `<!doctype html>
<html lang="${escapeHtml(normalizeLocale(input.locale))}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 28rem; margin: 12vh auto; padding: 2rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem; }
      h1 { font-size: 1.35rem; margin: 0 0 0.75rem; }
      p { line-height: 1.5; margin: 0 0 1rem; color: #334155; }
      a { display: inline-block; padding: 0.65rem 1rem; border-radius: 0.75rem; background: #2563eb; color: #fff; text-decoration: none; }
      .support { font-size: 0.9rem; color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(copy.title)}</h1>
      <p>${escapeHtml(copy.message)}</p>
      ${support}
      ${actions}
    </main>
  </body>
</html>`;
}
