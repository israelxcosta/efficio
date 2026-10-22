import { FEE_CATEGORY, type CategoryType, type IconName } from '@effinance/shared';

export interface DefaultCategory {
  name: string;
  type: CategoryType;
  icon: IconName;
  color: string;
  subcategories?: { name: string; icon: IconName }[];
}

/** Categories created for every new workspace. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    name: 'Alimentação',
    type: 'expense',
    icon: 'utensils',
    color: '#F97316',
    subcategories: [
      { name: 'Supermercado', icon: 'shopping-cart' },
      { name: 'Restaurantes', icon: 'utensils' },
      { name: 'Delivery', icon: 'pizza' },
      { name: 'Padaria e café', icon: 'coffee' },
    ],
  },
  {
    name: 'Moradia',
    type: 'expense',
    icon: 'house',
    color: '#152B61',
    subcategories: [
      { name: 'Aluguel', icon: 'house' },
      { name: 'Condomínio', icon: 'building-2' },
      { name: 'Energia', icon: 'lightbulb' },
      { name: 'Água', icon: 'droplet' },
      { name: 'Internet', icon: 'wifi' },
      { name: 'Manutenção', icon: 'wrench' },
    ],
  },
  {
    name: 'Transporte',
    type: 'expense',
    icon: 'car',
    color: '#3F64BE',
    subcategories: [
      { name: 'Combustível', icon: 'fuel' },
      { name: 'App de transporte', icon: 'car' },
      { name: 'Transporte público', icon: 'bus' },
      { name: 'Manutenção do veículo', icon: 'wrench' },
    ],
  },
  {
    name: 'Saúde',
    type: 'expense',
    icon: 'heart-pulse',
    color: '#E5484D',
    subcategories: [
      { name: 'Plano de saúde', icon: 'shield' },
      { name: 'Farmácia', icon: 'pill' },
      { name: 'Consultas e exames', icon: 'stethoscope' },
      { name: 'Academia', icon: 'dumbbell' },
    ],
  },
  {
    name: 'Educação',
    type: 'expense',
    icon: 'graduation-cap',
    color: '#7C3AED',
    subcategories: [
      { name: 'Cursos', icon: 'graduation-cap' },
      { name: 'Livros', icon: 'book-open' },
      { name: 'Mensalidade escolar', icon: 'graduation-cap' },
    ],
  },
  {
    name: 'Lazer',
    type: 'expense',
    icon: 'party-popper',
    color: '#EC4899',
    subcategories: [
      { name: 'Cinema e shows', icon: 'ticket' },
      { name: 'Viagens', icon: 'plane' },
      { name: 'Bares', icon: 'beer' },
      { name: 'Jogos', icon: 'gamepad-2' },
    ],
  },
  {
    name: 'Compras',
    type: 'expense',
    icon: 'shopping-bag',
    color: '#A855F7',
    subcategories: [
      { name: 'Roupas', icon: 'shirt' },
      { name: 'Eletrônicos', icon: 'smartphone' },
      { name: 'Casa e decoração', icon: 'house' },
      { name: 'Presentes', icon: 'gift' },
    ],
  },
  {
    name: 'Assinaturas',
    type: 'expense',
    icon: 'tv',
    color: '#0EA5E9',
    subcategories: [
      { name: 'Streaming', icon: 'film' },
      { name: 'Música', icon: 'music' },
      { name: 'Telefonia', icon: 'smartphone' },
      { name: 'Software', icon: 'laptop' },
    ],
  },
  {
    name: 'Impostos e taxas',
    type: 'expense',
    icon: 'receipt',
    color: '#64748B',
    subcategories: [
      { name: 'IPTU/IPVA', icon: 'receipt' },
      { name: 'Tarifas bancárias', icon: 'landmark' },
      { name: 'Imposto de renda', icon: 'receipt' },
    ],
  },
  {
    name: 'Pets',
    type: 'expense',
    icon: 'paw-print',
    color: '#EAB308',
    subcategories: [
      { name: 'Ração', icon: 'paw-print' },
      { name: 'Veterinário', icon: 'stethoscope' },
    ],
  },
  { name: 'Outras despesas', type: 'expense', icon: 'tag', color: '#78716C' },
  {
    name: 'Salário',
    type: 'income',
    icon: 'briefcase',
    color: '#12A150',
    subcategories: [
      { name: 'Salário mensal', icon: 'briefcase' },
      { name: '13º salário', icon: 'gift' },
      { name: 'Férias', icon: 'umbrella' },
      { name: 'Bônus/PLR', icon: 'star' },
    ],
  },
  {
    name: 'Freelance',
    type: 'income',
    icon: 'laptop',
    color: '#14B8A6',
    subcategories: [
      { name: 'Projetos', icon: 'laptop' },
      { name: 'Consultoria', icon: 'briefcase' },
    ],
  },
  {
    name: 'Rendimentos',
    type: 'income',
    icon: 'trending-up',
    color: '#0F766E',
    subcategories: [
      { name: 'Dividendos', icon: 'coins' },
      { name: 'Juros', icon: 'piggy-bank' },
    ],
  },
  { name: 'Aluguéis recebidos', type: 'income', icon: 'building-2', color: '#84CC16' },
  { name: 'Vendas', type: 'income', icon: 'store', color: '#F59E0B' },
  {
    name: 'Outras receitas',
    type: 'income',
    icon: 'coins',
    color: '#3F64BE',
    subcategories: [
      { name: 'Reembolsos', icon: 'hand-coins' },
      { name: 'Presentes recebidos', icon: 'gift' },
    ],
  },
];

/** Categories of a business workspace (service company, e.g. an accounting office). */
export const BUSINESS_CATEGORIES: DefaultCategory[] = [
  {
    // FEE_CATEGORY: "Gerar honorários" bills into the first two subcategories (and creates them in a
    // workspace that renamed or removed them).
    name: FEE_CATEGORY.name,
    type: 'income',
    icon: 'briefcase',
    color: '#12A150',
    subcategories: [
      { name: FEE_CATEGORY.fee, icon: 'briefcase' },
      { name: FEE_CATEGORY.employees, icon: 'hand-coins' },
      { name: '13º honorário', icon: 'gift' },
      { name: 'Serviços avulsos', icon: 'receipt' },
    ],
  },
  {
    name: 'Outras receitas',
    type: 'income',
    icon: 'coins',
    color: '#3F64BE',
    subcategories: [
      { name: 'Rendimentos financeiros', icon: 'trending-up' },
      { name: 'Reembolsos', icon: 'hand-coins' },
    ],
  },
  {
    name: 'Pessoal',
    type: 'expense',
    icon: 'briefcase',
    color: '#7C3AED',
    subcategories: [
      { name: 'Salários', icon: 'banknote' },
      { name: 'Pró-labore', icon: 'wallet' },
      { name: 'Encargos (INSS/FGTS)', icon: 'receipt' },
      { name: 'Benefícios', icon: 'heart-pulse' },
      { name: 'Treinamentos', icon: 'graduation-cap' },
    ],
  },
  {
    name: 'Impostos e taxas',
    type: 'expense',
    icon: 'receipt',
    color: '#64748B',
    subcategories: [
      { name: 'Simples Nacional (DAS)', icon: 'receipt' },
      { name: 'ISS', icon: 'receipt' },
      { name: 'Taxas e alvarás', icon: 'flag' },
      { name: 'Tarifas bancárias', icon: 'landmark' },
    ],
  },
  {
    name: 'Ocupação',
    type: 'expense',
    icon: 'building-2',
    color: '#152B61',
    subcategories: [
      { name: 'Aluguel', icon: 'house' },
      { name: 'Condomínio', icon: 'building-2' },
      { name: 'Energia', icon: 'lightbulb' },
      { name: 'Água', icon: 'droplet' },
      { name: 'Internet e telefone', icon: 'wifi' },
      { name: 'Limpeza e manutenção', icon: 'wrench' },
    ],
  },
  {
    name: 'Tecnologia',
    type: 'expense',
    icon: 'laptop',
    color: '#0EA5E9',
    subcategories: [
      { name: 'Sistema contábil', icon: 'laptop' },
      { name: 'Softwares e licenças', icon: 'laptop' },
      { name: 'Certificado digital', icon: 'shield' },
      { name: 'Equipamentos', icon: 'smartphone' },
    ],
  },
  {
    name: 'Administrativo',
    type: 'expense',
    icon: 'store',
    color: '#F97316',
    subcategories: [
      { name: 'Material de escritório', icon: 'shopping-bag' },
      { name: 'Cartório e correios', icon: 'receipt' },
      { name: 'Serviços de terceiros', icon: 'briefcase' },
    ],
  },
  {
    name: 'Marketing',
    type: 'expense',
    icon: 'sparkles',
    color: '#EC4899',
    subcategories: [
      { name: 'Anúncios', icon: 'target' },
      { name: 'Site e redes sociais', icon: 'smartphone' },
      { name: 'Eventos e brindes', icon: 'gift' },
    ],
  },
  {
    name: 'Deslocamento',
    type: 'expense',
    icon: 'car',
    color: '#3F64BE',
    subcategories: [
      { name: 'Combustível', icon: 'fuel' },
      { name: 'App de transporte', icon: 'car' },
    ],
  },
  {
    name: 'Despesas financeiras',
    type: 'expense',
    icon: 'landmark',
    color: '#E5484D',
    subcategories: [
      { name: 'Juros e multas', icon: 'receipt' },
      { name: 'Empréstimos', icon: 'landmark' },
    ],
  },
  { name: 'Outras despesas', type: 'expense', icon: 'tag', color: '#78716C' },
];
