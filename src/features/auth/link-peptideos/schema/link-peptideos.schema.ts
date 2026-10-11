import { z } from "zod";

export const linkPeptideosSchema = z.object({
  password: z.string().min(6)
});

export type LinkPeptideosSchema = z.infer<typeof linkPeptideosSchema>;
