// Client onboarding on the web: the deck renders the 19 slides and the obligation tables, the reading
// confirmation never sends an invalid CPF, the sending builds the wa.me/mailto addresses, and the audit
// actions have pt-BR labels.
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createFormControl, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import {
  ONBOARDING_AUDIT_ACTIONS,
  ONBOARDING_DEFAULT_PARAMS,
  buildOnboardingDocument,
  onboardingParamsSchema,
  type Office,
  type Client,
  type OnboardingConfirmInput,
  type OnboardingLinkCreated,
} from '@effinance/shared';
import { AUDIT_LABELS, auditLabel } from '@/features/settings/audit-labels';
import {
  ConfirmReadingForm,
  ConfirmedReading,
  confirmFormOptions,
} from './components/confirm-reading';
import { OnboardingDeck } from './components/onboarding-deck';
import {
  OnboardingParamsCard,
  type ParamsIn,
  type ParamsOut,
} from './components/onboarding-params-card';
import { paramsDefaults } from './components/onboarding-settings-tab';
import { qk } from '@/lib/query-keys';
import { openTarget, registryContact } from './components/send-onboarding-dialog';
import {
  changedTexts,
  dayBlock,
  defaultLinkMessage,
  editorSections,
  fillLinkMessage,
  mailtoUrl,
  numberBlock,
  onboardingStatus,
  safeLogo,
  whatsappUrl,
  whoBlock,
} from './onboarding-logic';

const doc = (employees = 3) =>
  buildOnboardingDocument({
    template: null,
    overrides: null,
    office: { name: 'Efficio Contabilidade', logo: null },
    client: {
      name: 'Padaria Pão Quente Ltda',
      tradeName: 'Pão Quente',
      cnpj: '11222333000181',
      taxRegime: 'simples_nacional',
      clientSince: '2026-12-01',
      employees,
      unions: ['Sindpan'],
    },
    recurring: [
      {
        catalogKey: 'pgdas_das',
        name: 'PGDAS-D e DAS',
        department: 'Fiscal',
        period: 'monthly',
        dueDay: 20,
        dueMonth: null,
        referenceOffset: 1,
      },
      {
        catalogKey: 'payroll',
        name: 'Folha de pagamento',
        department: 'Pessoal',
        period: 'monthly',
        dueDay: 5,
        dueMonth: null,
        referenceOffset: 1,
      },
    ],
    updatedAt: '2026-11-18T12:00:00Z',
    today: '2026-11-18',
  });

