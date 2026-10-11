import { admin, customSession } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";
import { UserRole } from "@prisma/client";
import { VerifyEmail } from "@emails/VerifyEmail";

import { betterAuthTrustedOrigins } from "./trusted-origins";
import { isSsoUserCreateAllowed } from "./sso-user-create-context";
import { PUBLIC_SIGNUP_DISABLED } from "./public-signup-guard";
import { getConfiguredPeptideOsSettingsUrl } from "./configured-peptideos-signup";
import {
  shouldAllowBetterAuthUserCreate,
  shouldAllowCredentialAccountCreate,
  shouldAllowOAuthNewUser
} from "./block-public-signup";

import { prisma } from "@/shared/lib/prisma";
import { sendEmail } from "@/shared/lib/mail/sendEmail";
import { SiteConfig } from "@/shared/config/site-config";
import { queryPeptideosHasEmailIdentity, peptideosHasEmailIdentity } from "@/features/update-password/lib/peptideos-has-email-identity";
import { PEPTIDEOS_PROVIDER_ID, resolvePasswordChangeKind } from "@/features/update-password/lib/password-change-entry";
import { hashStringWithSalt } from "@/features/update-password/lib/hash";
import { env } from "@/env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: betterAuthTrustedOrigins(env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL),
  account: {
    // PR #1: never attach a new identity to an existing user by email match.
    accountLinking: {
      enabled: false,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const isSsoContext = isSsoUserCreateAllowed();
          if (!shouldAllowBetterAuthUserCreate(isSsoContext) || !shouldAllowOAuthNewUser(isSsoContext)) {
            throw new Error(PUBLIC_SIGNUP_DISABLED);
          }
          return { data: user };
        },
      },
    },
    account: {
      create: {
        before: async (account) => {
          if (!shouldAllowCredentialAccountCreate(account.providerId, isSsoUserCreateAllowed())) {
            throw new Error(PUBLIC_SIGNUP_DISABLED);
          }
          return { data: account };
        },
      },
    },
  },
  plugins: [
    admin(),
    customSession(async ({ user, session }) => {
      console.log("⛏️ customSession executed - fetched from DB - whole user and session data is this ->> \n");
      const userFromDB = await prisma.user.findUnique({
        where: {
          id: user.id,
        },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          name: true,
          firstName: true,
          lastName: true,
          image: true,
          locale: true,
          role: true,
          banned: true,
          banReason: true,
          banExpires: true,
          isPremium: true,
          accounts: {
            select: { providerId: true, accountId: true },
          },
        },
      });

      if (userFromDB == null) {
        return { user: null, session };
      }

      const peptideosAccount = userFromDB.accounts.find((account) => account.providerId === PEPTIDEOS_PROVIDER_ID);
      const hasEmailIdentity = peptideosAccount
        ? await peptideosHasEmailIdentity(peptideosAccount.accountId, queryPeptideosHasEmailIdentity)
        : null;
      const passwordChange = resolvePasswordChangeKind({
        accounts: userFromDB.accounts,
        hasEmailIdentity,
        peptideosSettingsUrl: getConfiguredPeptideOsSettingsUrl("/profile")
      });

      return {
        user: {
          ...userFromDB,
          isPremium: SiteConfig.allPremiumFeaturesFree ? true : userFromDB.isPremium,
          accounts: userFromDB.accounts.map((account) => ({ providerId: account.providerId })),
          passwordChange
        },
        session,
      };
    }),
    nextCookies(),
  ],
  user: {
    additionalFields: {
      email: {
        type: "string",
      },
      name: {
        type: "string",
      },
      role: {
        type: "string",
      },
      firstName: {
        type: "string",
      },
      lastName: {
        type: "string",
      },
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignUp: false, // FIXME: TEMPORARY
    sendVerificationEmail: async ({ user, url }, _req) => {
      try {
        const urlObject = new URL(url);
        const params = new URLSearchParams(urlObject.search);
        params.set("callbackURL", "/");

        // reconstruction
        urlObject.search = params.toString();
        const finalUrl = urlObject.toString();

        await sendEmail({
          to: user.email,
          subject: "Verify your email address",
          text: `Click the link to verify your email: ${finalUrl}`,
          react: VerifyEmail({ url: finalUrl }),
        });
      } catch (error) {
        console.error("Error sending verification email:", error);
      }
    },
  },
  emailAndPassword: {
    requireEmailVerification: false, // FIXME: TEMPORARY
    password: {
      hash: async (password: string) => {
        const hashedPassword = hashStringWithSalt(password, env.BETTER_AUTH_SECRET);
        return hashedPassword;
      },
      verify: async ({ password, hash }) => {
        const hashedPassword = hashStringWithSalt(password, env.BETTER_AUTH_SECRET);
        return hashedPassword === hash;
      },
    },
    enabled: true,
  },
  socialProviders: {
    google: {
      enabled: false,
      disableSignUp: true,
      disableImplicitSignUp: true,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      mapProfileToUser: async (profile) => {
        return {
          ...profile,
          email: profile.email,
          firstName: profile.given_name,
          lastName: profile.family_name,
          role: UserRole.user,
        };
      },
    },
  },
});
