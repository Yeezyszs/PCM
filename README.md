# PCM — Planejamento e Controle de Manutenção

Sistema web de Planejamento e Controle de Manutenção (PCM) para fábrica,
desenvolvido como **SPA single-file** em HTML/CSS/JS puro com backend Supabase.

> Este README serve como contexto para o Claude (e demais colaboradores)
> entenderem rapidamente a arquitetura, convenções e pontos críticos do projeto.

---

## 1. Stack

| Camada        | Tecnologia                                                     |
|---------------|----------------------------------------------------------------|
| Frontend      | HTML5 + CSS3 + Vanilla JS (sem build step, sem framework)      |
| Gráficos      | Chart.js 4 (via CDN)                                           |
| Backend/DB    | Supabase (PostgreSQL + API REST autogerada)                    |
| Cliente DB    | `@supabase/supabase-js` v2 (via CDN)                           |
| Fontes        | Syne (UI) + JetBrains Mono (dados numéricos)                   |
| Hospedagem    | Arquivo único `index.html` (pode rodar localmente ou via HTTP) |

Credenciais Supabase estão inline no topo do bloco `<script>` do `index.html`
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`) — é cliente anônimo, uso interno.

---

## 2. Estrutura do Repositório

```
PCM/
├── index.html                ← SPA completa (HTML + CSS + JS em ~5100 linhas)
├── supabase-schema.sql       ← DDL das tabelas (versão legada, falta producao/custos/paradas)
├── supabase-seed.sql         ← Dados iniciais (equipamentos, planos, lubrificação)
├── README.md                 ← Este arquivo
└── *.xlsx / *.docx           ← Planilhas de referência (POPs, inventário, plano lubrif.)
```

Todo o código de produção vive em **`index.html`**. Não há bundler, compilador
ou transpilação — edite o arquivo direto.

---

## 3. Arquitetura do `index.html`

Organização interna, em ordem:

1. **`<style>`** — Variáveis CSS (`--navy`, `--accent3`, etc.), reset,
   layout (topbar + sidebar + main), componentes (cards, tabelas, modais, badges).
2. **`<body>`** — Topbar, sidebar com `nav-item`, e uma `<div id="page-*">`
   por seção. Apenas uma página fica visível por vez (classe `.active`).
3. **Modais** — `<div class="modal" id="modal-*">` escondidos, abertos/fechados
   via JS (`abrir*()` / `fechar*()`).
4. **`<script>`** — Inicializa Supabase, define `STATE`, funções de carga,
   render, CRUD e helpers.

### 3.1 Navegação

- Sidebar: `<div class="nav-item" onclick="goPage('<id>')">` → mostra
  `<div id="page-<id>" class="page">`.
- Páginas existentes: `dashboard`, `ordens`, `preventiva`, `planos`,
  `equipamentos`, `lubrificacao`, `ferramentas`, `colaboradores`,
  `cadastros`, `indicadores`.
- Dentro de Cadastros há sub-abas (`switchCadTab`): `equip`, `itens`, `setores`.

### 3.2 Estado em memória

```js
let STATE = {
  ordens: [], equipamentos: [], preventiva: [], planos: [],
  lubrificacao: [], luExecucoes: [], colaboradores: [],
  ferramentasEletrica: [], ferramentasMecanica: [], caixasFerramentas: [],
  setores: [],
  producao: [],   // horas planejadas por mês/ano (KPIs)
  custos: [],     // lançamentos de custos operacionais
  paradas: [],    // paradas de fábrica (tipo/setor/turno/motivo/horas)
  checkState: {}, // estado do checklist de ferramentas
};
```

`loadAll()` (~linha 2220) executa um `Promise.all` com 16 `sb.from('*').select('*')`
e normaliza os retornos para `STATE` (converte campos `snake_case` do DB para
`camelCase` no JS quando necessário, e faz `parseFloat` em colunas DECIMAL).

### 3.3 Renderização

- Cada página tem uma função `render<Nome>()` que lê de `STATE` e monta o HTML
  via `innerHTML` + template literals.
- **Escape obrigatório**: use o helper `h(str)` para interpolar qualquer valor
  que vá ao DOM (previne XSS). Nunca interpole strings cruas do DB.
- Tabelas usam `.tbody.innerHTML = array.map(x => \`<tr>...</tr>\`).join('')`.

### 3.4 CRUD

Padrão recorrente para qualquer entidade:

```js
const { data: saved, error } = await sb.from('tabela')
  .insert([payload]).select().single();
if (error) { showToast('Erro: ' + error.message, true); return; }
const row = saved ?? payload;                // fallback se RLS bloquear select
STATE.entidade.unshift({ ...row, /* normalizações */ });
render<Entidade>();
fecharModal<Entidade>();
```

Para UPDATE: `.update(campos).eq('id', id)`. Para DELETE:
`.delete().eq('id', id)`. Sempre mexer em `STATE` em seguida para manter
a UI sincronizada sem recarregar tudo.

**Upsert com chave composta** (ex.: `producao` tem `UNIQUE(mes, ano)`):

```js
sb.from('producao').upsert([payload], { onConflict: 'mes,ano' }).select().single();
```

---

## 4. Banco de Dados (Supabase)

### Tabelas em uso

| Tabela                       | Propósito                                              |
|------------------------------|--------------------------------------------------------|
| `colaboradores`              | Cadastro de pessoas (nome, função, setor)              |
| `setores`                    | Setores da fábrica                                     |
| `equipamentos`               | Máquinas por setor                                     |
| `equipamento_componentes`    | Itens/componentes de cada equipamento                  |
| `ordens`                     | Ordens de Serviço (O.S.)                               |
| `preventiva`                 | Manutenções preventivas trimestrais                    |
| `planos`                     | Planos LU/PRM/IRM por equipamento                      |
| `lubrificacao`               | Pontos de lubrificação                                 |
| `lu_execucoes`               | Execuções de lubrificação                              |
| `ferramentas`                | Checklist e inventário de caixas (verde/vermelha)      |
| `checklist_estado`           | Estado diário do checklist por colaborador             |
| `producao`                   | Horas planejadas de fábrica (mês/ano) — KPIs           |
| `custos`                     | Lançamentos de custos operacionais                     |
| `paradas`                    | Paradas de fábrica (tipo/setor/turno/motivo/horas)     |

> O arquivo `supabase-schema.sql` só cobre as tabelas legadas.
> `producao`, `custos` e `paradas` foram criadas depois — a DDL foi
> aplicada direto via SQL Editor do Supabase e ainda não está versionada.

### RLS (Row Level Security)

Todas as tabelas estão com RLS **habilitado**. Para cada nova tabela criada,
é obrigatório adicionar a policy permissiva para o role `anon`:

```sql
CREATE POLICY "pcm_all" ON <tabela>
FOR ALL TO anon
USING (true) WITH CHECK (true);
```

Sem isso, INSERT/UPDATE/DELETE falham silenciosamente (ou `select().single()`
volta `null` apesar do insert ter dado certo). Foi o bug mais recorrente do
projeto — o fallback `saved ?? payload` mitiga, mas não substitui a policy.

### Campos de data/hora

- Colunas `DATE` viram string `'YYYY-MM-DD'` no retorno do Supabase.
  Para comparar com `new Date()`, use **`new Date(data + 'T00:00:00')`**
  (evita offset de timezone).
- `DECIMAL` vira string (ex.: `"7.70"`). Sempre passe por `parseFloat()` ao
  carregar em `STATE`.

---

## 5. Indicadores (tab `page-indicadores`)

Parte mais densa do sistema. KPIs calculados sobre período filtrado
(default: últimos 6 meses):

```js
const horasPlan    = somatório de STATE.producao no período;
const horasParadas = somatório de TODAS STATE.paradas no período;
const paradasManut = STATE.paradas onde tipo === 'Manutenção / Quebra';
const horasManut   = somatório de paradasManut;
const nFalhas      = paradasManut.length;
const horasOper    = max(0, horasPlan - horasParadas);
const dispPct      = (horasOper / horasPlan) * 100;
const mttr         = horasManut / nFalhas;
const mtbf         = horasOper / nFalhas;
```

> **Regra importante**: *todos* os tipos de parada reduzem Disponibilidade,
> mas apenas `'Manutenção / Quebra'` alimenta MTTR/MTBF (é a única causa
> de origem mecânica/elétrica da fábrica).

### Gráficos (Chart.js)

Cada gráfico tem uma instância module-level (`_chartDisp`, `_chartMttr`,
`_chartCustos`, `_chartParadasMensal`, `_chartParadasTipo`,
`_chartParadasSetor`, `_chartParadasTurno`). Antes de recriar o chart,
sempre destrua o anterior:

```js
if (_chart) _chart.destroy();
_chart = new Chart(ctx, config);
```

Charts atuais:
- **Disponibilidade** — linha (mensal, %)
- **MTTR / MTBF** — linha dupla (mensal, horas)
- **Custos** — barra (categorias)
- **Evolução Mensal de Paradas** — barra empilhada por tipo (últimos 12 meses)
- **Paradas por Tipo** — doughnut
- **Paradas por Setor** — barra horizontal (top 10)
- **Paradas por Turno** — doughnut (1°/2°/Revezamento + "Não informado")

### Modal de Parada (`modal-parada`)

Campos: `data`, `tipo` (select fixo), `equipamento` (select fixo de setores),
`turno` (select), `hora_inicio`, `hora_fim`, `horas` (auto calculado),
`motivo`, `os_id` (opcional). Tipos:

- `Manutenção / Quebra` → entra em MTTR/MTBF
- `Queda de Energia`
- `Falta de Matéria Prima`
- `Outro`

---

## 6. Convenções de Código

- **Nomes**: JS em `camelCase`, colunas Supabase em `snake_case`. Converter
  na entrada (`loadAll`) e saída (payloads de insert/update).
- **XSS**: sempre `h(valor)` em qualquer interpolação de string do DB.
- **Toasts**: `showToast(msg)` para sucesso, `showToast(msg, true)` para erro.
- **Botões de ação em tabelas**: classes `.btn-sm`, `.btn-secondary`,
  `.btn-warning` (amarelo) para editar, `.btn-danger` (vermelho) para excluir.
- **Datas em inputs**: usar tipo `date` (`YYYY-MM-DD`), converter para
  `DD/MM/YYYY` só na renderização (`fmtD()`).
- **Horas**: helper `fmtH(n)` devolve `"7,7"` (formato BR com vírgula).
- **Modais**: abrir com `modal.classList.add('active')`, fechar removendo
  a mesma classe. Sempre resetar campos do form ao abrir em modo "novo".
- **Não abstrair prematuramente**: mantemos cópia de template literal em cada
  `render*()` em vez de helper genérico — legibilidade > DRY neste projeto.

---

## 7. Pontos Sensíveis / Gotchas

1. **Novas tabelas precisam de policy RLS** (vide §4). Sem isso, nada grava.
2. `.select().single()` pode retornar `null` mesmo após insert válido quando
   a policy só permite write. Usar `saved ?? payload` como fallback.
3. `STATE.producao` tem `UNIQUE(mes, ano)` → usar **upsert**, não insert.
4. Campos DECIMAL vêm como string — **sempre** `parseFloat`.
5. Datas DATE vêm sem TZ — **sempre** `new Date(d + 'T00:00:00')`.
6. Charts recriados sem `.destroy()` vazam memória e duplicam tooltips.
7. O arquivo é grande (~5100 linhas). Usar `Grep` com padrões específicos;
   evitar leitura sequencial.
8. Credenciais do Supabase estão no cliente — é `anon key`, uso interno
   atrás da rede. Não commitar `service_role`.

---

## 8. Fluxo de Desenvolvimento

1. Edite `index.html` localmente.
2. Teste abrindo o arquivo no navegador (funciona em `file://` também).
3. Ao criar nova tabela no Supabase, aplique a policy RLS permissiva
   e atualize `loadAll()`, `STATE` e os renders.
4. Commit com mensagem descritiva em PT-BR, push na branch combinada.

Branch atual de trabalho: `main` (a feature branch
`claude/review-pcm-system-*` é para revisões isoladas).
