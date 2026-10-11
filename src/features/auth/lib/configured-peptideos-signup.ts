import {
  peptideOsOrigin,
  peptideOsWorkoutsSignoutActionUrl,
  peptideOsWorkoutsSignoutHomeRedirect,
  resolvePeptideOsForgotPasswordUrl,
  resolvePeptideOsLoginUrl,
  resolvePeptideOsSettingsUrl,
  resolvePeptideOsSignupUrl,
  resolvePeptideOsWorkoutsSignoutUrl,
  resolvePeptideOsWorkoutsSsoUrl
} from "./peptideos-signup-url";

import { env } from "@/env";

export function getConfiguredPeptideOsSignupUrl(returnTo?: string): string {
  return resolvePeptideOsSignupUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL, returnTo);
}

export function getConfiguredPeptideOsLoginUrl(returnTo?: string): string {
  return resolvePeptideOsLoginUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL, returnTo);
}

export function getConfiguredPeptideOsForgotPasswordUrl(): string {
  return resolvePeptideOsForgotPasswordUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL);
}

export function getConfiguredPeptideOsSettingsUrl(returnTo?: string): string {
  return resolvePeptideOsSettingsUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL, returnTo);
}

export function getConfiguredPeptideOsWorkoutsSsoUrl(returnTo?: string): string {
  return resolvePeptideOsWorkoutsSsoUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL, returnTo);
}

export function getConfiguredPeptideOsWorkoutsSignoutUrl(): string {
  return resolvePeptideOsWorkoutsSignoutUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL);
}

export function getConfiguredPeptideOsWorkoutsSignoutActionUrl(): string {
  return peptideOsWorkoutsSignoutActionUrl(peptideOsOrigin(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL));
}

export function getConfiguredPeptideOsWorkoutsSignoutHomeRedirect(): string {
  return peptideOsWorkoutsSignoutHomeRedirect(env.NEXT_PUBLIC_APP_URL);
}

export function getConfiguredPeptideOsOrigin(): string {
  return peptideOsOrigin(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL);
}
