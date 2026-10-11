export interface LinkedEmailPayload {
  to: string;
  subject: string;
  text: string;
}

export function isEmailInfraConfigured(smtp: { SMTP_HOST?: string; SMTP_FROM?: string }): boolean {
  return Boolean(smtp.SMTP_HOST && smtp.SMTP_FROM);
}

/**
 * TODO: send "your accounts were linked" when SMTP_HOST and SMTP_FROM are configured.
 * Until then this is a no-op so local/preview deploys do not fail closed.
 */
export async function sendAccountsLinkedEmail(deps: {
  to: string;
  isConfigured: boolean;
  send: (payload: LinkedEmailPayload) => Promise<unknown>;
}): Promise<"sent" | "skipped"> {
  if (!deps.isConfigured) {
    return "skipped";
  }

  await deps.send({
    to: deps.to,
    subject: "Your PeptideOS and workout.cool accounts were linked",
    text: "Your PeptideOS account is now linked to your workout.cool account. If you did not do this, reset your password and contact support."
  });
  return "sent";
}
