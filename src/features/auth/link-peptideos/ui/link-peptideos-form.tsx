"use client";

import { useForm } from "react-hook-form";
import { useI18n } from "locales/client";
import { zodResolver } from "@hookform/resolvers/zod";

import { linkPeptideosSchema, LinkPeptideosSchema } from "@/features/auth/link-peptideos/schema/link-peptideos.schema";
import { useLinkPeptideos } from "@/features/auth/link-peptideos/model/useLinkPeptideos";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LinkPeptideosFormProps {
  maskedEmail?: string;
  expired: boolean;
}

export function LinkPeptideosForm({ maskedEmail, expired }: LinkPeptideosFormProps) {
  const t = useI18n();
  const { isSubmitting, errorMessage, linkAccount } = useLinkPeptideos();
  const form = useForm<LinkPeptideosSchema>({
    resolver: zodResolver(linkPeptideosSchema),
    defaultValues: { password: "" }
  });

  if (expired) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("commons.link_peptideos_title")}</h1>
        </div>
        <Alert variant="error">
          <AlertDescription>{t("commons.link_peptideos_expired")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const onSubmit = async (data: LinkPeptideosSchema) => {
    await linkAccount(data.password);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("commons.link_peptideos_title")}</h1>
        <p className="text-muted-foreground text-sm">{t("commons.link_peptideos_subtitle", { email: maskedEmail ?? "***" })}</p>
      </div>

      {errorMessage && (
        <Alert variant="error">
          <AlertDescription>{t("commons.link_peptideos_error")}</AlertDescription>
        </Alert>
      )}

      <Form form={form} onSubmit={onSubmit}>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("commons.password")}</FormLabel>
              <FormControl>
                <Input autoComplete="current-password" type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button className="mt-6 w-full" disabled={isSubmitting} size="large" type="submit">
          {isSubmitting ? t("commons.connecting") : t("commons.link_peptideos_submit")}
        </Button>
      </Form>
    </div>
  );
}
