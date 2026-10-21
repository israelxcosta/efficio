// Company data from the Receita Federal by CNPJ (public registry). The services only see the
// normalized `CnpjLookupResult` of the shared contract.

import type { CnpjLookupResult } from '@effinance/shared';

export interface CnpjProvider {
  readonly name: 'brasilapi' | 'fake';
  /** `cnpj`: 14 valid digits. Null when the Receita has no company with it. */
  lookup(cnpj: string): Promise<CnpjLookupResult | null>;
}

/** The registry could not be reached or answered something unusable. */
export class CnpjProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'CnpjProviderError';
  }
}
