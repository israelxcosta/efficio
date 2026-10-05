// Política de senha alinhada ao NIST SP 800-63B: comprimento mínimo
// alto, sem exigir combinações arbitrárias de caracteres.
export function validarSenhaForte(senha: string): string | null {
  if (senha.length < 12) return "A senha precisa ter pelo menos 12 caracteres.";
  if (senha.length > 128) return "A senha pode ter no máximo 128 caracteres.";
  if (/^(.)\1+$/.test(senha)) return "A senha não pode repetir um único caractere.";
  return null;
}
