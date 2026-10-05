import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------

export const perfilEnum = pgEnum("perfil", ["admin", "operador"]);

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: varchar("nome", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    senhaHash: text("senha_hash").notNull(),
    perfil: perfilEnum("perfil").notNull().default("operador"),
    ativo: boolean("ativo").notNull().default(true),
    tentativasFalhas: smallint("tentativas_falhas").notNull().default(0),
    bloqueadoAte: timestamp("bloqueado_ate", { withTimezone: true }),
    ultimoAcesso: timestamp("ultimo_acesso", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("usuarios_email_uk").on(sql`lower(${t.email})`)],
);

export const sessoes = pgTable(
  "sessoes",
  {
    // SHA-256 do token; o token em si só existe no cookie do navegador.
    id: char("id", { length: 64 }).primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessoes_usuario_idx").on(t.usuarioId)],
);

export const tentativasLogin = pgTable(
  "tentativas_login",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ip: varchar("ip", { length: 64 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    sucesso: boolean("sucesso").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tentativas_login_ip_idx").on(t.ip, t.criadoEm)],
);

export const auditoria = pgTable(
  "auditoria",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    acao: varchar("acao", { length: 40 }).notNull(),
    entidade: varchar("entidade", { length: 40 }).notNull(),
    entidadeId: varchar("entidade_id", { length: 64 }),
    dados: jsonb("dados"),
    ip: varchar("ip", { length: 64 }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auditoria_entidade_idx").on(t.entidade, t.entidadeId)],
);

// ---------------------------------------------------------------------------
// Tabelas de horas extras (faixas por percentual)
// ---------------------------------------------------------------------------

export const baseFaixaEnum = pgEnum("base_faixa", ["diaria", "mensal"]);
export const tipoDiaFaixaEnum = pgEnum("tipo_dia_faixa", ["util", "descanso"]);

export const tabelasHorasExtras = pgTable("tabelas_horas_extras", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: varchar("nome", { length: 120 }).notNull().unique(),
  descricao: text("descricao"),
  base: baseFaixaEnum("base").notNull().default("mensal"),
  ...timestamps,
});

export const faixasHorasExtras = pgTable(
  "faixas_horas_extras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tabelaId: uuid("tabela_id")
      .notNull()
      .references(() => tabelasHorasExtras.id, { onDelete: "cascade" }),
    tipoDia: tipoDiaFaixaEnum("tipo_dia").notNull(),
    ordem: smallint("ordem").notNull(),
    // Limite superior acumulado da faixa em minutos; nulo = sem limite.
    ateMinutos: integer("ate_minutos"),
    percentual: numeric("percentual", { precision: 6, scale: 2 }).notNull(),
  },
  (t) => [
    uniqueIndex("faixas_tabela_ordem_uk").on(t.tabelaId, t.tipoDia, t.ordem),
    check("faixas_percentual_ck", sql`${t.percentual} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------

export const empresas = pgTable("empresas", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 14 caracteres: aceita o CNPJ alfanumérico (IN RFB 2.229/2024).
  cnpj: char("cnpj", { length: 14 }).notNull().unique(),
  razaoSocial: varchar("razao_social", { length: 200 }).notNull(),
  nomeFantasia: varchar("nome_fantasia", { length: 200 }),
  situacaoCadastral: varchar("situacao_cadastral", { length: 40 }),
  dataAbertura: date("data_abertura"),
  naturezaJuridica: varchar("natureza_juridica", { length: 200 }),
  cnaePrincipal: varchar("cnae_principal", { length: 10 }),
  cnaeDescricao: varchar("cnae_descricao", { length: 300 }),
  porte: varchar("porte", { length: 60 }),
  cep: char("cep", { length: 8 }),
  logradouro: varchar("logradouro", { length: 200 }),
  numero: varchar("numero", { length: 20 }),
  complemento: varchar("complemento", { length: 120 }),
  bairro: varchar("bairro", { length: 120 }),
  municipio: varchar("municipio", { length: 120 }),
  uf: char("uf", { length: 2 }),
  telefone: varchar("telefone", { length: 40 }),
  email: varchar("email", { length: 254 }),
  tabelaHorasExtrasId: uuid("tabela_horas_extras_id").references(() => tabelasHorasExtras.id, {
    onDelete: "set null",
  }),
  ativo: boolean("ativo").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Horários semanais
// ---------------------------------------------------------------------------

export const horarios = pgTable(
  "horarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: varchar("nome", { length: 120 }).notNull(),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("horarios_empresa_nome_uk").on(t.empresaId, t.nome)],
);

// Horários em minutos desde 00:00. Saída menor que a entrada = dia seguinte.
export const horarioDias = pgTable(
  "horario_dias",
  {
    horarioId: uuid("horario_id")
      .notNull()
      .references(() => horarios.id, { onDelete: "cascade" }),
    // 1 = segunda ... 7 = domingo (ISO 8601)
    diaSemana: smallint("dia_semana").notNull(),
    folga: boolean("folga").notNull().default(false),
    entrada1: smallint("entrada1"),
    saida1: smallint("saida1"),
    entrada2: smallint("entrada2"),
    saida2: smallint("saida2"),
  },
  (t) => [
    primaryKey({ columns: [t.horarioId, t.diaSemana] }),
    check("horario_dias_dia_ck", sql`${t.diaSemana} between 1 and 7`),
  ],
);

// ---------------------------------------------------------------------------
// Empregados
// ---------------------------------------------------------------------------

export const empregados = pgTable(
  "empregados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    horarioId: uuid("horario_id").references(() => horarios.id, { onDelete: "set null" }),
    nome: varchar("nome", { length: 200 }).notNull(),
    cpf: char("cpf", { length: 11 }).notNull(),
    pis: char("pis", { length: 11 }),
    matricula: varchar("matricula", { length: 30 }),
    dataNascimento: date("data_nascimento"),
    email: varchar("email", { length: 254 }),
    telefone: varchar("telefone", { length: 40 }),
    cargo: varchar("cargo", { length: 120 }).notNull(),
    departamento: varchar("departamento", { length: 120 }),
    dataAdmissao: date("data_admissao").notNull(),
    dataDemissao: date("data_demissao"),
    salario: numeric("salario", { precision: 12, scale: 2 }),
    ativo: boolean("ativo").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("empregados_empresa_cpf_uk").on(t.empresaId, t.cpf),
    uniqueIndex("empregados_empresa_matricula_uk").on(t.empresaId, t.matricula),
    index("empregados_pis_idx").on(t.pis),
  ],
);

// ---------------------------------------------------------------------------
// Feriados
// ---------------------------------------------------------------------------

export const abrangenciaEnum = pgEnum("abrangencia_feriado", [
  "nacional",
  "estadual",
  "municipal",
  "empresa",
]);

export const feriados = pgTable(
  "feriados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    data: date("data").notNull(),
    descricao: varchar("descricao", { length: 120 }).notNull(),
    abrangencia: abrangenciaEnum("abrangencia").notNull(),
    uf: char("uf", { length: 2 }),
    municipio: varchar("municipio", { length: 120 }),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    index("feriados_data_idx").on(t.data),
    uniqueIndex("feriados_unicidade_uk").on(
      t.data,
      t.abrangencia,
      sql`coalesce(${t.uf}, '')`,
      sql`coalesce(lower(${t.municipio}), '')`,
      sql`coalesce(${t.empresaId}::text, '')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Marcações e importações
// ---------------------------------------------------------------------------

export const origemMarcacaoEnum = pgEnum("origem_marcacao", ["manual", "afd", "csv"]);
export const tipoArquivoEnum = pgEnum("tipo_arquivo", ["afd", "csv"]);

export const importacoes = pgTable("importacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
  usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  nomeArquivo: varchar("nome_arquivo", { length: 255 }).notNull(),
  tipo: tipoArquivoEnum("tipo").notNull(),
  hashArquivo: char("hash_arquivo", { length: 64 }).notNull(),
  totalRegistros: integer("total_registros").notNull().default(0),
  importadas: integer("importadas").notNull().default(0),
  duplicadas: integer("duplicadas").notNull().default(0),
  naoEncontradas: integer("nao_encontradas").notNull().default(0),
  erros: jsonb("erros").$type<string[]>().notNull().default([]),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const marcacoes = pgTable(
  "marcacoes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    empregadoId: uuid("empregado_id")
      .notNull()
      .references(() => empregados.id, { onDelete: "cascade" }),
    // Horário local do relógio de ponto (sem fuso).
    dataHora: timestamp("data_hora", { withTimezone: false, mode: "string" }).notNull(),
    origem: origemMarcacaoEnum("origem").notNull(),
    nsr: integer("nsr"),
    importacaoId: uuid("importacao_id").references(() => importacoes.id, { onDelete: "set null" }),
    // Marcações originais nunca são apagadas: ao ajustar, são desconsideradas.
    desconsiderada: boolean("desconsiderada").notNull().default(false),
    justificativa: varchar("justificativa", { length: 300 }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("marcacoes_empregado_data_uk").on(t.empregadoId, t.dataHora)],
);

// ---------------------------------------------------------------------------
// Configurações (registro único)
// ---------------------------------------------------------------------------

export const configuracoes = pgTable(
  "configuracoes",
  {
    id: smallint("id").primaryKey().default(1),
    toleranciaDiaria: boolean("tolerancia_diaria").notNull().default(true),
    intervaloReduzido: boolean("intervalo_reduzido").notNull().default(false),
    prorrogacaoNoturna: boolean("prorrogacao_noturna").notNull().default(true),
    adicionalNoturno: numeric("adicional_noturno", { precision: 6, scale: 2 }).notNull().default("20"),
    separacaoJornadasMinutos: smallint("separacao_jornadas_minutos").notNull().default(360),
    tabelaHorasExtrasPadraoId: uuid("tabela_horas_extras_padrao_id").references(
      () => tabelasHorasExtras.id,
      { onDelete: "set null" },
    ),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("configuracoes_unica_ck", sql`${t.id} = 1`)],
);

// ---------------------------------------------------------------------------
// Relações
// ---------------------------------------------------------------------------

export const empresasRelations = relations(empresas, ({ one, many }) => ({
  tabelaHorasExtras: one(tabelasHorasExtras, {
    fields: [empresas.tabelaHorasExtrasId],
    references: [tabelasHorasExtras.id],
  }),
  horarios: many(horarios),
  empregados: many(empregados),
}));

export const horariosRelations = relations(horarios, ({ one, many }) => ({
  empresa: one(empresas, { fields: [horarios.empresaId], references: [empresas.id] }),
  dias: many(horarioDias),
}));

export const horarioDiasRelations = relations(horarioDias, ({ one }) => ({
  horario: one(horarios, { fields: [horarioDias.horarioId], references: [horarios.id] }),
}));

export const empregadosRelations = relations(empregados, ({ one }) => ({
  empresa: one(empresas, { fields: [empregados.empresaId], references: [empresas.id] }),
  horario: one(horarios, { fields: [empregados.horarioId], references: [horarios.id] }),
}));

export const tabelasRelations = relations(tabelasHorasExtras, ({ many }) => ({
  faixas: many(faixasHorasExtras),
}));

export const faixasRelations = relations(faixasHorasExtras, ({ one }) => ({
  tabela: one(tabelasHorasExtras, {
    fields: [faixasHorasExtras.tabelaId],
    references: [tabelasHorasExtras.id],
  }),
}));
