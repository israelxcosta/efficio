// Mercado Pago subscriptions (Assinaturas / preapproval API) over plain fetch.

import { PLANS, type PlanCode } from '@effinance/shared';
import { UnauthorizedError } from '../../../lib/errors';
import type {
  BillingProvider,
  CheckoutRequest,
  CheckoutResult,
  ProviderStatus,
  ProviderSubscription,
  WebhookEvent,
  WebhookInput,
} from './types';
import { parseSignatureHeader, SIGNATURE_TOLERANCE_MS, verifySignature } from './signature';

const API = 'https://api.mercadopago.com';

interface PreapprovalResponse {
  id: string;
  status: string;
  external_reference?: string | null;
  next_payment_date?: string | null;
  init_point?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
  } | null;
}

/** Checkout links we redirect users to: https on Mercado Pago's own domains only. */
export function isMercadoPagoCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br)?$/i.test(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** The plan a preapproval charges for (BRL amount + billing frequency), or null. */
export function planForCharge(auto: PreapprovalResponse['auto_recurring']): PlanCode | null {
  if (!auto || auto.currency_id !== 'BRL' || auto.frequency_type !== 'months' || typeof auto.transaction_amount !== 'number') {
    return null;
  }
  const cents = Math.round(auto.transaction_amount * 100);
  const months = auto.frequency;
  const plan = PLANS.find((p) => p.priceCents === cents && (p.interval === 'year' ? 12 : 1) === months);
  return plan?.code ?? null;
}

function header(headers: WebhookInput['headers'], name: string): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function asStatus(value: string): ProviderStatus {
  return value === 'authorized' || value === 'paused' || value === 'cancelled' ? value : 'pending';
}

/** Signed deliveries remembered (each for the signature's validity) to refuse their replays. */
const MAX_REMEMBERED_SIGNATURES = 10_000;

export class MercadoPagoProvider implements BillingProvider {
  readonly name = 'mercadopago' as const;
  /**
   * `v1` of the deliveries already accepted → when it stops being valid. Only `data.id`, `x-request-id`
   * and `ts` are signed: a replay inside the window may change the body (its `id`, the idempotency key)
   * and must still count as the same delivery. In memory: one API instance (VPS); behind several
   * instances a replay could reach another one, where it is re-processed (idempotent: re-fetched).
   */
  private readonly seen = new Map<string, number>();

  private rememberSignature(v1: string, now: number): boolean {
    for (const [key, until] of this.seen) {
      if (until > now && this.seen.size < MAX_REMEMBERED_SIGNATURES) break;
      this.seen.delete(key);
    }
    if ((this.seen.get(v1) ?? 0) > now) return false;
    this.seen.set(v1, now + 2 * SIGNATURE_TOLERANCE_MS);
    return true;
  }

  constructor(
    private readonly options: {
      accessToken: string;
      webhookSecret: string;
      /** Injected in tests. */
      fetch?: typeof fetch;
      now?: () => number;
    },
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const doFetch = this.options.fetch ?? fetch;
    const res = await doFetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.accessToken}`,
        'content-type': 'application/json',
        ...(method === 'POST' ? { 'x-idempotency-key': globalThis.crypto.randomUUID() } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Mercado Pago ${method} ${path} respondeu ${res.status}`);
    return (await res.json()) as T;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const out = await this.request<PreapprovalResponse>('POST', '/preapproval', {
      reason: `Efficio ${req.plan.name}`,
      external_reference: req.workspaceId,
      payer_email: req.payerEmail,
      back_url: req.backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: req.plan.interval === 'year' ? 12 : 1,
        frequency_type: 'months',
        transaction_amount: req.plan.priceCents / 100,
        currency_id: 'BRL',
      },
    });
    if (!out.init_point) throw new Error('Mercado Pago não retornou o link de pagamento');
    // The browser is sent there: never to anything else, whatever the API (or a proxy) answered.
    if (!isMercadoPagoCheckoutUrl(out.init_point)) throw new Error('Mercado Pago retornou um link de pagamento inesperado');
    return { checkoutUrl: out.init_point, providerSubscriptionId: out.id };
  }

  async getSubscription(id: string): Promise<ProviderSubscription> {
    const out = await this.request<PreapprovalResponse>('GET', `/preapproval/${encodeURIComponent(id)}`);
    return {
      id: out.id,
      status: asStatus(out.status),
      externalReference: out.external_reference ?? null,
      nextPaymentDate: out.next_payment_date ? new Date(out.next_payment_date) : null,
      planCode: planForCharge(out.auto_recurring),
    };
  }

  async cancel(id: string): Promise<void> {
    await this.request('PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' });
  }

  async parseWebhook(input: WebhookInput): Promise<WebhookEvent> {
    const body = (input.body ?? {}) as { id?: string | number; type?: string; topic?: string; data?: { id?: string | number } };
    const queryId = input.query['data.id'] ?? input.query.id;
    const dataId = String(queryId ?? body.data?.id ?? '') || null;
    const type = String(input.query.type ?? body.type ?? input.query.topic ?? body.topic ?? 'unknown');
    const requestId = header(input.headers, 'x-request-id');

    const valid = await verifySignature({
      header: header(input.headers, 'x-signature') ?? undefined,
      requestId,
      dataId,
      secret: this.options.webhookSecret,
      now: this.options.now?.(),
    });
    if (!valid) throw new UnauthorizedError('Assinatura do webhook inválida');
    const signature = parseSignatureHeader(header(input.headers, 'x-signature') ?? undefined)!;
    const fresh = this.rememberSignature(signature.v1.toLowerCase(), this.options.now?.() ?? Date.now());

    const eventId = body.id !== undefined ? String(body.id) : `${type}:${dataId}:${requestId}`;
    if (!fresh) return { eventId, type, subscriptionId: null, replay: true };
    return { eventId, type, subscriptionId: dataId ? await this.subscriptionIdFor(type, dataId) : null };
  }

  /** Maps a notification to the preapproval it concerns. */
  private async subscriptionIdFor(type: string, dataId: string): Promise<string | null> {
    if (type === 'subscription_preapproval' || type === 'preapproval') return dataId;
    if (type === 'subscription_authorized_payment') {
      const payment = await this.request<{ preapproval_id?: string }>('GET', `/authorized_payments/${encodeURIComponent(dataId)}`);
      return payment.preapproval_id ?? null;
    }
    if (type === 'payment') {
      const payment = await this.request<{ metadata?: { preapproval_id?: string } }>(
        'GET',
        `/v1/payments/${encodeURIComponent(dataId)}`,
      );
      return payment.metadata?.preapproval_id ?? null;
    }
    return null;
  }
}
