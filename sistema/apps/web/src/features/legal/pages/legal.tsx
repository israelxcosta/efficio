import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { GRACE_DAYS, TRIAL_DAYS } from '@effinance/shared';

interface Section {
  title: string;
  paragraphs: string[];
}

const TERMS_UPDATED_AT = '20/10/2026';
/** Onboarding, operators and retention as the system does them (docs/security/privacidade-lgpd-2026-11-19.md). */
const PRIVACY_UPDATED_AT = '20/11/2026';

const TERMS: Section[] = [
  {
    title: '1. O serviço',
    paragraphs: [
      'O Efficio é um sistema on-line de gestão financeira empresarial: contas, cartões, contas a pagar e a receber, metas, contatos e relatórios.',
      'O Efficio não é instituição financeira, não movimenta dinheiro e não presta consultoria de investimentos. As informações e projeções exibidas são estimativas baseadas nos dados que você cadastra.',
    ],
  },
  {
    title: '2. Conta e segurança',
    paragraphs: [
      'Você é responsável pelas informações cadastradas e por manter sua senha em sigilo. Recomendamos ativar a verificação em duas etapas.',
      'Cada empresa cadastrada tem um proprietário, que define quem participa e com qual permissão (editor ou leitor).',
    ],
  },
  {
    title: '3. Assinatura, teste e pagamento',
    paragraphs: [
      `Novos espaços têm ${TRIAL_DAYS} dias de teste grátis, sem cartão. Depois disso, é necessário assinar um plano para continuar criando e editando dados; a consulta e a exportação continuam disponíveis.`,
      'Os pagamentos são processados pelo Mercado Pago, em cobrança recorrente mensal ou anual conforme o plano. O Efficio não armazena dados de cartão.',
      `Se um pagamento falhar, o espaço mantém acesso completo por ${GRACE_DAYS} dias enquanto a cobrança é refeita. Você pode cancelar a qualquer momento; o acesso segue até o fim do período já pago.`,
    ],
  },
  {
    title: '4. Uso aceitável',
    paragraphs: [
      'É proibido usar o serviço para fins ilícitos, tentar acessar dados de outros usuários, sobrecarregar a infraestrutura ou contornar mecanismos de segurança.',
    ],
  },
  {
    title: '5. Encerramento',
    paragraphs: [
      'Você pode excluir um espaço ou a sua conta nas Configurações. A exclusão é definitiva: os dados e as chaves de criptografia do espaço são destruídos.',
      'Podemos suspender contas que violem estes termos, com aviso prévio sempre que possível.',
    ],
  },
  {
    title: '6. Limitação de responsabilidade',
    paragraphs: [
      'O serviço é oferecido com esforço contínuo de disponibilidade e segurança, mas pode passar por interrupções. Não nos responsabilizamos por decisões financeiras tomadas com base nas informações exibidas.',
    ],
  },
  {
    title: '7. Alterações e foro',
    paragraphs: [
      'Avisaremos com antecedência sobre mudanças relevantes nestes termos. Fica eleito o foro do domicílio do consumidor, nos termos do Código de Defesa do Consumidor.',
    ],
  },
];

