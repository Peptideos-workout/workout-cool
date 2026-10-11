import { Heading, Hr, Section, Text } from "@react-email/components";

import { BaseEmailLayout } from "./utils/BaseEmailLayout";

import { SiteConfig } from "@/shared/config/site-config";


export const AccountsLinkedEmail = () => (
  <BaseEmailLayout previewText={`Your PeptideOS and ${SiteConfig.title} accounts were linked`}>
    <Heading className="mb-6 text-center text-2xl font-semibold text-gray-900">Accounts linked</Heading>

    <Section>
      <Text className="text-text text-base leading-relaxed">Hello,</Text>
      <Text className="text-text text-base leading-relaxed">
        Your PeptideOS account is now linked to your {SiteConfig.title} account. You can sign in from PeptideOS without creating a second
        workout profile.
      </Text>
      <Text className="text-text text-base leading-relaxed">
        If you did not link these accounts, reset your password and contact support.
      </Text>
    </Section>

    <Hr className="my-6 border-t" />
  </BaseEmailLayout>
);
