// Client onboarding on the web: the deck renders the 18 slides and the obligation tables, the reading
// confirmation never sends an invalid CPF, the sending builds the wa.me/mailto addresses, and the audit
// actions have pt-BR labels.
import { renderToStaticMarkup } from 'react-dom/server';
import { createFormControl } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import {
  ONBOARDING_AUDIT_ACTIONS,
  buildOnboardingDocument,
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
import { openTarget, registryContact } from './components/send-onboarding-dialog';
import {
  changedTexts,
  dayBlock,
  defaultLinkMessage,
  editorSections,
  eventBlock,
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
  it('renders the 18 slides in order, with the client and the office', () => {
    const html = renderToStaticMarkup(<OnboardingDeck doc={doc()} />);
    expect(html.match(/<section /g)).toHaveLength(18);
    expect(html).toContain('id="slide-cover"');
    expect(html).toContain('id="slide-confirm"');
    expect(html).toContain('Padaria Pão Quente Ltda');
    expect(html).toContain('com a Efficio Contabilidade');
    expect(html).toContain('<b>01</b> / 18');
    expect(html).toContain('<b>18</b> / 18');
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
    expect(fiscal).toContain('Prazo legal');
    expect(fiscal).toContain('O que precisamos de você');
    expect(fiscal.indexOf('PGDAS-D e DAS')).toBeLessThan(fiscal.indexOf('Vendas no cartão e PIX'));
    expect(fiscal).toContain('dia 20 do mês seguinte');
    const personnel = html.slice(
      html.indexOf('id="slide-personnel"'),
      html.indexOf('id="slide-month"'),
    );
    expect(personnel).toContain('Folha de pagamento');
    expect(personnel).toContain('13º e informe de rendimentos');
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

  it('reads the blocks of the numbers, month and eSocial slides', () => {
    expect(numberBlock('simples-fiscal', '2 · Fiscal', 'DAS mensal')).toEqual({
      big: '2',
      label: 'Fiscal',
    });
    expect(
      numberBlock('dates', 'Suas datas no mês', 'dia 1º, dia 10, 5º dia útil e dia 20').big,
    ).toBe('4');
    expect(dayBlock('Até o 5º dia útil')).toEqual({ pre: 'Até o', big: '5º', post: 'dia útil' });
    expect(dayBlock('Dia 15')).toEqual({ pre: 'Dia', big: '15', post: '' });
    expect(whoBlock('nós enviamos o eSocial')).toEqual({
      who: 'Nós enviamos',
      what: 'o eSocial',
      office: true,
    });
    expect(eventBlock('Admissão (S-2200)')).toEqual({ name: 'Admissão', code: 'S-2200' });
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
    expect(sections).toHaveLength(19);
    expect(sections.at(-1)!.groups.some((g) => g.title === 'Folha de pagamento')).toBe(true);
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
