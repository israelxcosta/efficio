export const somenteDigitos = (v: string) => v.replace(/\D/g, "");

/** Remove máscara e deixa em maiúsculas (CNPJ alfanumérico). */
export const normalizarCnpj = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

export function validarCpf(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

/**
 * Valida CNPJ numérico ou alfanumérico (IN RFB 2.229/2024, em vigor desde
 * julho de 2026). Cada caractere vale seu código ASCII menos 48; os dois
 * dígitos verificadores continuam numéricos.
 */
export function validarCnpj(valor: string): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const dv = (n: number) => {
    let soma = 0;
    let peso = 2;
    for (let i = n - 1; i >= 0; i--) {
      soma += (cnpj.charCodeAt(i) - 48) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

export function validarPis(valor: string): boolean {
  const pis = somenteDigitos(valor);
  if (pis.length !== 11 || /^(\d)\1{10}$/.test(pis)) return false;
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((s, p, i) => s + p * Number(pis[i]), 0);
  const resto = 11 - (soma % 11);
  return (resto >= 10 ? 0 : resto) === Number(pis[10]);
}

export function formatarCnpj(v: string): string {
  const c = normalizarCnpj(v);
  if (c.length !== 14) return v;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

export function formatarCpf(v: string): string {
  const c = somenteDigitos(v);
  if (c.length !== 11) return v;
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

export function formatarPis(v: string): string {
  const c = somenteDigitos(v);
  if (c.length !== 11) return v;
  return `${c.slice(0, 3)}.${c.slice(3, 8)}.${c.slice(8, 10)}-${c.slice(10)}`;
}