const PRIVACY: Section[] = [
  {
    title: '1. Quem somos e a quem esta política se aplica',
    paragraphs: [
      'Esta política explica como os dados pessoais são tratados no Efficio, sistema usado pelo escritório de contabilidade que opera esta instalação ("Escritório"), conforme a Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018, "LGPD").',
      'O Escritório é o controlador dos dados: decide para que e como eles são tratados. Sua razão social, CNPJ e endereço constam do contrato de prestação de serviços, das propostas e dos documentos que ele envia aos clientes.',
      'Ela vale para quem usa o sistema (sócios e equipe do Escritório), para os clientes do Escritório e para as pessoas cujos dados os clientes entregam ao Escritório para a prestação dos serviços contábeis, fiscais e trabalhistas (sócios, responsáveis, empregados e dependentes).',
    ],
  },
  {
    title: '2. Canal de privacidade e encarregado',
    paragraphs: [
      'Dúvidas e pedidos sobre dados pessoais podem ser enviados ao e-mail de atendimento do Escritório, com o assunto "Privacidade – LGPD".',
      'Quando o Escritório se enquadra como agente de tratamento de pequeno porte (Resolução CD/ANPD nº 2/2022), a indicação de encarregado (DPO) é dispensada e esse canal cumpre a função. Quando houver encarregado indicado, seu nome e contato são informados pelo mesmo canal e no contrato.',
    ],
  },
  {
    title: '3. Dados que tratamos',
    paragraphs: [
      'Conta de acesso: nome, e-mail, senha (guardada apenas como hash, nunca em texto legível), foto opcional e configurações de segurança (verificação em duas etapas).',
      'Clientes e contatos: razão social ou nome, CPF/CNPJ, e-mail, telefone, endereço, dados do responsável, regime tributário, honorários, contratos, documentos, certidões e anotações de atendimento.',
      'Dados para a prestação dos serviços: informações financeiras, fiscais e contábeis da empresa cliente e, no departamento pessoal, dados de sócios, empregados e dependentes exigidos pela legislação (por exemplo, para folha de pagamento e eSocial). Atestados e exames ocupacionais podem conter dados de saúde, que são dados sensíveis e só são tratados para cumprir obrigação legal ou regulatória.',
      'Dados técnicos de segurança: endereço IP truncado (os últimos dígitos são descartados), um resumo do navegador e do aparelho e as datas de acesso das sessões e das ações registradas na auditoria.',
      'Onboarding de clientes: quando o Escritório envia o onboarding, guardamos (cifrados) o nome e o telefone ou e-mail de quem recebeu o link. Cada abertura registra data e hora, o tipo de aparelho, o navegador e o sistema (resumidos) e o IP truncado. Não registramos a localização. Ao confirmar a leitura, guardamos o nome e o CPF informados (cifrados), a data e hora, o IP truncado e o resumo do navegador, para comprovar a ciência das orientações. O link vale pelo prazo definido pelo Escritório (30 dias por padrão, no máximo 90) e pode ser revogado a qualquer momento.',
    ],
  },
  {
    title: '4. Para que usamos e com que base legal',
    paragraphs: [
      'Prestar os serviços contratados e manter o relacionamento com o cliente (execução de contrato, art. 7º, V).',
      'Cumprir obrigações legais e regulatórias contábeis, fiscais, trabalhistas e previdenciárias, como escrituração, declarações, folha de pagamento e eSocial, e guardar os documentos pelos prazos legais (obrigação legal, art. 7º, II, e art. 11, II, "a", para dados sensíveis).',
      'Proteger as contas, prevenir fraudes e acessos indevidos e manter registros de auditoria (legítimo interesse e segurança, art. 7º, IX, e garantia de prevenção à fraude, art. 11, II, "g").',
      'Defender direitos em processos administrativos, judiciais ou arbitrais (exercício regular de direitos, art. 7º, VI).',
      'Não vendemos dados, não os usamos para publicidade e não fazemos decisões automatizadas que afetem os titulares.',
    ],
  },
  {
    title: '5. Com quem compartilhamos',
    paragraphs: [
      'Somente com operadores necessários ao funcionamento do sistema, que tratam os dados conforme as instruções do Escritório: a Hostinger, provedora do servidor (VPS) onde ficam o sistema e o banco de dados; o provedor de e-mail do Escritório (Google Workspace ou Hostinger), usado para enviar as mensagens do sistema, como convites, links de redefinição de senha e avisos; o serviço de armazenamento das cópias de segurança (Google Drive ou Microsoft OneDrive), que recebe apenas arquivos cifrados antes do envio; e a BrasilAPI, consultada só com o CNPJ para preencher dados públicos da empresa.',
      'Quando ativados pelo Escritório: o Mercado Pago (pagamento da assinatura; o sistema não recebe dados de cartão) e o agregador de Open Finance (conexão com bancos autorizada pelo titular da conta).',
      'Com órgãos públicos (como Receita Federal, Secretarias de Fazenda, Prefeituras, eSocial, FGTS Digital e Juntas Comerciais), sempre que a prestação dos serviços ou a lei exigir, e com autoridades mediante ordem legal.',
      'Mensagens de WhatsApp são abertas no aparelho de quem envia; o sistema não as envia nem as lê. Dentro do Escritório, cada pessoa vê apenas o que sua permissão de acesso permite.',
    ],
  },
  {
    title: '6. Transferência internacional',
    paragraphs: [
      'As cópias de segurança no Google Drive ou no OneDrive, o envio de e-mails pelo Google Workspace e o servidor quando o data center escolhido estiver fora do Brasil podem envolver transferência internacional de dados. Ela ocorre com base no art. 33 da LGPD e nas cláusulas contratuais padrão da Resolução CD/ANPD nº 19/2024, e os arquivos de backup são cifrados antes de sair do servidor, sem que o provedor tenha acesso ao conteúdo.',
    ],
  },
  {
    title: '7. Segurança',
    paragraphs: [
      'Cada espaço é isolado no banco de dados e tem chave de criptografia própria. Dados pessoais e sensíveis (documentos, contatos, CPF/CNPJ, observações) são gravados cifrados com AES-256; a conexão usa TLS (HTTPS); os backups são cifrados.',
      'Oferecemos verificação em duas etapas, pedimos a senha de novo antes de ações sensíveis (como exportar ou excluir dados), limitamos tentativas de acesso, controlamos as sessões ativas e registramos em auditoria as ações sensíveis. Incidentes de segurança que possam causar risco ou dano relevante são comunicados aos titulares e à ANPD, nos termos do art. 48 da LGPD.',
    ],
  },
  {
    title: '8. Por quanto tempo guardamos',
    paragraphs: [
      'Pelo tempo do contrato e, depois dele, pelos prazos legais de guarda: em regra, 5 anos para documentos e registros fiscais e contábeis e os prazos trabalhistas e previdenciários aplicáveis, além do necessário para o exercício regular de direitos. Encerrados esses prazos, os dados são excluídos ou anonimizados.',
      'Os acessos aos links de onboarding são apagados 12 meses depois que o link vence. O registro de auditoria é guardado por 24 meses. Os registros de acesso a aplicações são guardados por 6 meses (art. 15 do Marco Civil da Internet).',
      'Ao excluir um espaço, os dados são removidos e a chave de criptografia do espaço é destruída. As cópias de segurança são cifradas e expiram sozinhas (diárias em até 60 dias e semanais em até 1 ano); até lá, um dado excluído ainda pode existir nelas e só é usado para recuperar o sistema após uma falha.',
    ],
  },
  {
    title: '9. Direitos do titular',
    paragraphs: [
      'Você pode pedir: confirmação de que tratamos seus dados, acesso, correção de dados incompletos ou desatualizados, anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade, portabilidade, informação sobre com quem compartilhamos, informação sobre a possibilidade de não fornecer consentimento e revogação do consentimento, quando ele for a base do tratamento (art. 18 da LGPD).',
      'Quem usa o sistema pode acessar, corrigir e exportar os próprios dados e excluir a conta nas Configurações. Os demais titulares (clientes, sócios, empregados e quem recebeu o onboarding) fazem o pedido pelo canal de privacidade do item 2. Respondemos em até 15 dias. Dados que a lei obriga a guardar são mantidos pelo prazo legal, mesmo após o pedido de exclusão, e o titular é informado disso.',
      'Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd.',
    ],
  },
  {
    title: '10. Cookies',
    paragraphs: [
      'Usamos apenas cookies essenciais de sessão (autenticação), sem rastreamento nem publicidade de terceiros. Preferências de interface, como o tema, ficam no seu navegador.',
    ],
  },
  {
    title: '11. Alterações',
    paragraphs: [
      'Esta política pode ser atualizada para refletir mudanças no sistema ou na legislação. A data da última atualização fica no topo da página, e mudanças relevantes são avisadas aos usuários.',
    ],
  },
];

