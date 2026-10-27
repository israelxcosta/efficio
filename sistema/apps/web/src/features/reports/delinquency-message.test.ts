import { describe, expect, it } from 'vitest';
import {
  buildCollectionMessage,
  groupByMonth,
  collectionLine,
  collectionName,
  competenceOf,
  greeting,
  hasOwnCompetence,
  whatsappHref,
  whatsappNumber,
} from './delinquency-message';

const at = (hour: number, minute = 0) => new Date(2026, 1, 20, hour, minute);

describe('greeting', () => {
  it('follows the local time of day', () => {
    expect(greeting(at(5))).toBe('Bom dia');
    expect(greeting(at(11, 59))).toBe('Bom dia');
    expect(greeting(at(12))).toBe('Boa tarde');
    expect(greeting(at(17, 59))).toBe('Boa tarde');
    expect(greeting(at(18))).toBe('Boa noite');
    expect(greeting(at(0, 30))).toBe('Boa noite');
    expect(greeting(at(4, 59))).toBe('Boa noite');
  });
});

describe('competenceOf', () => {
  it('defaults to the month before the due date', () => {
    expect(competenceOf({ date: '2026-01-15' })).toBe('12/2025');
    expect(competenceOf({ date: '2026-02-15', competence: null }, 'previous')).toBe('01/2026');
  });

  it('can use the due month itself', () => {
    expect(competenceOf({ date: '2026-01-15' }, 'due')).toBe('01/2026');
    expect(competenceOf({ date: '2025-12-31', competence: undefined }, 'due')).toBe('12/2025');
  });

  it('uses the competence of generated fees whatever the mode', () => {
    expect(competenceOf({ date: '2026-03-10', competence: '2026-01' })).toBe('01/2026');
    expect(competenceOf({ date: '2026-03-10', competence: '2026-01' }, 'due')).toBe('01/2026');
  });

  it('ignores a malformed competence', () => {
    expect(competenceOf({ date: '2026-03-10', competence: '2026-13' })).toBe('02/2026');
    expect(competenceOf({ date: '2026-03-10', competence: '' }, 'due')).toBe('03/2026');
  });
});

describe('hasOwnCompetence', () => {
  it('is true only for a valid month key', () => {
    expect(hasOwnCompetence({ competence: '2026-01' })).toBe(true);
    expect(hasOwnCompetence({ competence: null })).toBe(false);
    expect(hasOwnCompetence({})).toBe(false);
  });
});

describe('collectionLine', () => {
  it('formats competence, amount and due date like the model', () => {
    expect(collectionLine({ date: '2026-01-15', amount: 35000 })).toBe('• 12/2025 | R$ 350,00 | Venc 15/01/2026');
    expect(collectionLine({ date: '2026-02-15', amount: 123456 }, 'due')).toBe('• 02/2026 | R$ 1.234,56 | Venc 15/02/2026');
  });
});

describe('collectionName', () => {
  it('prefers the trade name and falls back to the razão social', () => {
    expect(collectionName({ name: 'Padaria Pão Quente LTDA', tradeName: 'Pão Quente' })).toBe('Pão Quente');
    expect(collectionName({ name: 'Padaria Pão Quente LTDA', tradeName: '  ' })).toBe('Padaria Pão Quente LTDA');
    expect(collectionName({ name: 'Padaria Pão Quente LTDA', tradeName: null })).toBe('Padaria Pão Quente LTDA');
  });
});

