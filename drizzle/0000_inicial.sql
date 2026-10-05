CREATE TYPE "public"."abrangencia_feriado" AS ENUM('nacional', 'estadual', 'municipal', 'empresa');--> statement-breakpoint
CREATE TYPE "public"."base_faixa" AS ENUM('diaria', 'mensal');--> statement-breakpoint
CREATE TYPE "public"."origem_marcacao" AS ENUM('manual', 'afd', 'csv');--> statement-breakpoint
CREATE TYPE "public"."perfil" AS ENUM('admin', 'operador');--> statement-breakpoint
CREATE TYPE "public"."tipo_arquivo" AS ENUM('afd', 'csv');--> statement-breakpoint
CREATE TYPE "public"."tipo_dia_faixa" AS ENUM('util', 'descanso');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"acao" varchar(40) NOT NULL,
	"entidade" varchar(40) NOT NULL,
	"entidade_id" varchar(64),
	"dados" jsonb,
	"ip" varchar(64),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"tolerancia_diaria" boolean DEFAULT true NOT NULL,
	"intervalo_reduzido" boolean DEFAULT false NOT NULL,
	"prorrogacao_noturna" boolean DEFAULT true NOT NULL,
	"adicional_noturno" numeric(6, 2) DEFAULT '20' NOT NULL,
	"separacao_jornadas_minutos" smallint DEFAULT 360 NOT NULL,
	"tabela_horas_extras_padrao_id" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracoes_unica_ck" CHECK ("configuracoes"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "empregados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"horario_id" uuid,
	"nome" varchar(200) NOT NULL,
	"cpf" char(11) NOT NULL,
	"pis" char(11),
	"matricula" varchar(30),
	"data_nascimento" date,
	"email" varchar(254),
	"telefone" varchar(40),
	"cargo" varchar(120) NOT NULL,
	"departamento" varchar(120),
	"data_admissao" date NOT NULL,
	"data_demissao" date,
	"salario" numeric(12, 2),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cnpj" char(14) NOT NULL,
	"razao_social" varchar(200) NOT NULL,
	"nome_fantasia" varchar(200),
	"situacao_cadastral" varchar(40),
	"data_abertura" date,
	"natureza_juridica" varchar(200),
	"cnae_principal" varchar(10),
	"cnae_descricao" varchar(300),
	"porte" varchar(60),
	"cep" char(8),
	"logradouro" varchar(200),
	"numero" varchar(20),
	"complemento" varchar(120),
	"bairro" varchar(120),
	"municipio" varchar(120),
	"uf" char(2),
	"telefone" varchar(40),
	"email" varchar(254),
	"tabela_horas_extras_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "faixas_horas_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tabela_id" uuid NOT NULL,
	"tipo_dia" "tipo_dia_faixa" NOT NULL,
	"ordem" smallint NOT NULL,
	"ate_minutos" integer,
	"percentual" numeric(6, 2) NOT NULL,
	CONSTRAINT "faixas_percentual_ck" CHECK ("faixas_horas_extras"."percentual" >= 0)
);
--> statement-breakpoint
CREATE TABLE "feriados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" date NOT NULL,
	"descricao" varchar(120) NOT NULL,
	"abrangencia" "abrangencia_feriado" NOT NULL,
	"uf" char(2),
	"municipio" varchar(120),
	"empresa_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horario_dias" (
	"horario_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"folga" boolean DEFAULT false NOT NULL,
	"entrada1" smallint,
	"saida1" smallint,
	"entrada2" smallint,
	"saida2" smallint,
	CONSTRAINT "horario_dias_horario_id_dia_semana_pk" PRIMARY KEY("horario_id","dia_semana"),
	CONSTRAINT "horario_dias_dia_ck" CHECK ("horario_dias"."dia_semana" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "horarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" varchar(120) NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"usuario_id" uuid,
	"nome_arquivo" varchar(255) NOT NULL,
	"tipo" "tipo_arquivo" NOT NULL,
	"hash_arquivo" char(64) NOT NULL,
	"total_registros" integer DEFAULT 0 NOT NULL,
	"importadas" integer DEFAULT 0 NOT NULL,
	"duplicadas" integer DEFAULT 0 NOT NULL,
	"nao_encontradas" integer DEFAULT 0 NOT NULL,
	"erros" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marcacoes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"empregado_id" uuid NOT NULL,
	"data_hora" timestamp NOT NULL,
	"origem" "origem_marcacao" NOT NULL,
	"nsr" integer,
	"importacao_id" uuid,
	"desconsiderada" boolean DEFAULT false NOT NULL,
	"justificativa" varchar(300),
	"usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" char(64) PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(512),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tabelas_horas_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"descricao" text,
	"base" "base_faixa" DEFAULT 'mensal' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tabelas_horas_extras_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "tentativas_login" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip" varchar(64) NOT NULL,
	"email" varchar(254) NOT NULL,
	"sucesso" boolean NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"email" varchar(254) NOT NULL,
	"senha_hash" text NOT NULL,
	"perfil" "perfil" DEFAULT 'operador' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"tentativas_falhas" smallint DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"ultimo_acesso" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_tabela_horas_extras_padrao_id_tabelas_horas_extras_id_fk" FOREIGN KEY ("tabela_horas_extras_padrao_id") REFERENCES "public"."tabelas_horas_extras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empregados" ADD CONSTRAINT "empregados_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empregados" ADD CONSTRAINT "empregados_horario_id_horarios_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_tabela_horas_extras_id_tabelas_horas_extras_id_fk" FOREIGN KEY ("tabela_horas_extras_id") REFERENCES "public"."tabelas_horas_extras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faixas_horas_extras" ADD CONSTRAINT "faixas_horas_extras_tabela_id_tabelas_horas_extras_id_fk" FOREIGN KEY ("tabela_id") REFERENCES "public"."tabelas_horas_extras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_dias" ADD CONSTRAINT "horario_dias_horario_id_horarios_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcacoes" ADD CONSTRAINT "marcacoes_empregado_id_empregados_id_fk" FOREIGN KEY ("empregado_id") REFERENCES "public"."empregados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcacoes" ADD CONSTRAINT "marcacoes_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcacoes" ADD CONSTRAINT "marcacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "auditoria" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "empregados_empresa_cpf_uk" ON "empregados" USING btree ("empresa_id","cpf");--> statement-breakpoint
CREATE UNIQUE INDEX "empregados_empresa_matricula_uk" ON "empregados" USING btree ("empresa_id","matricula");--> statement-breakpoint
CREATE INDEX "empregados_pis_idx" ON "empregados" USING btree ("pis");--> statement-breakpoint
CREATE UNIQUE INDEX "faixas_tabela_ordem_uk" ON "faixas_horas_extras" USING btree ("tabela_id","tipo_dia","ordem");--> statement-breakpoint
CREATE INDEX "feriados_data_idx" ON "feriados" USING btree ("data");--> statement-breakpoint
CREATE UNIQUE INDEX "feriados_unicidade_uk" ON "feriados" USING btree ("data","abrangencia",coalesce("uf", ''),coalesce(lower("municipio"), ''),coalesce("empresa_id"::text, ''));--> statement-breakpoint
CREATE UNIQUE INDEX "horarios_empresa_nome_uk" ON "horarios" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "marcacoes_empregado_data_uk" ON "marcacoes" USING btree ("empregado_id","data_hora");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tentativas_login_ip_idx" ON "tentativas_login" USING btree ("ip","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uk" ON "usuarios" USING btree (lower("email"));