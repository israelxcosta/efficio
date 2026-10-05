import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { configuracoes } from "@/db/schema";

export async function obterConfiguracoes() {
  const [c] = await db.select().from(configuracoes).where(eq(configuracoes.id, 1));
  if (c) return c;
  const [criada] = await db.insert(configuracoes).values({ id: 1 }).onConflictDoNothing().returning();
  return criada ?? (await db.select().from(configuracoes).where(eq(configuracoes.id, 1)))[0];
}