describe('OnboardingDeck', () => {
  it('renders the 19 slides in order, with the client and the office', () => {
    const html = renderToStaticMarkup(<OnboardingDeck doc={doc()} />);
    expect(html.match(/<section /g)).toHaveLength(19);
    expect(html).toContain('id="slide-cover"');
    expect(html).toContain('id="slide-confirm"');
    expect(html).toContain('Padaria Pão Quente Ltda');
    expect(html).toContain('com a Efficio Contabilidade');
    expect(html).toContain('<b>01</b> / 19');
    expect(html).toContain('<b>19</b> / 19');
    // Summary items jump to their part.
    expect(html).toContain('Como trabalhamos juntos');
  });

  it('renders the obligation tables: recurring tasks first, then the template rows', () => {
    const d = doc();
    const html = renderToStaticMarkup(<OnboardingDeck doc={d} />);
    const fiscal = html.slice(
      html.indexOf('id="slide-fiscal"'),
      html.indexOf('id="slide-accounting"'),
    );
    // No legal deadline: what we do · what we need · until when (internal deadline).
    expect(fiscal).not.toContain('Prazo legal');
    expect(fiscal).toContain('O que fazemos');
    expect(fiscal).toContain('O que precisamos de você');
    expect(fiscal).toContain('Até quando');
    expect(fiscal.indexOf('PGDAS-D e DAS')).toBeLessThan(fiscal.indexOf('Vendas no cartão e PIX'));
    expect(fiscal).not.toContain('dia 20');
    expect(fiscal).toContain('dia 10 do mês seguinte');
    const personnel = html.slice(
      html.indexOf('id="slide-personnel"'),
      html.indexOf('id="slide-month"'),
    );
    expect(personnel).toContain('Folha de pagamento');
    expect(personnel).toContain('13º salário');
    expect(personnel).not.toContain('dia 15');
    // A row the office does alone shows "Nada: …" and a dash in "Até quando".
    expect(personnel).toContain('Nada: fazemos a partir da folha e dos seus avisos');
    expect(personnel).toContain('ob-none');
    const month = html.slice(
      html.indexOf('id="slide-month"'),
      html.indexOf('id="slide-documents"'),
    );
    expect(month).not.toMatch(/eSocial|EFD-Reinf|DCTFWeb|PIS/);
    expect(month).toContain('vencimento');
    const notify = html.slice(html.indexOf('id="slide-esocial"'), html.indexOf('id="slide-fines"'));
    expect(notify).toContain('Quando nos avisar');
    expect(notify).toContain('3 dias úteis antes do 1º dia');
    expect(notify).toContain('5 dias antes da saída');
    expect(notify).not.toMatch(/S-2200|S-2299|10 dias após/);
    expect((personnel.match(/role="row"/g) ?? []).length).toBe(
      d.slides.find((s) => s.key === 'personnel')!.table!.length + 1,
    );
  });

  it('shows the confirmation area on the last slide only', () => {
    const html = renderToStaticMarkup(
      <OnboardingDeck doc={doc()} confirm={<p data-testid="confirm">aqui</p>} />,
    );
    expect(html.indexOf('data-testid="confirm"')).toBeGreaterThan(
      html.indexOf('id="slide-confirm"'),
    );
  });

  it('accepts only data:image logos', () => {
    expect(safeLogo('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeLogo('https://evil.example/x.png')).toBeNull();
    expect(safeLogo('javascript:alert(1)')).toBeNull();
    const html = renderToStaticMarkup(
      <OnboardingDeck
        doc={{ ...doc(), office: { ...doc().office, logo: 'https://evil.example/x.png' } }}
      />,
    );
    expect(html).not.toContain('evil.example');
  });

  it('shows the office registry logo on the cover and in the footers; without it, the Efficio wordmark', () => {
    const logo = 'data:image/png;base64,AAAA';
    const withLogo = renderToStaticMarkup(
      <OnboardingDeck doc={{ ...doc(), office: { ...doc().office, logo } }} />,
    );
    expect(withLogo).toContain('ob-logo ob-logo-lg');
    // Cover on top (big) + every other slide: hidden copy on top (phone) and the footer one.
    expect(withLogo.split(`src="${logo}"`).length - 1).toBe(1 + 18 * 2);
    expect(withLogo).not.toContain('ob-wordmark');
    const without = renderToStaticMarkup(<OnboardingDeck doc={doc()} />);
    expect(without).not.toContain('<img');
    expect(without).toContain('aria-label="Efficio"');
    expect(without).toContain('<b>efficio</b>');
  });

  it('a changed parameter reaches the deck without rewriting texts', () => {
    const d = buildOnboardingDocument({
      template: {
        params: {
          ...ONBOARDING_DEFAULT_PARAMS,
          emails: { ...ONBOARDING_DEFAULT_PARAMS.emails, personnel: 'dp@alfa.com.br' },
          deadlines: { ...ONBOARDING_DEFAULT_PARAMS.deadlines, documentsDay: 12 },
        },
        texts: {},
        hidden: [],
      },
      overrides: null,
      office: { name: 'Efficio Contabilidade', logo: null },
      client: {
        ...doc().client,
        cnpj: '11222333000181',
        taxRegime: 'simples_nacional',
        unions: [],
      },
      recurring: [],
      updatedAt: '2026-11-18T15:00:00.000Z',
      today: '2026-11-18',
    });
    const html = renderToStaticMarkup(<OnboardingDeck doc={d} />);
    expect(html).toContain('>dia 12<');
    expect(html).toContain('dp@alfa.com.br');
    expect(html).toContain('Extratos bancários 10/2026 | Padaria Pão Quente Ltda');
  });

  it('reads the blocks of the numbers, month and eSocial slides', () => {
    expect(numberBlock('simples-fiscal', '2 · Fiscal', 'DAS mensal')).toEqual({
      big: '2',
      label: 'Fiscal',
    });
    expect(numberBlock('dates', 'Suas datas no mês', 'dia 1º, dia 10 e 5º dia útil').big).toBe('3');
    expect(dayBlock('Até o 5º dia útil')).toEqual({ pre: 'Até o', big: '5º', post: 'dia útil' });
    expect(dayBlock('Dia 15')).toEqual({ pre: 'Dia', big: '15', post: '' });
    expect(whoBlock('nós enviamos o eSocial')).toEqual({
      who: 'Nós enviamos',
      what: 'o eSocial',
      office: true,
    });
    expect(dayBlock('Até o vencimento da guia')).toEqual({
      pre: 'Até o',
      big: 'vencimento',
      post: 'da guia',
    });
  });
});

describe('Confirmar leitura', () => {
  const submit = async (values: OnboardingConfirmInput) => {
    const form = createFormControl(confirmFormOptions());
    form.setValue('name', values.name);
    form.setValue('cpf', values.cpf);
    const onValid = vi.fn();
    await form.handleSubmit(onValid)();
    return { onValid, errors: form.getFieldState('cpf') };
  };

  it('does not send an invalid CPF', async () => {
    const { onValid, errors } = await submit({ name: 'Marina Albuquerque', cpf: '111.111.111-11' });
    expect(onValid).not.toHaveBeenCalled();
    expect(errors.error?.message).toBe('CPF inválido');
  });

  it('sends the name and the CPF digits when valid', async () => {
    const { onValid } = await submit({ name: 'Marina Albuquerque', cpf: '529.982.247-25' });
    expect(onValid).toHaveBeenCalledTimes(1);
    expect(onValid.mock.calls[0]![0]).toEqual({ name: 'Marina Albuquerque', cpf: '52998224725' });
  });

  it('renders labelled fields and the confirmed state', () => {
    const html = renderToStaticMarkup(<ConfirmReadingForm onConfirm={async () => {}} />);
    expect(html).toContain('Nome completo');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('Confirmar leitura');
    expect(renderToStaticMarkup(<ConfirmedReading at="2026-11-18T17:32:00Z" />)).toMatch(
      /Leitura confirmada em 18\/11\/2026 às \d\d:32/,
    );
  });
});

describe('Enviar onboarding', () => {
  const created: OnboardingLinkCreated = {
    id: 'l1',
    path: '/o/abc',
    url: 'https://app.efficio.com.br/o/abc',
    channel: 'whatsapp',
    expiresAt: '2026-12-18T12:00:00Z',
    to: '5519998765432',
    recipientName: 'Marina Albuquerque',
    message: '',
  };

  it('builds the wa.me address with the edited message and the link', () => {
    const message = defaultLinkMessage('Pão Quente', 'Efficio Contabilidade');
    expect(message).toContain('{{link}}');
    const url = openTarget(created, message, 'Onboarding');
    expect(url.startsWith('https://wa.me/5519998765432?text=')).toBe(true);
    const text = decodeURIComponent(url.split('?text=')[1]!);
    expect(text).toContain('Pão Quente com a Efficio Contabilidade');
    expect(text).toContain('https://app.efficio.com.br/o/abc');
    expect(text).not.toContain('{{link}}');
    expect(whatsappUrl('+55 (19) 99876-5432', 'Oi & tchau')).toBe(
      'https://wa.me/5519998765432?text=Oi%20%26%20tchau',
    );
  });

  it('puts the link at the end when the message has no placeholder, and builds mailto for e-mail', () => {
    expect(fillLinkMessage('Olá!', 'https://x/o/1')).toBe('Olá!\nhttps://x/o/1');
    const mail = openTarget(
      { ...created, channel: 'email', to: 'marina@padaria.com.br' },
      'Veja: {{link}}',
      'Onboarding · Pão Quente',
    );
    expect(mail).toBe(
      mailtoUrl(
        'marina@padaria.com.br',
        'Onboarding · Pão Quente',
        'Veja: https://app.efficio.com.br/o/abc',
      ),
    );
    expect(
      mail.startsWith(
        'mailto:marina@padaria.com.br?subject=Onboarding%20%C2%B7%20P%C3%A3o%20Quente&body=',
      ),
    ).toBe(true);
  });

  it('shows the registry contact of the chosen recipient', () => {
    const client = {
      phone: '1933334444',
      email: 'contato@padaria.com.br',
      responsiblePhone: '19998765432',
      responsibleEmail: null,
    } as Client;
    expect(registryContact(client, 'responsible', 'whatsapp')).toBe('(19) 99876-5432');
    expect(registryContact(client, 'company', 'email')).toBe('contato@padaria.com.br');
    expect(registryContact(client, 'responsible', 'email')).toBeNull();
  });
});

describe('history and editor', () => {
  it('derives the card status', () => {
    const empty = {
      links: [],
      accesses: { items: [], count: 0, firstAt: null, lastAt: null },
      confirmation: null,
    };
    expect(onboardingStatus(empty)).toBe('none');
    expect(onboardingStatus({ ...empty, links: [{} as never] })).toBe('sent');
    expect(
      onboardingStatus({
        ...empty,
        links: [{} as never],
        accesses: { ...empty.accesses, count: 2 },
      }),
    ).toBe('accessed');
    expect(
      onboardingStatus({ ...empty, confirmation: { linkId: 'l', name: 'M', cpf: '•', at: 'x' } }),
    ).toBe('confirmed');
  });

  it('lists every slide and the recurring tasks in the editor, and saves only what changed', () => {
    const sections = editorSections();
    expect(sections).toHaveLength(20);
    expect(sections.at(-1)!.groups.some((g) => g.title === 'Folha de pagamento')).toBe(true);
    // No "Prazo legal" field anywhere; the tables edit "O que precisamos" and "Até quando".
    const blocks = sections.flatMap((sec) => sec.groups.flatMap((g) => g.blocks));
    expect(blocks.some((b) => b.label === 'Prazo legal' || b.key.endsWith('.deadline'))).toBe(
      false,
    );
    expect(blocks.map((b) => b.key)).toEqual(
      expect.arrayContaining(['obligations.pgdas_das.due', 'fiscal.items.simples-cards.due']),
    );
    expect(blocks.map((b) => b.key)).not.toContain('obligations.esocial_periodic.due');
    expect(
      changedTexts({ 'summary.title': 'Sumário', 'team.title': 'Equipe' }, () => 'Sumário'),
    ).toEqual({ 'team.title': 'Equipe' });
  });
});

describe('audit labels', () => {
  it('translates every onboarding action', () => {
    for (const action of Object.values(ONBOARDING_AUDIT_ACTIONS))
      expect(AUDIT_LABELS[action]).toBeTruthy();
    expect(auditLabel('onboarding.confirmed')).toBe(
      'Leitura do onboarding confirmada pelo cliente',
    );
    expect(auditLabel('onboarding.link_created')).toBe('Link de onboarding enviado');
  });
});

describe('Parâmetros do onboarding', () => {
  const office = {
    registered: true,
    legalName: 'Efficio Contabilidade Ltda',
    tradeName: 'Efficio Contabilidade',
    phone: '(19) 3818-1200',
    email: 'contato@efficio.app',
    website: 'efficio.app',
    street: 'Rua A',
    number: '10',
    complement: null,
    district: 'Centro',
    city: 'Campinas',
    state: 'SP',
    logo: 'data:image/png;base64,AAAA',
  } as unknown as Office;

  function Harness({ readOnly = false }: { readOnly?: boolean }) {
    const form = useForm<ParamsIn, unknown, ParamsOut>({
      defaultValues: paramsDefaults(ONBOARDING_DEFAULT_PARAMS),
    });
    return <OnboardingParamsCard form={form} readOnly={readOnly} />;
  }
  const render = (readOnly = false) => {
    const client = new QueryClient();
    client.setQueryData(qk.office, office);
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Harness readOnly={readOnly} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('shows the registry contact read only, the owner answers and the suggestion badges', () => {
    const html = render();
    expect(html).toContain('Parâmetros do onboarding');
    expect(html).toContain('Rua A, 10 - Centro, Campinas/SP');
    expect(html).toContain('href="/configuracoes?aba=escritorio"');
    for (const label of [
      'WhatsApp de atendimento',
      'Horário de atendimento',
      'CRC',
      'Extratos bancários',
      'Rescisão',
      'Pró-labore',
      'Validade do link (dias)',
    ])
      expect(html).toContain(`>${label}</label>`);
    // Rules render from the factory values (the owner's answers).
    expect(html).toMatch(
      /aria-checked="true"[^>]*aria-label="Exame admissional agendado pelo cliente"/,
    );
    expect(html).toMatch(/aria-checked="false"[^>]*aria-label="Adiantamento quinzenal na folha"/);
    expect(html.match(/>sugestão</g)).toHaveLength(7);
    expect(render(true)).toContain('<fieldset disabled=""');
  });

  it('saves what the form holds and restores it (round trip), refusing invalid values', () => {
    const values = paramsDefaults(ONBOARDING_DEFAULT_PARAMS);
    expect(onboardingParamsSchema.parse(values)).toEqual(ONBOARDING_DEFAULT_PARAMS);
    const edited = { ...values, contact: { ...values.contact, whatsapp: '(19) 90000-0000' } };
    const saved = onboardingParamsSchema.parse(edited);
    expect(paramsDefaults(saved)).toEqual(edited);
    expect(
      onboardingParamsSchema.safeParse({
        ...values,
        deadlines: { ...values.deadlines, documentsDay: 40 },
      }).success,
    ).toBe(false);
  });
});