function LegalPage({ title, sections, updatedAt }: { title: string; sections: Section[]; updatedAt: string }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-extrabold tracking-tight text-fg">
            efficio
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-text hover:underline">
            <ArrowLeft className="size-4" /> Voltar
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="eyebrow text-brand-text">Documentos legais</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">Última atualização: {updatedAt}</p>
        <div className="mt-8 flex flex-col gap-7">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-base font-semibold tracking-tight">{s.title}</h2>
              {s.paragraphs.map((p) => (
                <p key={p} className="mt-2 text-sm leading-relaxed text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-10 border-t border-border pt-5 text-sm text-muted">
          Veja também:{' '}
          {title.startsWith('Termos') ? (
            <Link to="/privacidade" className="font-semibold text-brand-text hover:underline">
              Política de privacidade
            </Link>
          ) : (
            <Link to="/termos" className="font-semibold text-brand-text hover:underline">
              Termos de uso
            </Link>
          )}
        </p>
      </main>
    </div>
  );
}

export function TermsPage() {
  return <LegalPage title="Termos de uso" sections={TERMS} updatedAt={TERMS_UPDATED_AT} />;
}

export function PrivacyPage() {
  return <LegalPage title="Política de privacidade" sections={PRIVACY} updatedAt={PRIVACY_UPDATED_AT} />;
}