describe('buildCollectionMessage', () => {
  it('reproduces the standard model (with the greeting fixed by the time of day)', () => {
    const text = buildCollectionMessage({
      clientName: 'Pão Quente',
      // Out of order on purpose: lines go oldest first.
      items: [
        { date: '2026-02-15', amount: 37800 },
        { date: '2026-01-15', amount: 35000 },
      ],
      signature: 'Efficio Contabilidade',
      now: at(9),
    });
    expect(text).toBe(
      [
        'Bom dia, Pão Quente',
        '',
        'Até o momento, não identificamos o pagamento dos honorários relacionados abaixo. Solicitamos, por gentileza, que o pagamento seja realizado com a maior brevidade possível.',
        '',
        '• 12/2025 | R$ 350,00 | Venc 15/01/2026',
        '• 01/2026 | R$ 378,00 | Venc 15/02/2026',
        '',
        'Caso o pagamento já tenha sido efetuado, solicitamos, por gentileza, o envio do comprovante para atualização em nosso sistema.',
        '',
        'Atenciosamente,',
        'Efficio Contabilidade',
      ].join('\n'),
    );
  });

  it('mixes generated fees (own competence) with other receivables (toggle)', () => {
    const text = buildCollectionMessage({
      clientName: 'ACME',
      items: [
        { date: '2026-02-20', amount: 40000, competence: '2026-02' },
        { date: '2026-01-15', amount: 35000, competence: null },
      ],
      signature: 'Escritório',
      now: at(9),
      competence: 'previous',
    });
    expect(text).toContain('• 12/2025 | R$ 350,00 | Venc 15/01/2026\n• 02/2026 | R$ 400,00 | Venc 20/02/2026');
  });

  it('uses the chosen competence and greeting', () => {
    const text = buildCollectionMessage({
      clientName: 'ACME',
      items: [{ date: '2026-03-10', amount: 50000 }],
      signature: 'Escritório',
      now: at(19),
      competence: 'due',
    });
    expect(text.startsWith('Boa noite, ACME\n\n')).toBe(true);
    expect(text).toContain('• 03/2026 | R$ 500,00 | Venc 10/03/2026');
  });

  it('ends with the closing alone when there is no signature', () => {
    const text = buildCollectionMessage({ clientName: 'ACME', items: [], signature: ' ', now: at(14) });
    expect(text.endsWith('Atenciosamente,')).toBe(true);
    expect(text.startsWith('Boa tarde, ACME')).toBe(true);
  });
});

describe('whatsappNumber / whatsappHref', () => {
  it('adds the country code only when missing', () => {
    expect(whatsappNumber('(11) 98765-4321')).toBe('5511987654321');
    expect(whatsappNumber('(11) 3456-7890')).toBe('551134567890');
    expect(whatsappNumber('+55 (11) 98765-4321')).toBe('5511987654321');
    expect(whatsappNumber('55 11 3456-7890')).toBe('551134567890');
    // DDD 55 (RS) without the country code still gets it.
    expect(whatsappNumber('(55) 99876-5432')).toBe('5555998765432');
    expect(whatsappNumber('011 98765-4321')).toBe('5511987654321');
  });

  it('refuses numbers that cannot be a Brazilian phone', () => {
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber('1 212 555 0100')).toBeNull();
  });

  it('builds a wa.me link with only digits and the encoded text', () => {
    const href = whatsappHref('(11) 98765-4321', 'Bom dia, A&B\n• 12/2025 | R$ 350,00');
    expect(href).toBe('https://wa.me/5511987654321?text=Bom%20dia%2C%20A%26B%0A%E2%80%A2%2012%2F2025%20%7C%20R%24%20350%2C00');
    expect(whatsappHref('javascript:alert(1)', 'x')).toBeNull();
    expect(whatsappHref('11987654321?text=evil', 'x')).toBe('https://wa.me/5511987654321?text=x');
  });
});

describe('groupByMonth', () => {
  it('sums the fee and its employee charge of the same month into one line', () => {
    const items = [
      { date: '2026-10-10', amount: 480000, competence: '2026-09' },
      { date: '2026-10-10', amount: 65000, competence: '2026-09' },
      { date: '2026-09-10', amount: 480000, competence: '2026-08' },
    ];
    expect(groupByMonth(items).map((i) => collectionLine(i))).toEqual([
      '• 08/2026 | R$ 4.800,00 | Venc 10/09/2026',
      '• 09/2026 | R$ 5.450,00 | Venc 10/10/2026',
    ]);
  });

  it('keeps different due dates apart', () => {
    expect(groupByMonth([{ date: '2026-01-15', amount: 100 }, { date: '2026-01-20', amount: 200 }])).toHaveLength(2);
  });
});
