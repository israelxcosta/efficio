// First access of a new install: creates the owner account and its company, if missing, and prints a
// single-use link to set the password (the password-reset flow; see modules/auth/bootstrap.ts).
// No password is ever taken as an argument, stored in the code or printed.
//
//   pnpm --filter @effinance/api bootstrap:owner -- --email <e-mail> --name "<nome>" --workspace "<empresa>"
//   node dist/bootstrap-owner.js --email <e-mail> ...          (production image; docs/deploy-aws.md)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { env } from '../env';
import { configureKeyring } from '../lib/crypto/keyring';
import { AppError } from '../lib/errors';
import { bootstrapOwner, type BootstrapOwnerResult } from '../modules/auth/bootstrap';
import { PASSWORD_RESET_TTL_MS } from '../modules/auth/service';
import { createKeyProvider } from '../setup';
import { createDb, type DbExecutor } from './client';

export interface BootstrapOwnerIo {
  /** System connection (the API's login role is enough: the same writes as the sign-up). */
  db: DbExecutor;
  /** Public URL of the web app (`APP_URL`). */
  appUrl: string;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso: bootstrap:owner -- --email <e-mail> --name "<nome>" [--workspace "<empresa>"] [--reset-link]

  --email       e-mail do proprietário (obrigatório)
  --name        nome do proprietário (obrigatório para criar a conta)
  --workspace   nome do espaço empresarial criado com a conta (padrão: "Minha empresa")
  --reset-link  conta já existente: gera um novo link de definição de senha (invalida o anterior)

Cria a conta e o espaço se não existirem e imprime um link de uso único para definir a senha.
Se a conta já existir, nada é alterado.`;

const OPTIONS = {
  email: { type: 'string' },
  name: { type: 'string' },
  workspace: { type: 'string' },
  'reset-link': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
} as const;

/** Never echoes values (an operator may paste a secret by mistake): only option names. */
function argumentError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  const option = /'(-[^' ]+)/.exec(e.message ?? '')?.[1];
  switch (e.code) {
    case 'ERR_PARSE_ARGS_UNKNOWN_OPTION':
      return `Opção desconhecida: ${option ?? '(?)'}`;
    case 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE':
      return `Valor inválido ou ausente para ${option ?? 'uma opção'}`;
    case 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL':
      return 'Argumento inesperado: use as opções --email, --name, --workspace e --reset-link';
    default:
      return 'Argumentos inválidos';
  }
}

function print(result: BootstrapOwnerResult, io: BootstrapOwnerIo) {
  const minutes = Math.round(PASSWORD_RESET_TTL_MS / 60_000);
  const linkLines = (link: string) => [
    `  Abra o link abaixo para definir a senha (uso único, válido por ${minutes} minutos):`,
    link,
  ];
  if (result.status === 'created') {
    io.out(`✔ Conta do proprietário criada com o espaço empresarial "${result.workspaceName}".`);
    for (const line of linkLines(result.link)) io.out(line);
    return;
  }
  io.out('• A conta com este e-mail já existe; nada foi alterado.');
  io.out(
    result.ownedWorkspaces.length
      ? `  Espaços em que a conta é a proprietária: ${result.ownedWorkspaces.map((name) => `"${name}"`).join(', ')}.`
      : '  A conta não é proprietária de nenhum espaço.',
  );
  if (result.link) {
    io.out('✔ Novo link gerado; o anterior deixou de valer.');
    for (const line of linkLines(result.link)) io.out(line);
  } else {
    io.out('  Para gerar um novo link de definição de senha, rode de novo com --reset-link.');
  }
}

/** Returns the exit code. Expected failures (bad input, link limit) are messages, not stack traces. */
export async function runBootstrapOwner(argv: string[], io: BootstrapOwnerIo): Promise<number> {
  // `pnpm <script> -- <args>` forwards the separator.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let values: ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS }>>['values'];
  try {
    ({ values } = parseArgs({ args, options: OPTIONS, strict: true, allowPositionals: false }));
  } catch (error) {
    io.err(`✘ ${argumentError(error)}`);
    io.err(USAGE);
    return 1;
  }
  if (values.help) {
    io.out(USAGE);
    return 0;
  }
  if (!values.email) {
    io.err('✘ Informe o e-mail do proprietário (--email).');
    io.err(USAGE);
    return 1;
  }
  try {
    const result = await bootstrapOwner(
      io.db,
      { email: values.email, name: values.name, workspace: values.workspace },
      { appUrl: io.appUrl, resetLink: values['reset-link'] },
    );
    print(result, io);
    return 0;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    io.err(`✘ ${error.message}`);
    return 1;
  }
}

/** Database errors carry the query parameters in the message (e-mail, hashes): print the cause only. */
function failure(error: unknown): string {
  const e = error as { message?: string; cause?: { message?: string } } | null;
  return e?.cause?.message ?? e?.message ?? String(error);
}

async function main() {
  const { db, client } = createDb();
  try {
    // The company gets its data key (KMS in production), like a sign-up.
    configureKeyring({ provider: await createKeyProvider(env), db });
    process.exitCode = await runBootstrapOwner(process.argv.slice(2), {
      db,
      appUrl: env.APP_URL,
      out: (line) => console.log(line),
      err: (line) => console.error(line),
    });
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((error: unknown) => {
    console.error(`✘ Falha ao criar o acesso inicial: ${failure(error)}`);
    process.exitCode = 1;
  });
}
