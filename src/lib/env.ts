import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
});

export const env = schema.parse(process.env);
