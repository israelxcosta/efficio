import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Defina DATABASE_URL.");

const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client`insert into configuracoes (id) values (1) on conflict do nothing`;
await client.end();
console.log("Banco de dados atualizado.");
