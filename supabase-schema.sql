-- ═══════════════════════════════════════════════════════════════════
--  PCM — Planejamento e Controle de Manutenção
--  Supabase Schema — execute no SQL Editor do seu projeto Supabase
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. COLABORADORES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colaboradores (
  id          BIGSERIAL    PRIMARY KEY,
  nome        TEXT         NOT NULL,
  funcao      TEXT,
  setor       TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 2. EQUIPAMENTOS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipamentos (
  id          BIGSERIAL    PRIMARY KEY,
  setor       TEXT         NOT NULL,
  nome        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 3. COMPONENTES DE EQUIPAMENTO ───────────────────────────────────
CREATE TABLE IF NOT EXISTS equipamento_componentes (
  id               BIGSERIAL  PRIMARY KEY,
  equipamento_id   BIGINT     NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
  qty              TEXT,
  nome             TEXT       NOT NULL
);

-- ── 4. ORDENS DE SERVIÇO ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordens (
  id          BIGSERIAL    PRIMARY KEY,
  data        DATE         NOT NULL,
  hora        TEXT,
  req         TEXT,
  setor       TEXT,
  tipo        TEXT         CHECK (tipo IN ('Corretiva','melhoria','Preventiva')),
  natureza    TEXT         CHECK (natureza IN ('Predial','Mecânica','Oficina')),
  descricao   TEXT,
  prioridade  TEXT         CHECK (prioridade IN ('Alta','Média','Baixa')),
  data_prog   DATE,
  data_concl  DATE,
  realizado   TEXT,
  exec        TEXT,
  status      TEXT         DEFAULT 'Em Aberto' CHECK (status IN ('Em Aberto','Concluído')),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 5. MANUTENÇÃO PREVENTIVA ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preventiva (
  id          BIGSERIAL    PRIMARY KEY,
  equip       TEXT         NOT NULL,
  comp        TEXT         NOT NULL,
  trimestre   TEXT         CHECK (trimestre IN ('1º','2º','3º','4º')),
  planejada   DATE,
  realizada   DATE,
  exec        TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 6. PLANOS DE MANUTENÇÃO ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planos (
  id          BIGSERIAL    PRIMARY KEY,
  setor       TEXT,
  equip       TEXT,
  plano       TEXT         CHECK (plano IN ('LU','PRM','IRM')),
  item        TEXT,
  period      TEXT,
  qty         INTEGER,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 7. PLANO DE LUBRIFICAÇÃO ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lubrificacao (
  id          BIGSERIAL    PRIMARY KEY,
  setor       TEXT,
  equip       TEXT,
  item        TEXT,
  lubrificante TEXT,
  bombadas    TEXT,
  frequencia  TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 8. EXECUÇÕES DE LUBRIFICAÇÃO ────────────────────────────────────
CREATE TABLE IF NOT EXISTS lu_execucoes (
  id          BIGSERIAL    PRIMARY KEY,
  setor       TEXT,
  equip       TEXT,
  item        TEXT,
  data        DATE,
  exec        TEXT,
  obs         TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 9. FERRAMENTAS (checklist + inventário de caixas) ───────────────
CREATE TABLE IF NOT EXISTS ferramentas (
  id          BIGSERIAL    PRIMARY KEY,
  tipo        TEXT         CHECK (tipo IN ('eletrica','mecanica')),
  caixa       TEXT,        -- NULL = item do checklist | 'VERDE' / 'VERMELHA' = inventário
  nome        TEXT         NOT NULL,
  qty         INTEGER      DEFAULT 1,
  area        TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 10. ESTADO DO CHECKLIST DE FERRAMENTAS ──────────────────────────
CREATE TABLE IF NOT EXISTS checklist_estado (
  id               BIGSERIAL    PRIMARY KEY,
  ferramenta_id    BIGINT       REFERENCES ferramentas(id) ON DELETE CASCADE,
  colaborador_nome TEXT,
  mes              INTEGER      CHECK (mes BETWEEN 1 AND 12),
  ano              INTEGER,
  dia              INTEGER      CHECK (dia BETWEEN 1 AND 31),
  estado           TEXT         DEFAULT 'C' CHECK (estado IN ('C','NC','F','FE','A')),
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (ferramenta_id, colaborador_nome, ano, mes, dia)
);

-- ═══════════════════════════════════════════════════════════════════
--  ÍNDICES (melhoram performance das consultas mais comuns)
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_ordens_status      ON ordens(status);
CREATE INDEX IF NOT EXISTS idx_ordens_setor       ON ordens(setor);
CREATE INDEX IF NOT EXISTS idx_ordens_data        ON ordens(data DESC);
CREATE INDEX IF NOT EXISTS idx_preventiva_equip   ON preventiva(equip);
CREATE INDEX IF NOT EXISTS idx_preventiva_trim    ON preventiva(trimestre);
CREATE INDEX IF NOT EXISTS idx_lubrificacao_setor ON lubrificacao(setor);
CREATE INDEX IF NOT EXISTS idx_lu_execucoes_key   ON lu_execucoes(setor, equip, item);
CREATE INDEX IF NOT EXISTS idx_comp_equip         ON equipamento_componentes(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_tipo   ON ferramentas(tipo, caixa);

-- ═══════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
--  Para uso interno (sem autenticação por usuário), desabilite o RLS.
--  Quando quiser restringir por usuário, habilite e ajuste as políticas.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE colaboradores           DISABLE ROW LEVEL SECURITY;
ALTER TABLE equipamentos            DISABLE ROW LEVEL SECURITY;
ALTER TABLE equipamento_componentes DISABLE ROW LEVEL SECURITY;
ALTER TABLE ordens                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE preventiva              DISABLE ROW LEVEL SECURITY;
ALTER TABLE planos                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE lubrificacao            DISABLE ROW LEVEL SECURITY;
ALTER TABLE lu_execucoes            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ferramentas             DISABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_estado        DISABLE ROW LEVEL SECURITY;
