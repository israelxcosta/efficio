import { hash, verify } from "@node-rs/argon2";

// Parâmetros recomendados pela OWASP para Argon2id (19 MiB, 2 iterações).
const OPCOES = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES);
}

export async function verificarSenha(hashSalvo: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashSalvo, senha);
  } catch {
    return false;
  }
}

// Hash usado para gastar o mesmo tempo quando o e-mail não existe,
// evitando que a resposta revele quais e-mails estão cadastrados.
let hashFicticio: Promise<string> | null = null;
export function obterHashFicticio(): Promise<string> {
  hashFicticio ??= gerarHashSenha(crypto.randomUUID());
  return hashFicticio;
}
