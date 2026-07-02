// ══════════════════════════════════════════
// CONFIGURAÇÃO SUPABASE
// ══════════════════════════════════════════
// ⚠️  Preencha com as credenciais do seu projeto Supabase:
//    Settings → API → Project URL  e  anon public key
const SUPABASE_URL      = 'https://ajtmnlvnawwvygeskrtx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqdG1ubHZuYXd3dnlnZXNrcnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MzIxMzcsImV4cCI6MjA5MTQwODEzN30.Aor4M8vo1T4q9UeaCZtBD25KkH_2Feh9YQzNnTdkB60';

const sb = (() => {
  if (SUPABASE_URL === 'COLE_SUA_URL_AQUI') return null;
  try {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
  } catch (e) {
    console.warn('Supabase createClient falhou:', e);
    return null;
  }
})();

// ══════════════════════════════════════════
// ESTADO GLOBAL (carregado do Supabase)
// ══════════════════════════════════════════
let STATE = {
  ordens: [], equipamentos: [], preventiva: [], planos: [],
  lubrificacao: [], luExecucoes: [], colaboradores: [],
  ferramentasEletrica: [], ferramentasMecanica: [], caixasFerramentas: [],
  setores: [],
  producao: [],
  custos: [],
  paradas: [],
  osExecucoes: [],
  checkState: {},
};

// ── helper anti-XSS ──
const h = s => s == null ? '' : String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── helpers de leitura ──
function allOrdens()           { return STATE.ordens; }
function allEquipamentos()     { return STATE.equipamentos; }
function allPreventiva()       { return STATE.preventiva; }
function allPlanos()           { return STATE.planos; }
function allLubrificacao()     { return STATE.lubrificacao; }
function allLuExecucoes()      { return STATE.luExecucoes; }
function allColaboradores()    { return STATE.colaboradores; }
function allFerretasEletrica() { return STATE.ferramentasEletrica; }
function allFerretasMecanica() { return STATE.ferramentasMecanica; }

// ── toast ──
function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' toast-err' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3500);
}

// ── loading ──
function setLoadingMsg(msg) {
  const el = document.getElementById('loading-msg');
  if (el) el.textContent = msg;
}
function hideLoading() {
  const el = document.getElementById('loading-screen');
  if (el) { el.classList.add('hide'); setTimeout(() => el.remove(), 500); }
}

// ══════════════════════════════════════════
// CARREGAMENTO INICIAL DO BANCO
// ══════════════════════════════════════════
async function loadAll() {
  if (!sb) {
    setLoadingMsg('⚠️ Supabase não configurado — usando dados de demonstração…');
    await new Promise(r => setTimeout(r, 1500));
    hideLoading();
    return;
  }

  try {
    setLoadingMsg('Carregando ordens de serviço…');
    const [
      { data: ordens,    error: e1 },
      { data: equips,    error: e2 },
      { data: comps,     error: e3 },
      { data: prev,      error: e4 },
      { data: planos,    error: e5 },
      { data: lu,        error: e6 },
      { data: luExec,    error: e7 },
      { data: colab,     error: e8 },
      { data: fEl,       error: e9 },
      { data: fMec,      error: e10},
      { data: caixas,    error: e11},
      { data: setores,   error: e12},
      { data: producao,  error: e13},
      { data: custos,    error: e14},
      { data: paradas,     error: e15},
      { data: osExec,      error: e16},
    ] = await Promise.all([
      sb.from('ordens').select('*').order('id', { ascending: false }),
      sb.from('equipamentos').select('*').order('setor'),
      sb.from('equipamento_componentes').select('*'),
      sb.from('preventiva').select('*').order('equip'),
      sb.from('planos').select('*').order('setor'),
      sb.from('lubrificacao').select('*').order('setor'),
      sb.from('lu_execucoes').select('*').order('data', { ascending: false }),
      sb.from('colaboradores').select('*').order('nome'),
      sb.from('ferramentas').select('*').eq('tipo', 'eletrica').is('caixa', null),
      sb.from('ferramentas').select('*').eq('tipo', 'mecanica').is('caixa', null),
      sb.from('ferramentas').select('*').not('caixa', 'is', null),
      sb.from('setores').select('*').order('nome'),
      sb.from('producao').select('*').order('ano').order('mes'),
      sb.from('custos').select('*').order('data', { ascending: false }),
      sb.from('paradas').select('*').order('data', { ascending: false }),
      sb.from('os_execucoes').select('*').order('os_id'),
    ]);

    // e12–e15 são tolerados: tabelas podem não existir ainda
    const errs = [e1,e2,e3,e4,e5,e6,e7,e8,e9,e10,e11].filter(Boolean);
    if (errs.length) throw new Error(errs.map(e => e.message).join('; '));

    // Montar equipamentos com componentes embutidos
    STATE.equipamentos = (equips || []).map(e => ({
      ...e,
      componentes: (comps || [])
        .filter(c => c.equipamento_id === e.id)
        .map(c => ({ qty: c.qty, nome: c.nome }))
    }));

    // Normalizar campo descricao → desc e snake_case → camelCase para compatibilidade
    STATE.ordens = (ordens || []).map(o => ({
      ...o,
      desc:           o.descricao,
      dataProg:       o.data_prog,
      dataConcl:      o.data_concl,
      paradaEquip:    o.parada_equip    ?? false,
      paradaEquipIni: o.parada_equip_ini,
      paradaEquipIniH:o.parada_equip_ini_h,
      paradaEquipRet: o.parada_equip_ret,
      paradaEquipRetH:o.parada_equip_ret_h,
      paradaProd:     o.parada_prod     ?? false,
      paradaProdIni:  o.parada_prod_ini,
      paradaProdIniH: o.parada_prod_ini_h,
      paradaProdRet:  o.parada_prod_ret,
      paradaProdRetH: o.parada_prod_ret_h,
    }));
    STATE.osExecucoes = osExec || [];

    // Normalizar trimestre → trim (usado em renderPreventiva)
    STATE.preventiva = (prev || []).map(p => ({ ...p, trim: p.trimestre ?? p.trim }));
    STATE.planos           = planos  || [];
    STATE.lubrificacao     = lu      || [];
    // Computar key para matching em renderLubrificacao
    STATE.luExecucoes = (luExec || []).map(e => ({
      ...e,
      key: `${e.setor}||${e.equip}||${e.item}`,
    }));
    STATE.colaboradores    = colab   || [];
    STATE.ferramentasEletrica = fEl  || [];
    STATE.ferramentasMecanica = fMec || [];
    STATE.caixasFerramentas   = caixas || [];
    STATE.setores             = (setores || []).map(s => s.nome);
    STATE.producao            = producao || [];
    STATE.custos              = custos   || [];
    // Normalizar horas → float para garantir cálculo correto dos KPIs
    STATE.paradas             = (paradas || []).map(p => ({ ...p, horas: parseFloat(p.horas) || 0 }));

    setLoadingMsg('Pronto!');
    hideLoading();

  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    setLoadingMsg('Erro: ' + err.message);
    document.querySelector('.loading-bar-inner').style.background = 'var(--danger)';
    setTimeout(hideLoading, 3000);
  }
}

// ══════════════════════════════════════════════════════════════════════
// DEMO_DATA — DADOS DE DEMONSTRAÇÃO / FALLBACK
//
// Esta constante contém dados estáticos usados APENAS como fallback
// quando o Supabase não está configurado (URL/KEY não definidos).
// Em operação normal, nenhuma função de renderização lê DEMO_DATA —
// toda a aplicação consulta exclusivamente o objeto STATE, que é
// populado pelo Supabase em loadAll(). Qualquer alteração aqui não
// afeta os dados reais da aplicação.
// ══════════════════════════════════════════════════════════════════════

const DEMO_DATA = {

  ordens: [
    {id:1,data:'2024-07-25',hora:'16:10',req:'Reginaldo',setor:'Secagem',tipo:'Corretiva',natureza:'Predial',desc:'Troca da maçaneta da porta do CCM.',prioridade:'Baixa',dataProg:'2024-07-25',dataConcl:'2024-07-25',realizado:'Retirada e troca da maçaneta danificada por outra nova.',exec:'Valmir / Luan',status:'Concluído'},
    {id:2,data:'2024-07-25',hora:'19:31',req:'Reginaldo',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca das serrinhas do rolo da cevadeira.',prioridade:'Alta',dataProg:'2024-07-29',dataConcl:'2024-07-29',realizado:'Retirada do rolo da cevadeira para troca das serrinhas por empresa terceira, regulado e recolocado pela manutenção.',exec:'Valmir / Luan',status:'Concluído'},
    {id:3,data:'2024-07-25',hora:'19:29',req:'Reginaldo',setor:'Caldeira',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca das borrachas dos visores do nível de água da caldeira.',prioridade:'Baixa',dataProg:'2024-07-30',dataConcl:'2024-07-30',realizado:'Retirada e troca de um vidro, troca das borrachas dos dois visores de nível da caldeira.',exec:'Valmir / Luan',status:'Concluído'},
    {id:4,data:'2024-07-26',hora:'08:00',req:'Luan',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca do retentor da bomba de transferência de massa.',prioridade:'Alta',dataProg:'2024-07-26',dataConcl:'2024-07-26',realizado:'Retirada da bomba, troca do retentor e recolocação.',exec:'Valmir / Luan',status:'Concluído'},
    {id:5,data:'2024-07-26',hora:'09:00',req:'Luan',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca do estator da bomba de transferência de massa.',prioridade:'Alta',dataProg:'2024-07-26',dataConcl:'2024-07-26',realizado:'Retirada da bomba, troca do estator e recolocação.',exec:'Valmir / Luan',status:'Concluído'},
    {id:6,data:'2024-07-26',hora:'14:20',req:'Reginaldo',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca da gaxeta do eixo da peneira vibratória.',prioridade:'Média',dataProg:'2024-07-30',dataConcl:'2024-07-30',realizado:'Retirada e troca da gaxeta do eixo da peneira vibratória.',exec:'Valmir / Luan',status:'Concluído'},
    {id:7,data:'2024-07-29',hora:'07:00',req:'Luan',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca do rotor e estator da bomba de transporte de massa.',prioridade:'Alta',dataProg:'2024-07-29',dataConcl:'2024-07-29',realizado:'Retirada da bomba, troca do rotor e estator e recolocação.',exec:'Valmir / Luan',status:'Concluído'},
    {id:8,data:'2024-07-29',hora:'10:00',req:'Luan',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Regulagem da cevadeira após troca das serrinhas.',prioridade:'Alta',dataProg:'2024-07-29',dataConcl:'2024-07-29',realizado:'Regulagem da cevadeira após troca das serrinhas pelo técnico da empresa terceira.',exec:'Valmir / Luan',status:'Concluído'},
    {id:9,data:'2024-07-30',hora:'08:00',req:'Luan',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca de rolamento da peneira vibratória.',prioridade:'Alta',dataProg:'2024-07-30',dataConcl:'2024-07-30',realizado:'Retirada e troca do rolamento da peneira vibratória.',exec:'Valmir / Luan',status:'Concluído'},
    {id:10,data:'2024-07-30',hora:'13:00',req:'Luan',setor:'Secagem',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca de correia do transportador de farinha.',prioridade:'Média',dataProg:'2024-07-30',dataConcl:'2024-07-30',realizado:'Retirada e troca da correia do transportador de farinha.',exec:'Valmir / Luan',status:'Concluído'},
    {id:11,data:'2024-07-31',hora:'06:00',req:'Luan',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Parada para troca do rolo da cevadeira — 6h às 11h.',prioridade:'Alta',dataProg:'2024-07-31',dataConcl:'2024-07-31',realizado:'Retirada e troca do rolo completo da cevadeira.',exec:'Valmir / Luan',status:'Concluído'},
    {id:12,data:'2024-07-31',hora:'11:00',req:'Luan',setor:'Extração',tipo:'Preventiva',natureza:'Mecânica',desc:'Verificação geral dos mancais da rosca transportadora após parada.',prioridade:'Média',dataProg:'2024-07-31',dataConcl:'2024-07-31',realizado:'Verificação e lubrificação de todos os mancais da rosca transportadora.',exec:'Valmir / Luan',status:'Concluído'},
    {id:13,data:'2024-07-31',hora:'17:30',req:'Luan',setor:'Secagem',tipo:'Corretiva',natureza:'Mecânica',desc:'Trocar junta do flange do sensor de temperatura.',prioridade:'Alta',dataProg:'2024-07-31',dataConcl:'2024-07-31',realizado:'Retirada e troca da junta do flange do sensor de temperatura.',exec:'Valmir / Luan',status:'Concluído'},
    {id:14,data:'2024-08-01',hora:'08:00',req:'Luan',setor:'Ensaque 2',tipo:'melhoria',natureza:'Oficina',desc:'Colocar chapa de inox onde está desfazendo as peneiras.',prioridade:'Baixa',dataProg:'2024-08-01',dataConcl:'2024-08-01',realizado:'Foi aplicada chapa de inox onde estava desfazendo as peneiras.',exec:'Valmir / Luan',status:'Concluído'},
    {id:15,data:'2024-07-31',hora:'07:30',req:'Luan',setor:'Extração',tipo:'Corretiva',natureza:'Mecânica',desc:'Troca do rolo da cevadeira.',prioridade:'Alta',dataProg:'2024-07-31',dataConcl:'2024-07-31',realizado:'Retirada e troca do rolo da cevadeira, parada de processo 06:00 às 11:00.',exec:'Valmir / Luan',status:'Concluído'},
    {id:16,data:'2024-08-03',hora:'10:33',req:'Eduardo',setor:'Extração',tipo:'Corretiva',natureza:'Predial',desc:'Quadro de ferramentas à vista, confeccionar novo quadro em chapa.',prioridade:'Média',dataProg:'2024-08-15',dataConcl:null,realizado:null,exec:null,status:'Em Aberto'},
    {id:17,data:'2024-08-03',hora:'10:36',req:'Eduardo',setor:'Ensaque 3',tipo:'melhoria',natureza:'Predial',desc:'Instalar utensílio e suporte de vassouras e rodo no setor.',prioridade:'Média',dataProg:'2024-08-06',dataConcl:'2024-08-06',realizado:'Foi instalado o suporte e utensílios do setor.',exec:'Valmir / Luan',status:'Concluído'},
    {id:18,data:'2024-08-03',hora:'10:37',req:'Eduardo',setor:'Poço',tipo:'melhoria',natureza:'Predial',desc:'Instalar abrigo no poço de água potável conforme projeto enviado.',prioridade:'Alta',dataProg:null,dataConcl:null,realizado:null,exec:null,status:'Em Aberto'},
  ],

  equipamentos: [
    {setor:'EXTRAÇÃO',nome:'Rosca transportadora de mandioca',componentes:[{qty:2,nome:'MANCAIS F 215'}, {qty:2,nome:'ROLAMENTOS UC 215 EIXO 3\'\''}, {qty:1,nome:'MOTO REDUTOR GD50 1 X 31,25 - SAÍDA 55,68 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Pré lavador de mandioca',componentes:[{qty:2,nome:'MANCAIS SN 522 MDS'}, {qty:2,nome:'ROLAMENTOS 22222 KC3'}, {qty:2,nome:'BUCHAS H 322 1° LINHA'}, {qty:1,nome:'REDUTOR PLANETARIO GEREMIA PG2503 RED 1X110 MC 4702.011.047 B5 16RPM SAÍDA + MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Rosca transportadora de mandioca',componentes:[{qty:2,nome:'MANCAIS F 215'}, {qty:2,nome:'ROLAMENTOS UC 215 EIXO 3\'\''}, {qty:1,nome:'MOTO REDUTOR GD50 1 X 31,25 - SAÍDA 55,68 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Lavador de mandioca',componentes:[{qty:2,nome:'MANCAIS SN 522 MDS'}, {qty:2,nome:'ROLAMENTOS 22222 KC3'}, {qty:2,nome:'BUCHAS H 322 1° LINHA'}, {qty:1,nome:'REDUTOR BREVINI ET3250-MN1-110-619.5232.2742-B3 + MOTOR TRIF 220-380 IP55 25 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Peneira de separação de casquinha para reaproveitamento de água',componentes:[{qty:1,nome:'MANCAL F 211'}, {qty:1,nome:'ROLAMENTO UC 211 EIXO DE 2\'\''}, {qty:1,nome:'ROLAMENTO 1208 SC3'}, {qty:3,nome:'CORREIAS B 75 DENTADA'}, {qty:1,nome:'SELO MECANICO T01 1.3-4\'\' VITON'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'BOMBA CENTRIFUGA - MBL 7,5 CV 2P'}, {qty:1,nome:'POLIA FF Ø500 X 3 CANAL B'}, {qty:1,nome:'POLIA FF Ø110 X 3 CANAL B'}]},
    {setor:'EXTRAÇÃO',nome:'Esteira de inspeção de raízes',componentes:[{qty:4,nome:'MANCAIS F208'}, {qty:4,nome:'ROLAMENTOS UC208 EIXO Ø40 mm'}, {qty:1,nome:'MOTO-REDUTOR GD 40 RED. 1 X 52,73 - SAÍDA 32,24 RPM - VAZADO + MOTOR WEG W22 IP55 - 4 POLOS 1740 RPM'}, {qty:1,nome:'CORREIA TRANSP PVC DUBLADA BRANCA ATOXICA 23 X 3 LONAS #5,5MM ESP.'}]},
    {setor:'EXTRAÇÃO',nome:'Picador de mandioca',componentes:[{qty:2,nome:'MANCAIS SN 515 MDS'}, {qty:2,nome:'ROLAMENTOS 22215 KC3'}, {qty:2,nome:'BUCHAS HE 315'}, {qty:1,nome:'MOTOR W22 PREMIUM IR3 TRIF 220-380 IP55 10 CV 4P 1740 RPM'}, {qty:4,nome:'CORREIAS B72'}, {qty:1,nome:'POLIA DE AÇO CARBONO Ø400 mm X 4 CANAL B'}, {qty:1,nome:'POLIA FF Ø100 X 4 CANAL B'}]},
    {setor:'EXTRAÇÃO',nome:'Rosca transportadora de mandioca picada',componentes:[{qty:1,nome:'MANCAL F 213'}, {qty:1,nome:'ROLAMENTO UC 213 EIXO 2.1-'}, {qty:3,nome:'CORREIAS B88 DENTADA'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 5 CV 6P 1140 RPM PREM IR3'}, {qty:1,nome:'SELO MECANICO T01 2.1-4\'\' VITON'}, {qty:1,nome:'ROLAMENTO 1210 SC3'}, {qty:1,nome:'POLIA FF TIPO R Ø600 mm X 3 CANAL B'}, {qty:1,nome:'POLIA FF TIPO S Ø100  mm X 3 CANAL B'}]},
    {setor:'EXTRAÇÃO',nome:'Dosador de mandioca picada',componentes:[{qty:2,nome:'MANCAIS F 211'}, {qty:2,nome:'ROLAMENTOS UC 211 EIXO DE 2\'\''}, {qty:1,nome:'MOTO REDUTOR GD40 1X52,73 - SAIDA 32,24 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Cevadeira rotor Ø800 mm',componentes:[{qty:2,nome:'ROLAMENTOS 22217 + 02 BUCHAS H 317 - EIXO Ø75 MM'}, {qty:2,nome:'RETENTOR VEDABRÁS - 30609R2 - (100 X 130 X 13 MM)'}, {qty:1,nome:'RETENTOR VEDABRÁS - 30468R2 - (75 X 95 X 12 MM)'}, {qty:1,nome:'ACOPLAMENTO TIPO PNEU MODELO RD – 90'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 100 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'GUINCHO ELÉTRICO MOTOMIL 300 A 600KG 220 MONOFÁSICO'}, {qty:1,nome:'PLACA MAGNÉTICA 200 X 200MM – 7500 GRAUSS'}]},
    {setor:'EXTRAÇÃO',nome:'Bomba de transporte de massa',componentes:[{qty:1,nome:'MOTO-REDUTOR GA 132 RED. 1 X 7,13 - SAÍDA 238,4 RPM – VAZADO + MOTOR TRIF 220-380 IP55 7,5 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'GAXETA ENSEBADA GRAFITADA 3/8" COM 420 MM DE COMP.'}, {qty:1,nome:'ESTATOR 70.1 BORRACHA 206'}, {qty:1,nome:'ROTOR F70.1 INOX 304 MACIÇO'}]},
    {setor:'EXTRAÇÃO',nome:'Tanque pulmão para filtro prensa - 11,50 m³',componentes:[{qty:1,nome:'VALVULA BORBOLETA DISCO INOX 304 COM ALAVANCA 8”'}]},
    {setor:'EXTRAÇÃO',nome:'Bomba de carregamento para filtro prensa automático',componentes:[{qty:1,nome:'MOTO REDUTOR GA180 - 1X7,08 - SAÍDA 240 RPM - 30 CV 4P - COM PÉ E FLANGE DE SAÍDA + MOTOR TRIF 220-380 IP55 30 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'GAXETA ENSEBADA GRAFITADA 3/8" 660 MM DE COMP.'}, {qty:1,nome:'ESTATOR 2HF-80 NBRA C. FURO PARA SENSOR'}, {qty:1,nome:'ROTOR 2HF-80 INOX 304 MACICO'}]},
    {setor:'EXTRAÇÃO',nome:'Filtro prensa automático FPA-44 com 40 placas',componentes:[{qty:1,nome:'MOTO-REDUTOR GD30 3R – RED. 1 X 140 – SAÍDA 12,14 RPM + MOTOR TRIF 220-380 IP55 0,75 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'O´RING CBV - 197 X 4 - Nbr-PT 70sh'}, {qty:1,nome:'O´RING CBV - 138 X 4 - Nbr-PT 70sh'}, {qty:1,nome:'O´RING CBV - 68 X 10 - Nbr-PT 70 sh'}, {qty:1,nome:'O´RING CBV - 268 x 4,5 - SPECI NBR - PT70SH'}, {qty:1,nome:'O´RING CBV - 327 x 4,5 - SPECI NBR - PT70SH'}, {qty:1,nome:'O´RING CBV - 347 x 4,5 - SPECI NBR - PT70SH'}, {qty:1,nome:'O´RING CBV - 367 x 4,5 - SPECI NBR - PT70SH'}, {qty:1,nome:'O´RING CBV - 402 x 4,5 - SPECI NBR - PT70SH'}, {qty:1,nome:'O´RING CBV - 167 x 3 - SPECI NBR - PT70SH'}, {qty:1,nome:'O´RING CBV - 94 X 3 - SPECI NBR - PT70SH'}, {qty:2,nome:'GAXETA MOLITHANE POLIPACK 650010417750326 - ØINT.264,60 X ØEXT.290,00 X 3/4" X 1/2" - PARKER'}, {qty:2,nome:'GAXETA MOLITHANE POLIPACK 375082506253263 - ØINT.8.1/4" X ØEXT.9" X 5/8" X 3/8" - PARKER 1 - ANEL RASPADOR D-8250 – PARKER'}, {qty:1,nome:'GAXETA APC - Nº1597 - 1" X 1.3/8" X 5/16"'}, {qty:1,nome:'FITA DE TEFLON COM BRONZE 1/8" X 1" X 1800MM DE COMPRIMENTO'}, {qty:1,nome:'MANGUEIRA MAA 300 1" - AR/ÁGUA 300 PSI - 3000 MM DE COMPRIMENTO'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 7,5 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'I3329911018 - BOMBA HIDR.ENG. P11A D04 AQ PARKER'}, {qty:1,nome:'I3329111134 - BOMBA HIDR.ENG. P11A D27 AZ PARKER'}, {qty:2,nome:'ACOPLAMENTO HDA AC42'}, {qty:1,nome:'ACOPLAMENTO HDA AC28'}, {qty:1,nome:'S314 - FILTRO SUCCAO S 314 1" NPT 50L (100004 )'}, {qty:1,nome:'S520 - FILTRO SUCCAO S 520 1.1/2" NPT 90L (100005 )'}, {qty:1,nome:'FILTRO DE RETORNO 1 BSP 10 NOM FR16-A010-08B'}, {qty:1,nome:'ROLAMENTO 6306 ZZ - 30 X 72 X 19 MM'}, {qty:4,nome:'ROLAMENTO 6205 ZZ - 25 X 52 X 15 MM'}, {qty:2,nome:'MANCAL P 208'}, {qty:2,nome:'ROLAMENTO UC 208 EIXO 1.1-2\'\''}, {qty:4,nome:'ENGRENAGENS EM AÇO INOX 304 PARA CORRENTE ASA 60 COM 15 DENTES'}, {qty:2,nome:'CORRENTE ASA 60 INOX 11850 mm DE COMP.'}, {qty:1,nome:'VALVULA GUILHOTINA LH S6000 4 CORPO E FACA INOX 316 PNEUMATICO COD-4W6AHSAWALE'}, {qty:1,nome:'VALVULA ESF TRIP TOTAL INOX 304 OD 3-4\'\' SWO C. ATUADOR DA32 MGA'}, {qty:1,nome:'VALVULA ESF TRIP TOTAL INOX 304 OD 1\'\' SWO C. ATUADOR DA52 MGA'}, {qty:1,nome:'VALVULA ESF TRIP TOTAL INOX 304 OD 1-1-4\'\' SWO C. ATUADOR DA52 MGA'}, {qty:1,nome:'VALVULA ESF TRIP TOTAL INOX 304 OD 2-1-2\'\' SWO C. ATUADOR DA75 MGA'}, {qty:1,nome:'VALVULA ESF TRIP TOTAL INOX 3-4\'\' SWO ALAVANCA MGA'}, {qty:1,nome:'VALVULA ESF TRIP TOTAL INOX 1\'\' SWO ALAVANCA MGA'}, {qty:1,nome:'COTOVELO GIRATÓRIO INOX 1/4 X 8MM'}, {qty:1,nome:'VÁLVULA SOLENOIDE P2A20RS25-IP02E DIRE 1/4 ADEX 5/2VIAS SOL 24VDC'}, {qty:2,nome:'BORNE RELE 24VCA/ACC REVERSÍVEL 6A COMPLETO SLIM 6MM'}, {qty:2,nome:'BORNE RELE 24VCA/ACC REVERSÍVEL 16A COMPLETO'}, {qty:2,nome:'RELE DE CONTROLE DE FASE TRIFÁSICO 183...528 VCA 2 REV F FASE'}, {qty:2,nome:'CONTATO AUXILIAR FRONTAL GVAE11 1 - SENSOR INDUTIVO DS-5MM 12/24VCC 3 FIOS PNP N/A 2M'}, {qty:2,nome:'SENSOR MAGNÉTICO KT-32R 10 - FUSÍVEL DE VIDRO 3A 5X20MM'}, {qty:1,nome:'TRANSMISSOR DE PRESSÃO WIKA 0-16 S11'}, {qty:1,nome:'TRANSMISSOR DE PRESSÃO WIKA 0-04 S11'}, {qty:2,nome:'CABO DE REDE RJ45 1M'}, {qty:1,nome:'MANGUEIRA PU AZUL 6MM - 3000 MM DE COMP.'}, {qty:2,nome:'MANGUEIRA PU AZUL 8MM - 3000 MM DE COMP.'}, {qty:2,nome:'CONEXÃO Y 6MM'}, {qty:2,nome:'CONECTOR COTOVELO GIRATÓRIO 1/8 X 6MM'}, {qty:1,nome:'FIM DE CURSO ZV1H 236-11ZP TELEMECANIC'}, {qty:1,nome:'FIM DE CURSO (ATUADORES) APL21ON'}]},
    {setor:'EXTRAÇÃO',nome:'Tanque para retro-lavagem',componentes:[{qty:1,nome:'BOMBA THEBE THA-16 + MOTOR + MOTOR TRIF 220-380 IP55 3 CV 2P 3540 RPM PREM IR3'}, {qty:3,nome:'VÁLVULA BORBOLETA INOX 304 COM ALAVANCA SOLDÁVEL 4"'}, {qty:3,nome:'VÁLVULA BORBOLETA INOX 304 COM ALAVANCA SOLDÁVEL 3"'}, {qty:1,nome:'VÁLVULA BORBOLETA INOX 304 COM ALAVANCA SOLDÁVEL 2.1/2"'}, {qty:1,nome:'VÁLVULA BORBOLETA INOX 304 COM ALAVANCA SOLDÁVEL 1.1/2"'}]},
    {setor:'EXTRAÇÃO',nome:'Caixa coletora de massa FPA-44',componentes:[{qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTOS UC 208 - EIXO Ø40 MM'}, {qty:2,nome:'MANCAL F213'}, {qty:2,nome:'ROLAMENTOS UC213 - EIXO Ø63,5 MM'}, {qty:1,nome:'GAXETA ENSEBADA GRAFITADA 3/8" - 1600 MM DE COMPRIMENTO'}, {qty:1,nome:'GAXETA ENSEBADA GRAFITADA 5/8" - 1600 MM DE COMPRIMENTO'}, {qty:2,nome:'MOTO-REDUTOR GD40 - RED. 1 X 86,67 - SAÍDA 19,61 RPM + MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'MOTO-REDUTOR GD60 - RED. 1 X 216,79 - SAÍDA 5,30 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'CILINDRO PNEUMÁTICO PARKER P1E-G100MSO-0350'}, {qty:2,nome:'FIM DE CURSO SIEMENS - 3SE5 232 0LE10'}, {qty:2,nome:'BUCHA DE TEFLON GRAFITADO 73 X 38,1 X 100 mm'}]},
    {setor:'EXTRAÇÃO',nome:'Caixa coletora de massa FPA-30',componentes:[{qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTOS UC 208 - EIXO Ø40 MM'}, {qty:2,nome:'MANCAL F213'}, {qty:2,nome:'ROLAMENTOS UC213 - EIXO Ø63,5 MM'}, {qty:1,nome:'GAXETA ENSEBADA GRAFITADA 3/8" - 1600 MM DE COMPRIMENTO'}, {qty:1,nome:'GAXETA ENSEBADA GRAFITADA 5/8" - 1600 MM DE COMPRIMENTO'}, {qty:2,nome:'MOTO-REDUTOR GD40 - RED. 1 X 86,67 - SAÍDA 19,61 RPM + MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'MOTO-REDUTOR GD60 - RED. 1 X 216,79 - SAÍDA 5,30 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'CILINDRO PNEUMÁTICO PARKER P1E-G100MSO-0350'}, {qty:2,nome:'FIM DE CURSO SIEMENS - 3SE5 232 0LE10'}, {qty:2,nome:'BUCHA DE TEFLON GRAFITADO 73 X 38,1 X 100 mm'}]},
    {setor:'EXTRAÇÃO',nome:'Rosca horizontal CCM Ø250 x 3900 mm',componentes:[{qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTO UC 208 - EIXO Ø40 MM'}, {qty:1,nome:'MOTO-REDUTOR GD40 - RED. 1X14,05 - SAÍDA 121 RPM - VAZADO + MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Rosca horizontal CCM Ø250 x 4680 mm',componentes:[{qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTO UC 208 - EIXO Ø40 MM'}, {qty:1,nome:'MOTO-REDUTOR GD40 - RED. 1X14,05 - SAÍDA 121 RPM - VAZADO + MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Rosca vertical Ø250 x 5000 mm',componentes:[{qty:3,nome:'CORREIAS B94'}, {qty:1,nome:'POLIA DE FERRO FUNDIDO Ø100 X 3 CANAL B'}, {qty:1,nome:'POLIA LISA DE AÇO CARBONO Ø625 mm'}, {qty:2,nome:'ROLAMENTO 6208 (40 X 80 X 18 MM)'}, {qty:1,nome:'MANCAL F211'}, {qty:1,nome:'ROLAMENTO UC211 - EIXO Ø2"'}, {qty:1,nome:'SELO MECANICO T01 1 3/4\'\' VITON'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 5 CV 6P 1140 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Rosca vertical Ø250 x 5300 mm',componentes:[{qty:3,nome:'CORREIAS B94'}, {qty:1,nome:'POLIA DE FERRO FUNDIDO Ø100 X 3 CANAL B'}, {qty:1,nome:'POLIA LISA DE AÇO CARBONO Ø625 mm'}, {qty:2,nome:'ROLAMENTO 6208 (40 X 80 X 18 MM)'}, {qty:1,nome:'MANCAL F211'}, {qty:1,nome:'ROLAMENTO UC211 - EIXO Ø2"'}, {qty:1,nome:'SELO MECANICO T01 1 3/4\'\' VITON'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 5 CV 6P 1140 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Esfarelador de massa prensada (2x)',componentes:[{qty:1,nome:'MANCAL F205'}, {qty:1,nome:'ROLAMENTO UC 205 EIXO Ø1”'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Transportador tipo pás Ø200 x 10175 mm',componentes:[{qty:4,nome:'MANCAL F208'}, {qty:4,nome:'ROLAMENTO UC208 - EIXO Ø40 MM'}, {qty:1,nome:'MOTO-REDUTOR GD30 RED. 1 X 35 - SAÍDA 48,57 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'EXTRAÇÃO',nome:'Transportador tipo pás Ø200 x 11500 mm',componentes:[{qty:4,nome:'MANCAL F208'}, {qty:4,nome:'ROLAMENTO UC208 - EIXO Ø40 MM'}, {qty:1,nome:'MOTO-REDUTOR GD30 RED. 1 X 35 - SAÍDA 48,57 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'ÁREA SECA',nome:'Dosador de massa prensada para forno pré aquecedor',componentes:[{qty:4,nome:'MANCAL F208'}, {qty:4,nome:'ROLAMENTO UC208 - EIXO Ø40 MM'}, {qty:1,nome:'ENGRENAGEM PARA CORRENTE ASA60 COM 50 DENTES'}, {qty:1,nome:'ENGRENAGEM PARA CORRENTE ASA60 COM 15 DENTES'}, {qty:1,nome:'CORRENTE ASA60 COM 1500 MM DE COMPRIMENTO'}, {qty:1,nome:'MOTO-REDUTOR GD40 RED. 1 X 46,67 - SAÍDA 36,43 RPM MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'ÁREA SECA',nome:'Dosador de massa prensada para forno pré aquecedor',componentes:[{qty:4,nome:'MANCAL F208'}, {qty:4,nome:'ROLAMENTO UC208 - EIXO Ø40 MM'}, {qty:1,nome:'ENGRENAGEM PARA CORRENTE ASA60 COM 50 DENTES'}, {qty:1,nome:'ENGRENAGEM PARA CORRENTE ASA60 COM 15 DENTES'}, {qty:1,nome:'CORRENTE ASA60 COM 1500 MM DE COMPRIMENTO'}, {qty:1,nome:'MOTO-REDUTOR GD40 RED. 1 X 46,67 - SAÍDA 36,43 RPM MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3'}]},
    {setor:'ÁREA SECA',nome:'Forno pré aquecedor de massa',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 15 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 10 CV 4P 1740 RPM PREM IR3'}, {qty:2,nome:'MANCAL F215'}, {qty:2,nome:'ROLAMENTOS UC215 - EIXO Ø3"'}, {qty:1,nome:'GAXETA ENSEBADA GRAFITADA 3/8" 1800 MM DE COMP. 4 - CORREIA B90'}, {qty:1,nome:'POLIA FF Ø120 X 4 CANAL B'}, {qty:1,nome:'POLIA FF Ø500 X 4 CANAL B'}, {qty:4,nome:'CORREIAS B90'}]},
    {setor:'ÁREA SECA',nome:'Forno pré aquecedor de massa',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 15 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 10 CV 4P 1740 RPM PREM IR3'}, {qty:2,nome:'MANCAL F215'}, {qty:2,nome:'ROLAMENTOS UC215 - EIXO Ø3"'}, {qty:1,nome:'GAXETA ENSEBADA GRAFITADA 3/8" 1800 MM DE COMP. 4 - CORREIA B90'}, {qty:1,nome:'POLIA FF Ø120 X 4 CANAL B'}, {qty:1,nome:'POLIA FF Ø500 X 4 CANAL B'}, {qty:4,nome:'CORREIAS B90'}]},
    {setor:'ÁREA SECA',nome:'Forno contínuo a vapor',componentes:[{qty:1,nome:'REDUTOR BREVINI ET3250-MN1-110-619.5232.2742-B3 + MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM C. FLANGE FC NEMA E CAIXA ESQUERDA COD. 12218734 IR3'}, {qty:2,nome:'ROLAMENTO 23036EMKW33C3'}, {qty:2,nome:'BUCHA H 3036 1°'}, {qty:2,nome:'GAXETA GRAFITADA 1/2" 565 mm DE COMP.'}, {qty:2,nome:'GAXETA GRAFITADA 1/2" 574 mm DE COMP.'}, {qty:2,nome:'GAXETA GRAFITADA 1/2" 590 mm DE COMP.'}, {qty:2,nome:'BUCHA DE BORRACHA 80SH EXT.102 X INT.25,4 X 30MM DE ALTURA'}, {qty:2,nome:'FLEXIVEL INOX C FLANGE AC 150LBS 1 PONTA GIRAT E 1 PONTA FIXA 1-2 X 300MM'}, {qty:1,nome:'ACOPLAMENTO AF-46'}, {qty:1,nome:'BOMBA DE ENGRENAGEM DESL 2,5 11101002004'}, {qty:1,nome:'BOCAL DE ENCHIMENTO C FILTRO DE AR BE-761'}, {qty:1,nome:'MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI - 246 KG-CM² - 330 MM COMP.'}, {qty:1,nome:'MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI - 246 KG-CM² - 360 MM COMP.'}, {qty:1,nome:'MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI 246 KG-CM² - 470 MM COMP.'}, {qty:2,nome:'MANGUEIRA FLEXIVEL HIDRAULICA 3-8 - 4000 PSI - 280KG-CM² - 600 MM COMP.'}, {qty:1,nome:'VALVULA TIPO AGULHA BRONZE 3000 LBS 1-2\'\''}, {qty:1,nome:'FILTRO SUCCAO 3-4\'\' NPT 5 GPM 20LPM FTS020A'}, {qty:1,nome:'PLACA MAGNETICA INOX 304 180X180X36 + 15MM DE ABAS ACO 1010-1020 IMAS DE FERRITE'}, {qty:1,nome:'SELO MECÂNICO FCV-A1 2.1/2” UNIPREST'}, {qty:1,nome:'RETENTOR SABO 07461 BRF 117,4 X 142,9 X 12,5MM'}, {qty:2,nome:'GAXETA VEDABRAS 0019421 TIPO U (63.50 X 76.20 X 9.53)'}, {qty:2,nome:'ANEL RASPADOR VEDABRAS 0050106 PD (63.50 X 76.20 X 6.35) AS9'}, {qty:1,nome:'CHAVE FIM DE CURSO PLAST - ZV1H 236 11ZP 18843102 (FORNO)'}, {qty:1,nome:'ANEL ORING 0010852 VI VED (106.50 X 3.00)'}]},
    {setor:'ÁREA SECA',nome:'Forno contínuo a vapor',componentes:[{qty:1,nome:'REDUTOR BREVINI ET3250-MN1-110-619.5232.2742-B3 + MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM C. FLANGE FC NEMA E CAIXA ESQUERDA COD. 12218734 IR3'}, {qty:2,nome:'ROLAMENTO 23036EMKW33C3'}, {qty:2,nome:'BUCHA H 3036 1°'}, {qty:2,nome:'GAXETA GRAFITADA 1/2" 565 mm DE COMP.'}, {qty:2,nome:'GAXETA GRAFITADA 1/2" 574 mm DE COMP.'}, {qty:2,nome:'GAXETA GRAFITADA 1/2" 590 mm DE COMP.'}, {qty:2,nome:'BUCHA DE BORRACHA 80SH EXT.102 X INT.25,4 X 30MM DE ALTURA'}, {qty:2,nome:'FLEXIVEL INOX C FLANGE AC 150LBS 1 PONTA GIRAT E 1 PONTA FIXA 1-2 X 300MM'}, {qty:1,nome:'ACOPLAMENTO AF-46'}, {qty:1,nome:'BOMBA DE ENGRENAGEM DESL 2,5 11101002004'}, {qty:1,nome:'BOCAL DE ENCHIMENTO C FILTRO DE AR BE-761'}, {qty:1,nome:'MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI - 246 KG-CM² - 330 MM COMP.'}, {qty:1,nome:'MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI - 246 KG-CM² - 360 MM COMP.'}, {qty:1,nome:'MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI 246 KG-CM² - 470 MM COMP.'}, {qty:2,nome:'MANGUEIRA FLEXIVEL HIDRAULICA 3-8 - 4000 PSI - 280KG-CM² - 600 MM COMP.'}, {qty:1,nome:'VALVULA TIPO AGULHA BRONZE 3000 LBS 1-2\'\''}, {qty:1,nome:'FILTRO SUCCAO 3-4\'\' NPT 5 GPM 20LPM FTS020A'}, {qty:1,nome:'PLACA MAGNETICA INOX 304 180X180X36 + 15MM DE ABAS ACO 1010-1020 IMAS DE FERRITE'}, {qty:1,nome:'SELO MECÂNICO FCV-A1 2.1/2” UNIPREST'}, {qty:1,nome:'RETENTOR SABO 07461 BRF 117,4 X 142,9 X 12,5MM'}, {qty:2,nome:'GAXETA VEDABRAS 0019421 TIPO U (63.50 X 76.20 X 9.53)'}, {qty:2,nome:'ANEL RASPADOR VEDABRAS 0050106 PD (63.50 X 76.20 X 6.35) AS9'}, {qty:1,nome:'CHAVE FIM DE CURSO PLAST - ZV1H 236 11ZP 18843102 (FORNO)'}, {qty:1,nome:'ANEL ORING 0010852 VI VED (106.50 X 3.00)'}]},
    {setor:'ÁREA SECA',nome:'Sistema de retorno de condensado',componentes:[{qty:2,nome:'BOMBA THEBE P15-2N - MOTOR TRIF 220-380 IP55 5 CV 2P 3540 RPM IR3'}, {qty:3,nome:'JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 1\'\''}, {qty:19,nome:'JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 1 1-2\'\''}, {qty:1,nome:'JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 4\'\''}, {qty:1,nome:'MANOMETRO VERTICAL SEMI INOX 0 A 21 KG 300PSI 1-2\'\' Ø100MM'}, {qty:2,nome:'VALVULA DE RETENCAO INOX 316 TIPO WAFER  1 1-2\'\''}, {qty:5,nome:'VALVULA AC ESF INOX TRIP PR 1 1-2\'\' FLANGE 150LBS TF MGA'}, {qty:2,nome:'SIFÃO TROMBETA 1-2\'\''}, {qty:2,nome:'FILTRO Y BRONZE 1 1-2\'\'\' 150LBS C. ROSCA'}, {qty:1,nome:'PRESSOSTATO ESC. 22 A 300BAR BORNES 1NANF DIF.REG.2NIV XMLB300D2S11'}, {qty:2,nome:'FLEXIVEL INOX 1 1-2\'\' X 200MM 1PONTA C. ROSCA 1 1-2\'\' BSP 11 F - UMA PONTA FLANGE GIR 1 1-2\'\' 150LBS'}, {qty:1,nome:'VALVULA AC ESF INOX TRIP PR 1\'\' FLANGE 150LBS TF'}, {qty:3,nome:'VALVULA AC ESF INOX TRIP PR 1-2\'\' ROSCA 300LBS'}, {qty:1,nome:'BUJÃO DE NÍVEL PARA BOBMA DE CONDENSDO UNIPREST'}]},
    {setor:'ÁREA SECA',nome:'Sistema de retorno de condensado',componentes:[{qty:2,nome:'BOMBA THEBE P15-2N - MOTOR TRIF 220-380 IP55 5 CV 2P 3540 RPM IR3'}, {qty:3,nome:'JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 1\'\''}, {qty:19,nome:'JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 1 1-2\'\''}, {qty:1,nome:'JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 4\'\''}, {qty:1,nome:'MANOMETRO VERTICAL SEMI INOX 0 A 21 KG 300PSI 1-2\'\' Ø100MM'}, {qty:2,nome:'VALVULA DE RETENCAO INOX 316 TIPO WAFER  1 1-2\'\''}, {qty:5,nome:'VALVULA AC ESF INOX TRIP PR 1 1-2\'\' FLANGE 150LBS TF MGA'}, {qty:2,nome:'SIFÃO TROMBETA 1-2\'\''}, {qty:2,nome:'FILTRO Y BRONZE 1 1-2\'\'\' 150LBS C. ROSCA'}, {qty:1,nome:'PRESSOSTATO ESC. 22 A 300BAR BORNES 1NANF DIF.REG.2NIV XMLB300D2S11'}, {qty:2,nome:'FLEXIVEL INOX 1 1-2\'\' X 200MM 1PONTA C. ROSCA 1 1-2\'\' BSP 11 F - UMA PONTA FLANGE GIR 1 1-2\'\' 150LBS'}, {qty:1,nome:'VALVULA AC ESF INOX TRIP PR 1\'\' FLANGE 150LBS TF'}, {qty:3,nome:'VALVULA AC ESF INOX TRIP PR 1-2\'\' ROSCA 300LBS'}, {qty:1,nome:'BUJÃO DE NÍVEL PARA BOBMA DE CONDENSDO UNIPREST'}]},
    {setor:'ÁREA SECA',nome:'Entrada de vapor para forno contínuo a vapor',componentes:[{qty:3,nome:'JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 2\'\''}, {qty:10,nome:'JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 2 1-2\'\''}, {qty:6,nome:'JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 3\'\''}, {qty:3,nome:'MANOMETRO VERTICAL SEMI INOX 0 A 21 KG 300PSI 1-2\'\' Ø100MM'}, {qty:1,nome:'VALVULA AC ESF INOX TRIP PR 3 FLANGE 150LBS TF MGA'}, {qty:1,nome:'VALVULA DE ALIVIO BRONZE DECA 2\'\' S. CABO'}, {qty:1,nome:'FILTRO Y ACO CARBONO 3\'\' FLANGE 150 LBS'}, {qty:3,nome:'SIFÃO TROMBETA 1-2\'\''}, {qty:1,nome:'FLEXIVEL INOX C. FLANGE AC 150LBS 1 PONTA GIRAT E 1 PONTA FIXA 2\'\' X 200MM'}, {qty:2,nome:'FLEXIVEL INOX C. FLANGE AC 150LBS 2.1-2 X 500MM'}, {qty:1,nome:'VALVULA AC ESF INOX TRIP PP 2 FLANGE 150LBS TF MGA'}, {qty:2,nome:'VALVULA AC ESF INOX TRIP PP 2.1-2 FLANGE 150LBS TF MGA'}, {qty:1,nome:'VALVULA REDUTORA DE VAPOR 3POL - A1'}]},
    {setor:'ÁREA SECA',nome:'Entrada de vapor para forno contínuo a vapor',componentes:[{qty:3,nome:'JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 2\'\''}, {qty:10,nome:'JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 2 1-2\'\''}, {qty:6,nome:'JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 3\'\''}, {qty:3,nome:'MANOMETRO VERTICAL SEMI INOX 0 A 21 KG 300PSI 1-2\'\' Ø100MM'}, {qty:1,nome:'VALVULA AC ESF INOX TRIP PR 3 FLANGE 150LBS TF MGA'}, {qty:1,nome:'VALVULA DE ALIVIO BRONZE DECA 2\'\' S. CABO'}, {qty:1,nome:'FILTRO Y ACO CARBONO 3\'\' FLANGE 150 LBS'}, {qty:3,nome:'SIFÃO TROMBETA 1-2\'\''}, {qty:1,nome:'FLEXIVEL INOX C. FLANGE AC 150LBS 1 PONTA GIRAT E 1 PONTA FIXA 2\'\' X 200MM'}, {qty:2,nome:'FLEXIVEL INOX C. FLANGE AC 150LBS 2.1-2 X 500MM'}, {qty:1,nome:'VALVULA AC ESF INOX TRIP PP 2 FLANGE 150LBS TF MGA'}, {qty:2,nome:'VALVULA AC ESF INOX TRIP PP 2.1-2 FLANGE 150LBS TF MGA'}, {qty:1,nome:'VALVULA REDUTORA DE VAPOR 3POL - A1'}]},
    {setor:'ÁREA SECA',nome:'Sistema de aspiração para forno contínuo a vapor',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'RETENTOR SABÓ Nº01046 (40 X 56 X 10)'}, {qty:6,nome:'MOLA INOX ØEXT.25,4 X FIO Ø4 X PASSE 7,5 X 30 MM DE COMP. TOPOS PLANOS'}]},
    {setor:'ÁREA SECA',nome:'Sistema de aspiração para forno contínuo a vapor',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'RETENTOR SABÓ Nº01046 (40 X 56 X 10)'}, {qty:6,nome:'MOLA INOX ØEXT.25,4 X FIO Ø4 X PASSE 7,5 X 30 MM DE COMP. TOPOS PLANOS'}]},
    {setor:'ÁREA SECA',nome:'Rosca inox Ø200 x 2340 mm',componentes:[{qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTO UC208 EIXO Ø1.1/2”'}, {qty:1,nome:'JUNTA RETANGULAR 205 X 185 X 100 mm'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'POLIA FF Ø80 X 2 CANAL B'}, {qty:1,nome:'POLIA AÇO CARBONO LISA Ø400 X 2 CANAL B'}, {qty:2,nome:'CORREIAS B-64'}]},
    {setor:'ÁREA SECA',nome:'Rosca inox Ø200 x 2340 mm',componentes:[{qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTO UC208 EIXO Ø1.1/2”'}, {qty:1,nome:'JUNTA RETANGULAR 205 X 185 X 100 mm'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'POLIA FF Ø80 X 2 CANAL B'}, {qty:1,nome:'POLIA AÇO CARBONO LISA Ø400 X 2 CANAL B'}, {qty:2,nome:'CORREIAS B-64'}]},
    {setor:'ÁREA SECA',nome:'Peneira de carolo',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'POLIA DE FERRO FUNDIDO Ø120 X 1 CANAL A'}, {qty:1,nome:'POLIA DE FERRO FUNDIDO Ø350 X 1 CANAL A'}, {qty:1,nome:'CORREIA A62'}, {qty:2,nome:'MANCAL P20'}, {qty:2,nome:'ROLAMENTO UC208 - EIXO Ø40 MM'}, {qty:1,nome:'ROLAMENTO 6216 - 80 X 140 X 26 MM'}]},
    {setor:'ÁREA SECA',nome:'Peneira de carolo',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'POLIA DE FERRO FUNDIDO Ø120 X 1 CANAL A'}, {qty:1,nome:'POLIA DE FERRO FUNDIDO Ø350 X 1 CANAL A'}, {qty:1,nome:'CORREIA A62'}, {qty:2,nome:'MANCAL P20'}, {qty:2,nome:'ROLAMENTO UC208 - EIXO Ø40 MM'}, {qty:1,nome:'ROLAMENTO 6216 - 80 X 140 X 26 MM'}]},
    {setor:'ÁREA SECA',nome:'Moinho triturador de carolo com transporte pneumático',componentes:[{qty:1,nome:'01 - MOTOR TRIF 220-380 IP55 7,5 CV 2P 3540 RPM FF PREM IR3'}, {qty:1,nome:'01 - ACOPLAMENTO AP-35'}, {qty:2,nome:'02 - CAIXA PARA ROLAMENTO SN511'}, {qty:2,nome:'02 - ROLAMENTO 22211'}, {qty:2,nome:'02 BUCHA H311 - EIXO Ø50 MM'}, {qty:20,nome:'20 - MARTELO EM CHAPA 3/16" 58 X 118 MM'}]},
    {setor:'ÁREA SECA',nome:'Moinho triturador de carolo com transporte pneumático',componentes:[{qty:1,nome:'01 - MOTOR TRIF 220-380 IP55 7,5 CV 2P 3540 RPM FF PREM IR3'}, {qty:1,nome:'01 - ACOPLAMENTO AP-35'}, {qty:2,nome:'02 - CAIXA PARA ROLAMENTO SN511'}, {qty:2,nome:'02 - ROLAMENTO 22211'}, {qty:2,nome:'02 BUCHA H311 - EIXO Ø50 MM'}, {qty:20,nome:'20 - MARTELO EM CHAPA 3/16" 58 X 118 MM'}]},
    {setor:'ÁREA SECA',nome:'Rosca inox Ø200 x 3220 mm',componentes:[{qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTO UC208 EIXO Ø1.1/2”'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'POLIA FF Ø80 X 2 CANAL B'}, {qty:1,nome:'POLIA AÇO CARBONO LISA Ø400 X 2 CANAL B'}, {qty:2,nome:'CORREIAS B-64'}]},
    {setor:'ÁREA SECA',nome:'Rosca inox Ø200 x 3220 mm',componentes:[{qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTO UC208 EIXO Ø1.1/2”'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'POLIA FF Ø80 X 2 CANAL B'}, {qty:1,nome:'POLIA AÇO CARBONO LISA Ø400 X 2 CANAL B'}, {qty:2,nome:'CORREIAS B-64'}]},
    {setor:'ÁREA SECA',nome:'Resfriador de farinha',componentes:[{qty:2,nome:'PLACA MAGNETICA INOX 304 100X180X36 + 15MM DE ABAS ACO 1010-1020 IMÃS DE FERRITE'}, {qty:2,nome:'GAXETA ENCEBADA 3-8\'\' - 407 mm DE COMP'}, {qty:2,nome:'GAXETA ENCEBADA 3-8\'\' - 439 mm DE COMP'}, {qty:1,nome:'RETENTOR SABO 05511 (35 X 50 X 8 BRG) BI FPM'}, {qty:1,nome:'CORRENTE ASA 160 AÇO CARBONO - 5300 mm DE COMP.'}, {qty:2,nome:'BORRACHA ESPONJOSA 7 X 7 mm - 790 mm DE COMP. – 5020000140'}, {qty:4,nome:'CORREIA A 65 DENTADA'}, {qty:2,nome:'ABRACADEIRA ZINC ROSCA SEM FIM 102-121'}, {qty:1,nome:'MANGUEIRA AGUA MAA 150 4.1-2\'\'  X 4\'\' 350 mm DE COMP.'}, {qty:2,nome:'MOTOR TRIF 220-380 IP55 2 CV 6P 1140 RPM FLANGE PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 7,5 CV 2P 3540 RPM S. PES E C. FLANGE FF PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 7,5 CV 4P 1740 RPM S. PES C. FLANGE FF PREM IR3'}, {qty:1,nome:'REDUTOR BREVINI ED2030-MR1-35,5-00-611.0460.0690-B3'}, {qty:2,nome:'POLIA FF TIPO S Ø80 X 2 CANAL A'}, {qty:2,nome:'POLIA FF TIPO S Ø400 X 2 CANAL A'}, {qty:4,nome:'ROLAMENTO 6024 ZZ'}, {qty:2,nome:'ROLAMENTO 6052'}, {qty:2,nome:'TRAVA ELASTICA AC E 120MM'}, {qty:2,nome:'TRAVA ELASTICA AC E 260MM'}, {qty:1,nome:'VALVULA BORBOLETA INOX 304 OD 4\'\''}]},
    {setor:'ÁREA SECA',nome:'Resfriador de farinha',componentes:[{qty:2,nome:'PLACA MAGNETICA INOX 304 100X180X36 + 15MM DE ABAS ACO 1010-1020 IMÃS DE FERRITE'}, {qty:2,nome:'GAXETA ENCEBADA 3-8\'\' - 407 mm DE COMP'}, {qty:2,nome:'GAXETA ENCEBADA 3-8\'\' - 439 mm DE COMP'}, {qty:1,nome:'RETENTOR SABO 05511 (35 X 50 X 8 BRG) BI FPM'}, {qty:1,nome:'CORRENTE ASA 160 AÇO CARBONO - 5300 mm DE COMP.'}, {qty:2,nome:'BORRACHA ESPONJOSA 7 X 7 mm - 790 mm DE COMP. – 5020000140'}, {qty:4,nome:'CORREIA A 65 DENTADA'}, {qty:2,nome:'ABRACADEIRA ZINC ROSCA SEM FIM 102-121'}, {qty:1,nome:'MANGUEIRA AGUA MAA 150 4.1-2\'\'  X 4\'\' 350 mm DE COMP.'}, {qty:2,nome:'MOTOR TRIF 220-380 IP55 2 CV 6P 1140 RPM FLANGE PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 7,5 CV 2P 3540 RPM S. PES E C. FLANGE FF PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 7,5 CV 4P 1740 RPM S. PES C. FLANGE FF PREM IR3'}, {qty:1,nome:'REDUTOR BREVINI ED2030-MR1-35,5-00-611.0460.0690-B3'}, {qty:2,nome:'POLIA FF TIPO S Ø80 X 2 CANAL A'}, {qty:2,nome:'POLIA FF TIPO S Ø400 X 2 CANAL A'}, {qty:4,nome:'ROLAMENTO 6024 ZZ'}, {qty:2,nome:'ROLAMENTO 6052'}, {qty:2,nome:'TRAVA ELASTICA AC E 120MM'}, {qty:2,nome:'TRAVA ELASTICA AC E 260MM'}, {qty:1,nome:'VALVULA BORBOLETA INOX 304 OD 4\'\''}]},
    {setor:'ÁREA SECA',nome:'Conjunto de transporte pneumático com compressor tipo roots',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 10 CV 4P 1740 RPM'}, {qty:1,nome:'SOPRADOR TIPO ROOTS R100 (RUSSO ROOTS)'}, {qty:1,nome:'SILENCIOSO COM MIOLO MB 1113 TURBO'}, {qty:2,nome:'MANCAL FC 208'}, {qty:2,nome:'ROLAMENTO UC 208 EIXO 40MM'}, {qty:1,nome:'MOTO REDUTOR GD30 1X74,12 - SAIDA 22,9 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 1,5 CV 4P 1740 RPM'}, {qty:1,nome:'POLIA FF TIPO R 200 X 3 CANAL B'}, {qty:1,nome:'POLIA FF TIPO R 150 X 3 CANAL B'}, {qty:3,nome:'CORREIA B58'}, {qty:8,nome:'MANTA FILTRANTE P-500 S. BRITE 1MT DE LARG - 245 X 245 mm = 0,06 M²'}]},
    {setor:'ÁREA SECA',nome:'Conjunto de transporte pneumático com compressor tipo roots',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 10 CV 4P 1740 RPM'}, {qty:1,nome:'SOPRADOR TIPO ROOTS R100 (RUSSO ROOTS)'}, {qty:1,nome:'SILENCIOSO COM MIOLO MB 1113 TURBO'}, {qty:2,nome:'MANCAL FC 208'}, {qty:2,nome:'ROLAMENTO UC 208 EIXO 40MM'}, {qty:1,nome:'MOTO REDUTOR GD30 1X74,12 - SAIDA 22,9 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 1,5 CV 4P 1740 RPM'}, {qty:1,nome:'POLIA FF TIPO R 200 X 3 CANAL B'}, {qty:1,nome:'POLIA FF TIPO R 150 X 3 CANAL B'}, {qty:3,nome:'CORREIA B58'}, {qty:8,nome:'MANTA FILTRANTE P-500 S. BRITE 1MT DE LARG - 245 X 245 mm = 0,06 M²'}]},
    {setor:'ÁREA SECA',nome:'Válvula rotativa',componentes:[{qty:1,nome:'MOTO REDUTOR GD20 RED. 1 X 170,50 - SAÍDA 6,7 RPM MOTOR TRIF 220-380 IP55 0,25 CV 4P 1740 RPM'}, {qty:2,nome:'MANCAL FC208'}, {qty:2,nome:'ROLAMENTO UC 208 EIXO Ø40 mm'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø220 x 4500 mm',componentes:[{qty:1,nome:'GD 30 RED. 1 X 35 - SAÍDA 48,66 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM C. PES E S. FLANGE B3E'}, {qty:2,nome:'MANCAL F209'}, {qty:2,nome:'ROLAMENTO UC209 – EIXO Ø 1.3/4”'}, {qty:4,nome:'JUNTA 120 X 120 X 150 mm'}]},
    {setor:'ENSAQUE 02',nome:'Peneira de classificação de farinha',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM'}, {qty:1,nome:'CORREIA B49'}, {qty:1,nome:'TRAVA ELÁSTICA E-60'}, {qty:1,nome:'ROLAMENTO 6212'}, {qty:2,nome:'GRAMPO TENSOR D347'}, {qty:4,nome:'MOLA DE FIBRA 106 X 410 mm'}, {qty:2,nome:'RETENTOR SABÓ Nº 01842 BRG (60 X 82 X 12)'}, {qty:2,nome:'MANCAL P208'}, {qty:2,nome:'ROLAMENTO UC 208'}]},
    {setor:'ENSAQUE 02',nome:'Peneira de classificação de farinha',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM'}, {qty:1,nome:'CORREIA B49'}, {qty:1,nome:'TRAVA ELÁSTICA E-60'}, {qty:1,nome:'ROLAMENTO 6212'}, {qty:2,nome:'GRAMPO TENSOR D347'}, {qty:4,nome:'MOLA DE FIBRA 106 X 410 mm'}, {qty:2,nome:'RETENTOR SABÓ Nº 01842 BRG (60 X 82 X 12)'}, {qty:2,nome:'MANCAL P208'}, {qty:2,nome:'ROLAMENTO UC 208'}]},
    {setor:'ENSAQUE 02',nome:'Peneira de classificação de farinha',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM'}, {qty:1,nome:'CORREIA B49'}, {qty:1,nome:'TRAVA ELÁSTICA E-60'}, {qty:1,nome:'ROLAMENTO 6212'}, {qty:2,nome:'GRAMPO TENSOR D347'}, {qty:4,nome:'MOLA DE FIBRA 106 X 410 mm'}, {qty:2,nome:'RETENTOR SABÓ Nº 01842 BRG (60 X 82 X 12)'}, {qty:2,nome:'MANCAL P208'}, {qty:2,nome:'ROLAMENTO UC 208'}]},
    {setor:'ENSAQUE 02',nome:'Peneira de classificação de farinha',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM'}, {qty:1,nome:'CORREIA B49'}, {qty:1,nome:'TRAVA ELÁSTICA E-60'}, {qty:1,nome:'ROLAMENTO 6212'}, {qty:2,nome:'GRAMPO TENSOR D347'}, {qty:4,nome:'MOLA DE FIBRA 106 X 410 mm'}, {qty:2,nome:'RETENTOR SABÓ Nº 01842 BRG (60 X 82 X 12)'}, {qty:2,nome:'MANCAL P208'}, {qty:2,nome:'ROLAMENTO UC 208'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø200 x 3122 mm',componentes:[{qty:1,nome:'GD 30 RED. 1 X 68,89 - SAÍDA 24,70 RPM + MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM C. PES E S. FLANGE B3E'}, {qty:2,nome:'MANCAL F209'}, {qty:2,nome:'ROLAMENTO UC209 – EIXO Ø 1.3/4”'}, {qty:4,nome:'JUNTA 120 X 120 X 150 mm'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø200 x 2014 mm',componentes:[{qty:1,nome:'GD 30 RED. 1 X 7,55 - SAÍDA 225,2 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM C. PES E S. FLANGE B3E'}, {qty:2,nome:'MANCAL F209'}, {qty:2,nome:'ROLAMENTO UC209 – EIXO Ø 1.3/4”'}]},
    {setor:'ENSAQUE 02',nome:'Moinho padronizador de farinha',componentes:[{qty:1,nome:'MOTOR TRIF 220-380 IP55 40 CV 2P 3540 RPM PREM IR3'}, {qty:1,nome:'MOTO REDUTOR GD30 1X35,00 - SAIDA 48,6 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3'}, {qty:5,nome:'CORREIA B-86 DENTADA'}, {qty:1,nome:'POLIA DE AÇO CARBONO Ø180 X 5 CANAL B'}, {qty:1,nome:'POLIA DE AÇO CARBONO Ø250 X 5 CANAL B'}, {qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTOS UC 208 – EIXO Ø40 mm'}, {qty:2,nome:'MANCAL SN 515'}, {qty:2,nome:'ROLAMENTO 2215 C3K'}, {qty:2,nome:'BUCHA HE 315'}, {qty:4,nome:'ANEL DE BLOQUEIO ROLAMENTO 2215'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø180 x 3088 mm',componentes:[{qty:2,nome:'MANCAL F207'}, {qty:2,nome:'ROLAMENTO UC207 EIXO Ø1.1/4”'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM FF PREM IR3'}, {qty:1,nome:'POLIA FF Ø80 X 2 CANAL B'}, {qty:1,nome:'POLIA AÇO CARBONO LISA Ø400 X 2 CANAL B'}, {qty:2,nome:'CORREIAS B-60'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø220 x 3690 mm',componentes:[{qty:1,nome:'GD 30 RED. 1 X 68,89 - SAÍDA 24,70 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM'}, {qty:2,nome:'MANCAL F211'}, {qty:2,nome:'ROLAMENTO UC211 – EIXO Ø 2”'}, {qty:4,nome:'JUNTA 120 X 120 X 150 mm'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø250 x 4680 mm',componentes:[{qty:1,nome:'GD 30 RED. 1 X 7,55 - SAÍDA 225,2 RPM + MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM'}, {qty:2,nome:'MANCAL F211'}, {qty:2,nome:'ROLAMENTO UC211 – EIXO Ø 2”'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø250 x 3270 mm',componentes:[{qty:1,nome:'GD 30 RED. 1 X 7,55 - SAÍDA 225,2 RPM + MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM'}, {qty:2,nome:'MANCAL F211'}, {qty:2,nome:'ROLAMENTO UC211 – EIXO Ø 2”'}]},
    {setor:'ENSAQUE 02',nome:'Sistema de envase em big bag',componentes:[{qty:1,nome:'BALANÇA TOLEDO MODELO 2198'}, {qty:4,nome:'CELULA DE CARGA BALAÇA TOLEDO - MODELO 2198'}, {qty:1,nome:'CILINDRO PNEUMÁTICO 50 X 100 mm'}, {qty:1,nome:'DETECTOR DE METAIS - PERFORDMV 6”'}, {qty:4,nome:'ROLAMENTOS 6204'}, {qty:1,nome:'VALVULA BORBOLETA DISCO INOX 304 COM ATUADOR PNEUMÁTICO'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø250 x 4300 mm',componentes:[{qty:1,nome:'MOTO REDUTOR VERTIMAX WCG20 V04 3 RED. 1X71,24 BMA SAÍDA 24,57 RPM + MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM PREM IR3'}, {qty:2,nome:'MANCAL F208'}, {qty:2,nome:'ROLAMENTO UC208 – EIXO Ø 40 mm'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø250 x 5900 mm',componentes:[{qty:1,nome:'MOTO REDUTOR VERTIMAX WCG20 V06 2 RED. 1X7,32 BMA - SAÍDA 237,02 RPM + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3'}, {qty:2,nome:'MANCAL F211'}, {qty:2,nome:'ROLAMENTO UC211 – EIXO Ø 2”'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø250 x 2340 mm',componentes:[{qty:1,nome:'MOTO REDUTOR VERTIMAX WCG20 V06 2 RED. 1X7,32 BMA - SAÍDA 237,02 RPM + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3'}, {qty:2,nome:'MANCAL F211'}, {qty:2,nome:'ROLAMENTO UC211 – EIXO Ø 2”'}]},
    {setor:'ENSAQUE 02',nome:'Sistema de envase em Big Bag',componentes:[{qty:4,nome:'CABO DE ACO GALVANIZADO 3-16\'\' - 1200 mm DE COMP.'}, {qty:2,nome:'CILINDRO PNEUMATICO FESTO DSBC 50X100 PPSA N3'}, {qty:1,nome:'MANGA FILTRANTE INT132 X 1050MMDE COMP TIPO TAMPÃO COM BAINHA, CORDA FIXA E ALC'}, {qty:4,nome:'ESTICADOR P CABO DE ACO 3-16\'\' GANCHO-OLHAL LEVE'}, {qty:8,nome:'GRAMPO LEVE (CLIPS) - DIN 741 GALVANIZADO - PARA CABO DE AÇO 3-16\'\''}, {qty:1,nome:'VALVULA BORBOLETA FOFO DISCO INOX 8\'\' C. ATUADOR PNEUMATICO'}, {qty:1,nome:'ABRAÇADEIRA ZINC TIPO MG 111 – 123'}, {qty:1,nome:'BALANÇA TOLEDO MODELO 2198'}, {qty:4,nome:'CELULA DE CARGA BALAÇA TOLEDO - MODELO 2198'}, {qty:4,nome:'ROLAMENTO 6204'}]},
    {setor:'ENSAQUE 02',nome:'Rosca inox Ø250 x 3550 mm',componentes:[{qty:1,nome:'MOTO REDUTOR VERTIMAX WCG20 V06 2 RED. 1X7,32 BMA - SAÍDA 237,02 RPM + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3'}, {qty:2,nome:'MANCAL F211'}, {qty:2,nome:'ROLAMENTO UC211 – EIXO Ø 2”'}]},
    {setor:'ENSAQUE 02',nome:'Ensacadeira para envase valvulado',componentes:[{qty:1,nome:'MOTO REDUTOR GD 20 - RED. 1 X 64,21 - SAIDA 26,5 RPM - VAZADO + MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM PREM IR3'}, {qty:1,nome:'MOTOR TRIF 220-380 IP55 4 CV 6P 1140 RPM PREM IR3'}, {qty:1,nome:'ACOPLAMENTO GMAX 90'}, {qty:2,nome:'MANCAL P207'}, {qty:2,nome:'ROLAMENTO UC 207 – EIXO Ø1.1/4”'}, {qty:2,nome:'MANCAL FC 208'}, {qty:2,nome:'ROLAMENTO UC208 – EIXO Ø40 mm'}]},
  ],

  preventiva: [
    {equip:'Rosca transportadora de mandi',comp:'01 - MANCAL F 213',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mandi',comp:'01 - ROLAMENTO UC 213 EIXO 2.1-2\'\'',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mandi',comp:'03 – CORREIAS B88 DENTADA',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mandi',comp:'01 - MOTOR TRIF 220-380 IP55 5 CV 6P 1140 RPM PREM IR3',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mandi',comp:'01 - SELO MECANICO T01 2.1-4\'\' VITON',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mandi',comp:'01 - ROLAMENTO 1210 SC3',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mandi',comp:'01 - POLIA FF TIPO R Ø600 mm X 3 CANAL B',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mandi',comp:'01 - POLIA FF TIPO S Ø100  mm X 3 CANAL',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Rosca Transportadora de Mandioc',comp:'02 - MANCAIS F 215',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Rosca Transportadora de Mandioc',comp:'02 - ROLAMENTOS UC 215 EIXO 3\'\'',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Rosca Transportadora de Mandioc',comp:'01 - MOTO REDUTOR GD50 1 X 31,25 - SAÍDA 55,68 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Pré Lavador de Mandioca ',comp:'02 - MANCAIS SN 522 MDS',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Pré Lavador de Mandioca ',comp:'02 - ROLAMENTOS 22222 KC3',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Pré Lavador de Mandioca ',comp:'02 - BUCHAS H 322 1° LINHA',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Pré Lavador de Mandioca ',comp:'01 - REDUTOR PLANETARIO GEREMIA PG2503 RED 1X110 MC 4702.011.047 B5 16RPM SAÍDA + MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Rosca Transportadora',comp:'02 - MANCAIS F 215',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Rosca Transportadora',comp:'02 - ROLAMENTOS UC 215 EIXO 3\'\'',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Rosca Transportadora',comp:'01 - MOTO REDUTOR GD50 1 X 31,25 - SAÍDA 55,68 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Lavador de Mandioca ',comp:'02 - MANCAIS SN 522 MDS',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Lavador de Mandioca ',comp:'02 - ROLAMENTOS 22222 KC3',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Lavador de Mandioca ',comp:'02 - BUCHAS H 322 1° LINHA',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Lavador de Mandioca ',comp:'01 - REDUTOR BREVINI ET3250-MN1-110-619.5232.2742-B3 + MOTOR TRIF 220-380 IP55 25 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-07',realizada:'2024-10-07',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'01 - MANCAL F 211',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'01 - ROLAMENTO UC 211 EIXO DE 2\'\'',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'01 - ROLAMENTO 1208 SC3',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'03 - CORREIAS B 75 DENTADA',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'01 - SELO MECANICO T01 1.3-4\'\' VITON',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'01 - MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'01 - BOMBA CENTRIFUGA - MBL 7,5 CV 2P',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'01 - POLIA FF Ø500 X 3 CANAL B',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Peneira de separação de cas',comp:'01 - POLIA FF Ø110 X 3 CANAL B',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Esteira de inspeção de raízes',comp:'04 – MANCAIS F208',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Esteira de inspeção de raízes',comp:'04 – ROLAMENTOS UC208 EIXO Ø40 mm',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Esteira de inspeção de raízes',comp:'01 – MOTO-REDUTOR GD 40 RED. 1 X 52,73 - SAÍDA 32,24 RPM - VAZADO + MOTOR WEG W22 IP55 - 4 POLOS 1740 RPM',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Esteira de inspeção de raízes',comp:'01 - CORREIA TRANSP PVC DUBLADA BRANCA ATOXICA 23 X 3 LONAS #5,5MM ESP.',trim:'4º',planejada:'2024-10-14',realizada:'2024-10-14',exec:'Valmir / Luan'},
    {equip:'Picador de mandioca',comp:'02 - MANCAIS SN 515 MDS',trim:'4º',planejada:'2024-10-21',realizada:null,exec:'Valmir / Luan'},
    {equip:'Picador de mandioca',comp:'02 - ROLAMENTOS 22215 KC3',trim:'4º',planejada:'2024-10-21',realizada:null,exec:'Valmir / Luan'},
    {equip:'Picador de mandioca',comp:'02 - BUCHAS HE 315',trim:'4º',planejada:'2024-10-21',realizada:null,exec:'Valmir / Luan'},
    {equip:'Picador de mandioca',comp:'01 - MOTOR W22 PREMIUM IR3 TRIF 220-380 IP55 10 CV 4P 1740 RPM',trim:'4º',planejada:'2024-10-21',realizada:null,exec:'Valmir / Luan'},
    {equip:'Picador de mandioca',comp:'04 - CORREIAS B72',trim:'4º',planejada:'2024-10-21',realizada:null,exec:'Valmir / Luan'},
    {equip:'Picador de mandioca',comp:'01 – POLIA DE AÇO CARBONO Ø400 mm X 4 CANAL B',trim:'4º',planejada:'2024-10-21',realizada:null,exec:'Valmir / Luan'},
    {equip:'Picador de mandioca',comp:'01 - POLIA FF Ø100 X 4 CANAL B',trim:'4º',planejada:'2024-10-21',realizada:null,exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mand',comp:'01 - MANCAL F 213',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mand',comp:'01 - ROLAMENTO UC 213 EIXO 2.1-2\'\'',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mand',comp:'03 – CORREIAS B88 DENTADA',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mand',comp:'01 - MOTOR TRIF 220-380 IP55 5 CV 6P 1140 RPM PREM IR3',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mand',comp:'01 - SELO MECANICO T01 2.1-4\'\' VITON',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mand',comp:'01 - ROLAMENTO 1210 SC3',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mand',comp:'01 - POLIA FF TIPO R Ø600 mm X 3 CANAL B',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Rosca transportadora de mand',comp:'01 - POLIA FF TIPO S Ø100  mm X 3 CANAL B',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Dosador de mandioca picada',comp:'02 - MANCAIS F 211',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Dosador de mandioca picada',comp:'02 - ROLAMENTOS UC 211 EIXO DE 2\'\'',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Dosador de mandioca picada',comp:'01 - MOTO REDUTOR GD40 1X52,73 - SAIDA 32,24 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Cevadeira rotor Ø800 mm',comp:'02 - ROLAMENTOS 22217 + 02 BUCHAS H 317 - EIXO Ø75 MM',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Cevadeira rotor Ø800 mm',comp:'02 - RETENTOR VEDABRÁS - 30609R2 - (100 X 130 X 13 MM)',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Cevadeira rotor Ø800 mm',comp:'01 - RETENTOR VEDABRÁS - 30468R2 - (75 X 95 X 12 MM)',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Cevadeira rotor Ø800 mm',comp:'01 – ACOPLAMENTO TIPO PNEU MODELO RD – 90',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Cevadeira rotor Ø800 mm',comp:'01 – MOTOR TRIF 220-380 IP55 100 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Cevadeira rotor Ø800 mm',comp:'01 – GUINCHO ELÉTRICO MOTOMIL 300 A 600KG 220 MONOFÁSICO',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Cevadeira rotor Ø800 mm',comp:'01 – PLACA MAGNÉTICA 200 X 200MM – 7500 GRAUSS',trim:'4º',planejada:'2024-10-21',realizada:'2024-10-21',exec:'Valmir / Luan'},
    {equip:'Bomba de transporte de massa',comp:'01 - MOTO-REDUTOR GA 132 RED. 1 X 7,13 - SAÍDA 238,4 RPM – VAZADO + MOTOR TRIF 220-380 IP55 7,5 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Bomba de transporte de massa',comp:'01 - GAXETA ENSEBADA GRAFITADA 3/8" COM 420 MM DE COMP.',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Bomba de transporte de massa',comp:'01 - ESTATOR 70.1 BORRACHA 206',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Bomba de transporte de massa',comp:'01 - ROTOR F70.1 INOX 304 MACIÇO',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Tanque pulmão para filtro prens',comp:'01 - VALVULA BORBOLETA DISCO INOX 304 COM ALAVANCA 8”',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Bomba de carregamento para filt',comp:'01 - MOTO REDUTOR GA180 - 1X7,08 - SAÍDA 240 RPM - 30 CV 4P - COM PÉ E FLANGE DE SAÍDA + MOTOR TRIF 220-380 IP55 30 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Bomba de carregamento para filt',comp:'01 - GAXETA ENSEBADA GRAFITADA 3/8" 660 MM DE COMP.',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Bomba de carregamento para filt',comp:'01 - ESTATOR 2HF-80 NBRA C. FURO PARA SENSOR',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Bomba de carregamento para filt',comp:'01 - ROTOR 2HF-80 INOX 304 MACICO',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - MOTO-REDUTOR GD30 3R – RED. 1 X 140 – SAÍDA 12,14 RPM + MOTOR TRIF 220-380 IP55 0,75 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 197 X 4 - Nbr-PT 70sh',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 138 X 4 - Nbr-PT 70sh',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 -O´RING CBV - 68 X 10 - Nbr-PT 70 sh',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 268 x 4,5 - SPECI NBR - PT70SH',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 327 x 4,5 - SPECI NBR - PT70SH',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 347 x 4,5 - SPECI NBR - PT70SH',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 367 x 4,5 - SPECI NBR - PT70SH',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 402 x 4,5 - SPECI NBR - PT70SH',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 167 x 3 - SPECI NBR - PT70SH',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - O´RING CBV - 94 X 3 - SPECI NBR - PT70SH',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - GAXETA MOLITHANE POLIPACK 650010417750326 - ØINT.264,60 X ØEXT.290,00 X 3/4" X 1/2" - PARKER',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - GAXETA MOLITHANE POLIPACK 375082506253263 - ØINT.8.1/4" X ØEXT.9" X 5/8" X 3/8" - PARKER 1 - ANEL RASPADOR D-8250 – PARKER',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - GAXETA APC - Nº1597 - 1" X 1.3/8" X 5/16"',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - FITA DE TEFLON COM BRONZE 1/8" X 1" X 1800MM DE COMPRIMENTO',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - MANGUEIRA MAA 300 1" - AR/ÁGUA 300 PSI - 3000 MM DE COMPRIMENTO',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - MOTOR TRIF 220-380 IP55 7,5 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - I3329911018 - BOMBA HIDR.ENG. P11A D04 AQ PARKER',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - I3329111134 - BOMBA HIDR.ENG. P11A D27 AZ PARKER',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - ACOPLAMENTO HDA AC42',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - ACOPLAMENTO HDA AC28',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - S314 - FILTRO SUCCAO S 314 1" NPT 50L (100004 )',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - S520 - FILTRO SUCCAO S 520 1.1/2" NPT 90L (100005 )',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - FILTRO DE RETORNO 1 BSP 10 NOM FR16-A010-08B',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - ROLAMENTO 6306 ZZ - 30 X 72 X 19 MM',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'04 - ROLAMENTO 6205 ZZ - 25 X 52 X 15 MM',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - MANCAL P 208',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - ROLAMENTO UC 208 EIXO 1.1-2\'\'',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'04 – ENGRENAGENS EM AÇO INOX 304 PARA CORRENTE ASA 60 COM 15 DENTES',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - CORRENTE ASA 60 INOX 11850 mm DE COMP.',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - VALVULA GUILHOTINA LH S6000 4 CORPO E FACA INOX 316 PNEUMATICO COD-4W6AHSAWALE',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - VALVULA ESF TRIP TOTAL INOX 304 OD 3-4\'\' SWO C. ATUADOR DA32 MGA',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - VALVULA ESF TRIP TOTAL INOX 304 OD 1\'\' SWO C. ATUADOR DA52 MGA',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - VALVULA ESF TRIP TOTAL INOX 304 OD 1-1-4\'\' SWO C. ATUADOR DA52 MGA',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - VALVULA ESF TRIP TOTAL INOX 304 OD 2-1-2\'\' SWO C. ATUADOR DA75 MGA',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - VALVULA ESF TRIP TOTAL INOX 3-4\'\' SWO ALAVANCA MGA',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - VALVULA ESF TRIP TOTAL INOX 1\'\' SWO ALAVANCA MGA',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - COTOVELO GIRATÓRIO INOX 1/4 X 8MM',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - VÁLVULA SOLENOIDE P2A20RS25-IP02E DIRE 1/4 ADEX 5/2VIAS SOL 24VDC',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - BORNE RELE 24VCA/ACC REVERSÍVEL 6A COMPLETO SLIM 6MM',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - BORNE RELE 24VCA/ACC REVERSÍVEL 16A COMPLETO',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - RELE DE CONTROLE DE FASE TRIFÁSICO 183...528 VCA 2 REV F FASE',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - CONTATO AUXILIAR FRONTAL GVAE11 1 - SENSOR INDUTIVO DS-5MM 12/24VCC 3 FIOS PNP N/A 2M',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - SENSOR MAGNÉTICO KT-32R 10 - FUSÍVEL DE VIDRO 3A 5X20MM',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - TRANSMISSOR DE PRESSÃO WIKA 0-16 S11',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - TRANSMISSOR DE PRESSÃO WIKA 0-04 S11',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - CABO DE REDE RJ45 1M',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - MANGUEIRA PU AZUL 6MM - 3000 MM DE COMP.',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - MANGUEIRA PU AZUL 8MM - 3000 MM DE COMP.',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - CONEXÃO Y 6MM',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'02 - CONECTOR COTOVELO GIRATÓRIO 1/8 X 6MM',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - FIM DE CURSO ZV1H 236-11ZP TELEMECANIC',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Filtro prensa automático 40 plc',comp:'01 - FIM DE CURSO (ATUADORES) APL21ON',trim:'4º',planejada:'2024-10-28',realizada:'2024-10-28',exec:'Valmir / Luan'},
    {equip:'Tanque para retro-lavagem',comp:'01 - BOMBA THEBE THA-16 + MOTOR + MOTOR TRIF 220-380 IP55 3 CV 2P 3540 RPM PREM IR3',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Tanque para retro-lavagem',comp:'03 - VÁLVULA BORBOLETA INOX 304 COM ALAVANCA SOLDÁVEL 4"',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Tanque para retro-lavagem',comp:'03 - VÁLVULA BORBOLETA INOX 304 COM ALAVANCA SOLDÁVEL 3"',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Tanque para retro-lavagem',comp:'01 - VÁLVULA BORBOLETA INOX 304 COM ALAVANCA SOLDÁVEL 2.1/2"',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'02 - MANCAL F208',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'02 - ROLAMENTOS UC 208 - EIXO Ø40 MM',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'02 - MANCAL F213',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'02 - ROLAMENTOS UC213 - EIXO Ø63,5 MM',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'01 - GAXETA ENSEBADA GRAFITADA 3/8" - 1600 MM DE COMPRIMENTO',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'01 - GAXETA ENSEBADA GRAFITADA 5/8" - 1600 MM DE COMPRIMENTO',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'02 - MOTO-REDUTOR GD40 - RED. 1 X 86,67 - SAÍDA 19,61 RPM + MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'01 - MOTO-REDUTOR GD60 - RED. 1 X 216,79 - SAÍDA 5,30 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'01 - CILINDRO PNEUMÁTICO PARKER P1E-G100MSO-0350',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'02 - FIM DE CURSO SIEMENS - 3SE5 232 0LE10',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-44',comp:'02 – BUCHA DE TEFLON GRAFITADO 73 X 38,1 X 100 mm',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'02 - MANCAL F208',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'02 - ROLAMENTOS UC 208 - EIXO Ø40 MM',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'02 - MANCAL F213',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'02 - ROLAMENTOS UC213 - EIXO Ø63,5 MM',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'01 - GAXETA ENSEBADA GRAFITADA 3/8" - 1600 MM DE COMPRIMENTO',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'01 - GAXETA ENSEBADA GRAFITADA 5/8" - 1600 MM DE COMPRIMENTO',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'02 - MOTO-REDUTOR GD40 - RED. 1 X 86,67 - SAÍDA 19,61 RPM + MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'01 - MOTO-REDUTOR GD60 - RED. 1 X 216,79 - SAÍDA 5,30 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'01 - CILINDRO PNEUMÁTICO PARKER P1E-G100MSO-0350',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'02 - FIM DE CURSO SIEMENS - 3SE5 232 0LE10',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Caixa coletora de massa FPA-30',comp:'02 – BUCHA DE TEFLON GRAFITADO 73 X 38,1 X 100 mm',trim:'4º',planejada:'2024-11-04',realizada:'2024-11-04',exec:'Valmir / Luan'},
    {equip:'Rosca horizontal CCM Ø250 x 390',comp:'02 - MANCAL F208',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca horizontal CCM Ø250 x 390',comp:'02 - ROLAMENTO UC 208 - EIXO Ø40 MM',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca horizontal CCM Ø250 x 390',comp:'01 - MOTO-REDUTOR GD40 - RED. 1X14,05 - SAÍDA 121 RPM - VAZADO + MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca horizontal CCM Ø250 x 468',comp:'02 - MANCAL F208',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca horizontal CCM Ø250 x 468',comp:'02 - ROLAMENTO UC 208 - EIXO Ø40 MM',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca horizontal CCM Ø250 x 468',comp:'01 - MOTO-REDUTOR GD40 - RED. 1X14,05 - SAÍDA 121 RPM - VAZADO + MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5000 mm',comp:'03 - CORREIAS B94',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5000 mm',comp:'01 - POLIA DE FERRO FUNDIDO Ø100 X 3 CANAL B',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5000 mm',comp:'01 – POLIA LISA DE AÇO CARBONO Ø625 mm',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5000 mm',comp:'02 - ROLAMENTO 6208 (40 X 80 X 18 MM)',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5000 mm',comp:'01 - MANCAL F211',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5000 mm',comp:'01 - ROLAMENTO UC211 - EIXO Ø2"',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5000 mm',comp:'01 - SELO MECANICO T01 1 3/4\'\' VITON',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5000 mm',comp:'01 - MOTOR TRIF 220-380 IP55 5 CV 6P 1140 RPM PREM IR3',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5300 mm',comp:'03 - CORREIAS B94',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5300 mm',comp:'01 - POLIA DE FERRO FUNDIDO Ø100 X 3 CANAL B',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5300 mm',comp:'01 – POLIA LISA DE AÇO CARBONO Ø625 mm',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5300 mm',comp:'02 - ROLAMENTO 6208 (40 X 80 X 18 MM)',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5300 mm',comp:'01 - MANCAL F211',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5300 mm',comp:'01 - ROLAMENTO UC211 - EIXO Ø2"',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5300 mm',comp:'01 - SELO MECANICO T01 1 3/4\'\' VITON',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Rosca vertical Ø250 x 5300 mm',comp:'01 - MOTOR TRIF 220-380 IP55 5 CV 6P 1140 RPM PREM IR3',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Esfarelador de massa prensada ',comp:'01 – MANCAL F205',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Esfarelador de massa prensada ',comp:'01 – ROLAMENTO UC 205 EIXO Ø1”',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Esfarelador de massa prensada ',comp:'01 - MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-11',realizada:'2024-11-11',exec:'Valmir / Luan'},
    {equip:'Transportador tipo pás 10175 mm',comp:'04 - MANCAL F208',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Transportador tipo pás 10175 mm',comp:'04 - ROLAMENTO UC208 - EIXO Ø40 MM',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Transportador tipo pás 10175 mm',comp:'01 - MOTO-REDUTOR GD30 RED. 1 X 35 - SAÍDA 48,57 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Transportador tipo pás 11500 mm',comp:'04 - MANCAL F208',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Transportador tipo pás 11500 mm',comp:'04 - ROLAMENTO UC208 - EIXO Ø40 MM',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Transportador tipo pás 11500 mm',comp:'01 - MOTO-REDUTOR GD30 RED. 1 X 35 - SAÍDA 48,57 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Dosador de massa prensada forno',comp:'04 - MANCAL F208',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Dosador de massa prensada forno',comp:'04 - ROLAMENTO UC208 - EIXO Ø40 MM',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Dosador de massa prensada forno',comp:'01 - ENGRENAGEM PARA CORRENTE ASA60 COM 50 DENTES',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Dosador de massa prensada forno',comp:'01 - ENGRENAGEM PARA CORRENTE ASA60 COM 15 DENTES',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Dosador de massa prensada forno',comp:'01 - CORRENTE ASA60 COM 1500 MM DE COMPRIMENTO',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Dosador de massa prensada forno',comp:'01 - MOTO-REDUTOR GD40 RED. 1 X 46,67 - SAÍDA 36,43 RPM MOTOR TRIF 220-380 IP55 4 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Forno pré aquecedor de massa 2x',comp:'01 - MOTOR TRIF 220-380 IP55 15 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Forno pré aquecedor de massa 2x',comp:'01 - MOTOR TRIF 220-380 IP55 10 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Forno pré aquecedor de massa 2x',comp:'02 - MANCAL F215',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Forno pré aquecedor de massa 2x',comp:'02 - ROLAMENTOS UC215 - EIXO Ø3"',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Forno pré aquecedor de massa 2x',comp:'01 - GAXETA ENSEBADA GRAFITADA 3/8" 1800 MM DE COMP. 4 - CORREIA B90',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Forno pré aquecedor de massa 2x',comp:'01 – POLIA FF Ø120 X 4 CANAL B',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Forno pré aquecedor de massa 2x',comp:'01 - POLIA FF Ø500 X 4 CANAL B',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:null},
    {equip:'Forno pré aquecedor de massa 2x',comp:'04 – CORREIAS B90',trim:'4º',planejada:'2024-11-18',realizada:'2024-11-18',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - REDUTOR BREVINI ET3250-MN1-110-619.5232.2742-B3 + MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM FF PREM IR3',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM C. FLANGE FC NEMA E CAIXA ESQUERDA COD. 12218734 IR3',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - ROLAMENTO 23036EMKW33C3',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - BUCHA H 3036 1°',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - GAXETA GRAFITADA 1/2" 565 mm DE COMP.',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - GAXETA GRAFITADA 1/2" 574 mm DE COMP.',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - GAXETA GRAFITADA 1/2" 590 mm DE COMP.',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - BUCHA DE BORRACHA 80SH EXT.102 X INT.25,4 X 30MM DE ALTURA',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - FLEXIVEL INOX C FLANGE AC 150LBS 1 PONTA GIRAT E 1 PONTA FIXA 1-2 X 300MM',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - ACOPLAMENTO AF-46',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - BOMBA DE ENGRENAGEM DESL 2,5 11101002004',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - BOCAL DE ENCHIMENTO C FILTRO DE AR BE-761',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI - 246 KG-CM² - 330 MM COMP.',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI - 246 KG-CM² - 360 MM COMP.',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - MANGUEIRA FLEXIVEL HIDRAULICA 1-2\'\'- 3500 PSI 246 KG-CM² - 470 MM COMP.',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - MANGUEIRA FLEXIVEL HIDRAULICA 3-8 - 4000 PSI - 280KG-CM² - 600 MM COMP.',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - VALVULA TIPO AGULHA BRONZE 3000 LBS 1-2\'\'',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - FILTRO SUCCAO 3-4\'\' NPT 5 GPM 20LPM FTS020A',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - PLACA MAGNETICA INOX 304 180X180X36 + 15MM DE ABAS ACO 1010-1020 IMAS DE FERRITE',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 – SELO MECÂNICO FCV-A1 2.1/2” UNIPREST',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - RETENTOR SABO 07461 BRF 117,4 X 142,9 X 12,5MM',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - GAXETA VEDABRAS 0019421 TIPO U (63.50 X 76.20 X 9.53)',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'02 - ANEL RASPADOR VEDABRAS 0050106 PD (63.50 X 76.20 X 6.35) AS9',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - CHAVE FIM DE CURSO PLAST - ZV1H 236 11ZP 18843102 (FORNO)',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Forno contínuo a vapor (2x)',comp:'01 - ANEL ORING 0010852 VI VED (106.50 X 3.00)',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'02 - BOMBA THEBE P15-2N - MOTOR TRIF 220-380 IP55 5 CV 2P 3540 RPM IR3',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'03 - JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 1\'\'',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'19 - JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 1 1-2\'\'',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'01 - JUNTA ESPIRALADA GRAFITADA  AISI 304 150 LBS 4\'\'',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'01 - MANOMETRO VERTICAL SEMI INOX 0 A 21 KG 300PSI 1-2\'\' Ø100MM',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'02 - VALVULA DE RETENCAO INOX 316 TIPO WAFER  1 1-2\'\'',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'05 - VALVULA AC ESF INOX TRIP PR 1 1-2\'\' FLANGE 150LBS TF MGA',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'02 - SIFÃO TROMBETA 1-2\'\'',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'02 - FILTRO Y BRONZE 1 1-2\'\'\' 150LBS C. ROSCA',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'01 - PRESSOSTATO ESC. 22 A 300BAR BORNES 1NANF DIF.REG.2NIV XMLB300D2S11',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'02 - FLEXIVEL INOX 1 1-2\'\' X 200MM 1PONTA C. ROSCA 1 1-2\'\' BSP 11 F - UMA PONTA FLANGE GIR 1 1-2\'\' 150LBS',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'01 - VALVULA AC ESF INOX TRIP PR 1\'\' FLANGE 150LBS TF',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'03 - VALVULA AC ESF INOX TRIP PR 1-2\'\' ROSCA 300LBS',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Sistema de retorno de condensad',comp:'01 – BUJÃO DE NÍVEL PARA BOBMA DE CONDENSDO UNIPREST',trim:'4º',planejada:'2024-11-25',realizada:'2024-11-25',exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'03 - JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 2\'\'',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'10 - JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 2 1-2\'\'',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'06 - JUNTA ESPIRALADA GRAFITADA AISI 304 150 LBS 3\'\'',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'03 - MANOMETRO VERTICAL SEMI INOX 0 A 21 KG 300PSI 1-2\'\' Ø100MM',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'01 - VALVULA AC ESF INOX TRIP PR 3 FLANGE 150LBS TF MGA',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'01 - VALVULA DE ALIVIO BRONZE DECA 2\'\' S. CABO',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'01 - FILTRO Y ACO CARBONO 3\'\' FLANGE 150 LBS',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'03 - SIFÃO TROMBETA 1-2\'\'',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'01 - FLEXIVEL INOX C. FLANGE AC 150LBS 1 PONTA GIRAT E 1 PONTA FIXA 2\'\' X 200MM',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'02 - FLEXIVEL INOX C. FLANGE AC 150LBS 2.1-2 X 500MM',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'01 - VALVULA AC ESF INOX TRIP PP 2 FLANGE 150LBS TF MGA',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'02 - VALVULA AC ESF INOX TRIP PP 2.1-2 FLANGE 150LBS TF MGA',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Entrada de vapor para forno con',comp:'01 - VALVULA REDUTORA DE VAPOR 3POL - A1',trim:'4º',planejada:'2024-12-02',realizada:null,exec:'Valmir / Luan'},
    {equip:'Sistema de aspiração para forno',comp:'01 - MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Sistema de aspiração para forno',comp:'2 - MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Sistema de aspiração para forno',comp:'3 - MOTOR TRIF 220-380 IP55 20 CV 4P 1740 RPM FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2340 mm (2x)',comp:'02 – MANCAL F208',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2340 mm (2x)',comp:'02 – ROLAMENTO UC208 EIXO Ø1.1/2”',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2340 mm (2x)',comp:'01 - JUNTA RETANGULAR 205 X 185 X 100 mm',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2340 mm (2x)',comp:'01 - MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2340 mm (2x)',comp:'01 – POLIA FF Ø80 X 2 CANAL B',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2340 mm (2x)',comp:'01 – POLIA AÇO CARBONO LISA Ø400 X 2 CANAL B',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2340 mm (2x)',comp:'02 – CORREIAS B-64',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Peneira de carolo (2x)',comp:'01 - MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Peneira de carolo (2x)',comp:'01 - POLIA DE FERRO FUNDIDO Ø120 X 1 CANAL A',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Peneira de carolo (2x)',comp:'01 - POLIA DE FERRO FUNDIDO Ø350 X 1 CANAL A',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Peneira de carolo (2x)',comp:'01 - CORREIA A62',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Peneira de carolo (2x)',comp:'02 - MANCAL P20',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Peneira de carolo (2x)',comp:'02 ROLAMENTO UC208 - EIXO Ø40 MM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Peneira de carolo (2x)',comp:'01 - ROLAMENTO 6216 - 80 X 140 X 26 MM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Moinho triturador de carolo com',comp:'01 - MOTOR TRIF 220-380 IP55 7,5 CV 2P 3540 RPM FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Moinho triturador de carolo com',comp:'01 - ACOPLAMENTO AP-35',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Moinho triturador de carolo com',comp:'02 - CAIXA PARA ROLAMENTO SN511',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Moinho triturador de carolo com',comp:'02 - ROLAMENTO 22211',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Moinho triturador de carolo com',comp:'02 BUCHA H311 - EIXO Ø50 MM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Moinho triturador de carolo com',comp:'20 - MARTELO EM CHAPA 3/16" 58 X 118 MM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3220 mm ( (2)',comp:'02 – ROLAMENTO UC208 EIXO Ø1.1/2”',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3220 mm ( (2)',comp:'01 - MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3220 mm ( (2)',comp:'01 – POLIA FF 02 – MANCAL F208',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3220 mm ( (2)',comp:'Ø80 X 2 CANAL B',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3220 mm ( (2)',comp:'01 – POLIA AÇO CARBONO LISA Ø400 X 2 CANAL B',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3220 mm ( (2)',comp:'02 – CORREIAS B-64',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - PLACA MAGNETICA INOX 304 100X180X36 + 15MM DE ABAS ACO 1010-1020 IMÃS DE FERRITE',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - GAXETA ENCEBADA 3-8\'\' - 407 mm DE COMP',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - GAXETA ENCEBADA 3-8\'\' - 439 mm DE COMP',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'01 - RETENTOR SABO 05511 (35 X 50 X 8 BRG) BI FPM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'01 - CORRENTE ASA 160 AÇO CARBONO - 5300 mm DE COMP.',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - BORRACHA ESPONJOSA 7 X 7 mm - 790 mm DE COMP. – 5020000140',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'04 - CORREIA A 65 DENTADA',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - ABRACADEIRA ZINC ROSCA SEM FIM 102-121',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'01 - MANGUEIRA AGUA MAA 150 4.1-2\'\'  X 4\'\' 350 mm DE COMP.',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - MOTOR TRIF 220-380 IP55 2 CV 6P 1140 RPM FLANGE PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'01 - MOTOR TRIF 220-380 IP55 7,5 CV 2P 3540 RPM S. PES E C. FLANGE FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'01 - MOTOR TRIF 220-380 IP55 7,5 CV 4P 1740 RPM S. PES C. FLANGE FF PREM IR3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'01 - REDUTOR BREVINI ED2030-MR1-35,5-00-611.0460.0690-B3',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - POLIA FF TIPO S Ø80 X 2 CANAL A',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 – POLIA FF TIPO S Ø400 X 2 CANAL A',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'04 - ROLAMENTO 6024 ZZ',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - ROLAMENTO 6052',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - TRAVA ELASTICA AC E 120MM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'02 - TRAVA ELASTICA AC E 260MM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Resfriador de farinha (2x)',comp:'01 - VALVULA BORBOLETA INOX 304 OD 4\'\'',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'01 - MOTOR TRIF 220-380 IP55 10 CV 4P 1740 RPM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'01 - SOPRADOR TIPO ROOTS R100 (RUSSO ROOTS)',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'01 - SILENCIOSO COM MIOLO MB 1113 TURBO',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'02 - MANCAL FC 208',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'02 - ROLAMENTO UC 208 EIXO 40MM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'01 - MOTO REDUTOR GD30 1X74,12 - SAIDA 22,9 RPM - VAZADO C. G-CENTER + MOTOR TRIF 220-380 IP55 1,5 CV 4P 1740 RPM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'01 - POLIA FF TIPO R 200 X 3 CANAL B',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'01 - POLIA FF TIPO R 150 X 3 CANAL B',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'03 - CORREIA B58',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Conjunto de transporte pneumáti',comp:'08 - MANTA FILTRANTE P-500 S. BRITE 1MT DE LARG - 245 X 245 mm = 0,06 M²',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Válvula rotativa',comp:'01 – MOTO REDUTOR GD20 RED. 1 X 170,50 - SAÍDA 6,7 RPM MOTOR TRIF 220-380 IP55 0,25 CV 4P 1740 RPM',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Válvula rotativa',comp:'02 – MANCAL FC208',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Válvula rotativa',comp:'02 – ROLAMENTO UC 208 EIXO Ø40 mm',trim:'4º',planejada:'2024-12-02',realizada:'2024-12-02',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø220 x 4500 mm',comp:'01 - GD 30 RED. 1 X 35 - SAÍDA 48,66 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM C. PES E S. FLANGE B3E',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø220 x 4500 mm',comp:'02 – MANCAL F209',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø220 x 4500 mm',comp:'02 – ROLAMENTO UC209 – EIXO Ø 1.3/4”',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:null},
    {equip:'Rosca inox Ø220 x 4500 mm',comp:'04 – JUNTA 120 X 120 X 150 mm',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'01 - MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'01 - CORREIA B49',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'01 – TRAVA ELÁSTICA E-60',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'01 – ROLAMENTO 6212',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'02 – GRAMPO TENSOR D347',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'04 – MOLA DE FIBRA 106 X 410 mm',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'02 – RETENTOR SABÓ Nº 01842 BRG (60 X 82 X 12)',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'02 – MANCAL P208',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Peneira de classificação de far',comp:'02 – ROLAMENTO UC 208',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3122 mm',comp:'01 - GD 30 RED. 1 X 68,89 - SAÍDA 24,70 RPM + MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM C. PES E S. FLANGE B3E',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3122 mm',comp:'02 – MANCAL F209',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3122 mm',comp:'02 – ROLAMENTO UC209 – EIXO Ø 1.3/4”',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 3122 mm',comp:'04 – JUNTA 120 X 120 X 150 mm',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2014 mm',comp:'01 - GD 30 RED. 1 X 7,55 - SAÍDA 225,2 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM C. PES E S. FLANGE B3E',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2014 mm',comp:'02 – MANCAL F209',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø200 x 2014 mm',comp:'02 – ROLAMENTO UC209 – EIXO Ø 1.3/4”',trim:'4º',planejada:'2024-12-09',realizada:'2024-12-09',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'01 - MOTO REDUTOR GD30 1X35,00 - SAIDA 48,6 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'05 - CORREIA B-86 01 - MOTOR TRIF 220-380 IP55 40 CV 2P 3540 RPM PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'DENTADA',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'01 – POLIA DE AÇO CARBONO Ø180 X 5 CANAL B',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'01 - POLIA DE AÇO CARBONO Ø250 X 5 CANAL B',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'02 - MANCAL F208',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'02 – ROLAMENTOS UC 208 – EIXO Ø40 mm',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'02 - MANCAL SN 515',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'02 - ROLAMENTO 2215 C3K',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Moinho padronizador de farinha',comp:'02 - BUCHA HE 315',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø180 x 3088 mm',comp:'02 – MANCAL F207',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø180 x 3088 mm',comp:'02 – ROLAMENTO UC207 EIXO Ø1.1/4”',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø180 x 3088 mm',comp:'01 - MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM FF PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø180 x 3088 mm',comp:'01 – POLIA FF Ø80 X 2 CANAL B',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø180 x 3088 mm',comp:'01 – POLIA AÇO CARBONO LISA Ø400 X 2 CANAL B',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø180 x 3088 mm',comp:'02 – CORREIAS B-60',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø220 x 3690 mm',comp:'01 - GD 30 RED. 1 X 68,89 - SAÍDA 24,70 RPM + MOTOR TRIF 220-380 IP55 2 CV 4P 1740 RPM',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø220 x 3690 mm',comp:'02 – MANCAL F211',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø220 x 3690 mm',comp:'02 – ROLAMENTO UC211 – EIXO Ø 2”',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø220 x 3690 mm',comp:'04 – JUNTA 120 X 120 X 150 mm',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 4680 mm',comp:'01 - GD 30 RED. 1 X 7,55 - SAÍDA 225,2 RPM + MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 4680 mm',comp:'02 – MANCAL F211',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 4680 mm',comp:'02 – ROLAMENTO UC211 – EIXO Ø 2”',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 3270 mm',comp:'01 - GD 30 RED. 1 X 7,55 - SAÍDA 225,2 RPM + MOTOR TRIF 220-380 IP55 3 CV 4P 1740 RPM',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 3270 mm',comp:'02 – MANCAL F211',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 3270 mm',comp:'02 – ROLAMENTO UC211 – EIXO Ø 2”',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em big bag',comp:'01 - BALANÇA TOLEDO MODELO 2198',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em big bag',comp:'04 - CELULA DE CARGA BALAÇA TOLEDO - MODELO 2198',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em big bag',comp:'01 - CILINDRO PNEUMÁTICO 50 X 100 mm',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em big bag',comp:'01 - DETECTOR DE METAIS - PERFORDMV 6”',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em big bag',comp:'04 – ROLAMENTOS 6204',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em big bag',comp:'01 - VALVULA BORBOLETA DISCO INOX 304 COM ATUADOR PNEUMÁTICO',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 4300 mm',comp:'01 – MOTO REDUTOR VERTIMAX WCG20 V04 3 RED. 1X71,24 BMA SAÍDA 24,57 RPM + MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 4300 mm',comp:'02 – MANCAL F208',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 4300 mm',comp:'02 – ROLAMENTO UC208 – EIXO Ø 40 mm',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 5900 mm',comp:'01 – MOTO REDUTOR VERTIMAX WCG20 V04 3 RED. 1X71,24 BMA SAÍDA 24,57 RPM + MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 5900 mm',comp:'02 – MANCAL F208',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 5900 mm',comp:'02 – ROLAMENTO UC208 – EIXO Ø 40 mm',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 2340 mm',comp:'01 – MOTO REDUTOR VERTIMAX WCG20 V06 2 RED. 1X7,32 BMA - SAÍDA 237,02 RPM + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 2340 mm',comp:'02 – MANCAL F211',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 2340 mm',comp:'02 – ROLAMENTO UC211 – EIXO Ø 2”',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'04 - CABO DE ACO GALVANIZADO 3-16\'\' - 1200 mm DE COMP.',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'02 - CILINDRO PNEUMATICO FESTO DSBC 50X100 PPSA N3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'01 - MANGA FILTRANTE INT132 X 1050MMDE COMP TIPO TAMPÃO COM BAINHA, CORDA FIXA E ALC',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'04 - ESTICADOR P CABO DE ACO 3-16\'\' GANCHO-OLHAL LEVE',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'08 - GRAMPO LEVE (CLIPS) - DIN 741 GALVANIZADO - PARA CABO DE AÇO 3-16\'\'',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'01 - VALVULA BORBOLETA FOFO DISCO INOX 8\'\' C. ATUADOR PNEUMATICO',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'01 - ABRAÇADEIRA ZINC TIPO MG 111 – 123',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'01 - BALANÇA TOLEDO MODELO 2198',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'04 - CELULA DE CARGA BALAÇA TOLEDO - MODELO 2198',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Sistema de envase em Big Bag ',comp:'04 – ROLAMENTO 6204',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 3550 mm',comp:'01 – MOTO REDUTOR VERTIMAX WCG20 V06 2 RED. 1X7,32 BMA - SAÍDA 237,02 RPM + MOTOR TRIF 220-380 IP55 5 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 3550 mm',comp:'02 – MANCAL F211',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Rosca inox Ø250 x 3550 mm',comp:'02 – ROLAMENTO UC211 – EIXO Ø 2”',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Ensacadeira para envase valvula',comp:'01 – MOTO REDUTOR GD 20 - RED. 1 X 64,21 - SAIDA 26,5 RPM - VAZADO + MOTOR TRIF 220-380 IP55 1 CV 4P 1740 RPM PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Ensacadeira para envase valvula',comp:'01 - MOTOR TRIF 220-380 IP55 4 CV 6P 1140 RPM PREM IR3',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Ensacadeira para envase valvula',comp:'01 - ACOPLAMENTO GMAX 90',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Ensacadeira para envase valvula',comp:'02 – MANCAL P207',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Ensacadeira para envase valvula',comp:'02 – ROLAMENTO UC 207 – EIXO Ø1.1/4”',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Ensacadeira para envase valvula',comp:'02 – MANCAL FC 208',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
    {equip:'Ensacadeira para envase valvula',comp:'02 – ROLAMENTO UC208 – EIXO Ø40 mm',trim:'4º',planejada:'2024-12-16',realizada:'2024-12-16',exec:'Valmir / Luan'},
  ],

  planos: [
    {setor:'EXTRAÇÃO',equip:'Peneira vibratória',plano:'LU',item:'Engraxar rolamento LA',period:'30 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Peneira vibratória',plano:'LU',item:'Engraxar rolamento LOA 1',period:'30 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Peneira vibratória',plano:'LU',item:'Engraxar rolamento LOA 2',period:'30 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Peneira vibratória',plano:'IRM',item:'Verificar tensão das correias',period:'7 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Peneira vibratória',plano:'IRM',item:'Verificar fixação dos mancais',period:'7 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Peneira vibratória',plano:'PRM',item:'Trocar correias',period:'180 dias',qty:3},
    {setor:'EXTRAÇÃO',equip:'Peneira vibratória',plano:'PRM',item:'Trocar rolamentos',period:'365 dias',qty:4},
    {setor:'EXTRAÇÃO',equip:'Cevadeira rotor Ø800 mm',plano:'IRM',item:'Verificar serrinhas do rotor',period:'7 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Cevadeira rotor Ø800 mm',plano:'IRM',item:'Verificar fixação do acoplamento',period:'14 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Cevadeira rotor Ø800 mm',plano:'PRM',item:'Trocar serrinhas do rotor',period:'180 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Cevadeira rotor Ø800 mm',plano:'PRM',item:'Revisar acoplamento tipo pneu',period:'180 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Filtro prensa automático FPA-44',plano:'IRM',item:'Verificar pressão das placas',period:'7 dias',qty:null},
    {setor:'EXTRAÇÃO',equip:'Filtro prensa automático FPA-44',plano:'PRM',item:'Trocar o-rings das placas',period:'365 dias',qty:null},
    {setor:'SECAGEM',equip:'Forno contínuo a vapor',plano:'IRM',item:'Verificar nível de água do visor',period:'7 dias',qty:null},
    {setor:'SECAGEM',equip:'Forno contínuo a vapor',plano:'IRM',item:'Verificar pressão do vapor',period:'7 dias',qty:null},
    {setor:'SECAGEM',equip:'Forno contínuo a vapor',plano:'PRM',item:'Substituir juntas e vedações',period:'180 dias',qty:null},
    {setor:'SECAGEM',equip:'Forno contínuo a vapor',plano:'PRM',item:'Limpeza dos tubos internos',period:'180 dias',qty:null},
    {setor:'CALDEIRA',equip:'Caldeira a vapor',plano:'PRM',item:'Limpeza dos tubos internos',period:'180 dias',qty:null},
  ],

  lubrificacao: [
    {setor:'Recepção descarga',equip:'ENTRADA DO ROLO DA ROSCA',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE FG',bombadas:'3.0',frequencia:'SEMANALMENTE'},
    {setor:'Recepção descarga',equip:'ENTRADA DO ROLO DA ROSCA',item:'REDUTOR',lubrificante:'CERTOP',bombadas:'VER. NIVEL',frequencia:'TRIMESTRALMENTE'},
    {setor:'Recepção descarga',equip:'ROSCA SAÍDA DO ROLO',item:'MANCAL ROLAMENTO',lubrificante:'',bombadas:'2.0',frequencia:'QUINZENAL'},
    {setor:'Recepção descarga',equip:'ROSCA SAÍDA DO ROLO',item:'REDUTOR',lubrificante:'CERTOP',bombadas:'VER. NIVEL',frequencia:'QUINZENAL'},
    {setor:'Recepção descarga',equip:'PENEIRÃO TERRA',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'2 A 3',frequencia:'QUINZENAL'},
    {setor:'Recepção descarga',equip:'SISTEMA DE ROSCA',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'3 A 4',frequencia:'SEMANALMENTE'},
    {setor:'Recepção descarga',equip:'ESTEIRA TERRA RETIRADA PENEIRÃO',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'3 A 4',frequencia:'SEMANALMENTE'},
    {setor:'Recepção descarga',equip:'ESTEIRA TERRA RETIRADA PENEIRÃO',item:'REDUTOR',lubrificante:'CERTOP',bombadas:'VER. NIVEL',frequencia:'QUINZENAL'},
    {setor:'Recepção descarga',equip:'REDER',item:'MANCAL ROLAMENTO',lubrificante:'',bombadas:'3 A 4',frequencia:'SEMANALMENTE'},
    {setor:'Recepção descarga',equip:'BALANÇA',item:'MANCAL ROLAMENTO',lubrificante:'',bombadas:'3 A 4',frequencia:'QUINZENAL'},
    {setor:'Recepção descarga',equip:'BALANÇA',item:'REDUTOR',lubrificante:'',bombadas:'VER. NIVEL',frequencia:'QUINZENAL'},
    {setor:'Armazenamento',equip:'TRANSPORTADOR HELICOIDAL Nº1',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'2 A 3',frequencia:'SEMANAL'},
    {setor:'Armazenamento',equip:'TRANSPORTADOR HELICOIDAL Nº2',item:'REDUTOR',lubrificante:'CERTOP FG',bombadas:'VER. NIVEL',frequencia:'MENSAL'},
    {setor:'Armazenamento',equip:'SISTEMA DE ROSCA',item:'REDUTOR',lubrificante:'CERTOP FG',bombadas:'VER. NIVEL',frequencia:'MENSAL'},
    {setor:'Armazenamento',equip:'ROSCA INCLINADA',item:'MOTORREDUTOR',lubrificante:'CERTOP FG',bombadas:'VER. NIVEL',frequencia:'MENSAL'},
    {setor:'Armazenamento',equip:'LAVADOR 1',item:'MOTORREDUTOR',lubrificante:'CERTOP FG',bombadas:'VER. NIVEL',frequencia:'MENSAL'},
    {setor:'Armazenamento',equip:'PENEIRA',item:'MOTOR /POLIA',lubrificante:'PREMALUBE XTREME FG',bombadas:'2 A 3',frequencia:'MENSAL'},
    {setor:'Armazenamento',equip:'ROSCA SAÍDA DA PENEIRA',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'2 A 4',frequencia:'MENSAL'},
    {setor:'Armazenamento',equip:'LAVADOR 2',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'2 A 3',frequencia:'MENSAL'},
    {setor:'Armazenamento',equip:'CORREIA DE INSPEÇÃO',item:'MOTORREDUTOR',lubrificante:'CERTOP FG',bombadas:'VER. NIVEL',frequencia:'QUINZENAL'},
    {setor:'Moagem',equip:'ESTEIRA DE ESCOLHA DE MANDIOCA',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'3 A 4',frequencia:'SEMANAL'},
    {setor:'Moagem',equip:'MOINHO PICADOR DE MANDIOCA',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'5 A 7',frequencia:'SEMANAL'},
    {setor:'Moagem',equip:'ROSCA ELEVADORA DE MANDIOCA',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'5 A 7',frequencia:'SEMANAL'},
    {setor:'Moagem',equip:'CEVADEIRA',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE  FG',bombadas:'5 A 6',frequencia:'SEMANAL'},
    {setor:'extração',equip:'BOMBA DE TRANSPORTE DE MASSA',item:'MOTORREDUTOR',lubrificante:'CERTOP FG',bombadas:'VER. NIVEL',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'FILTRO PRENSA AUTOMÁTICO 1',item:'MOTORREDUTOR',lubrificante:'CERTOP FG',bombadas:'VER. NIVEL',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'CAIXA COLETORA E DOSADORA DE MASSA 1',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE  XTREME FG',bombadas:'5 A 6',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'ROSCA HORIZONTAL 1',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE  XTREME FG',bombadas:'5 A 6',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'ROSCA VERTICAL 1',item:'ROLAMENTO',lubrificante:'PREMALUBE  XTREME FG',bombadas:'5 A 6',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'BOMBA DE TRANSPORTE DE MASSA 2',item:'MANCAL ROLAMENTO',lubrificante:'CERTOP FG',bombadas:'VER. NIVEL',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'FILTRO PRENSA AUTOMÁTICO 2',item:'MOTORREDUTOR',lubrificante:'ÓLEO 220',bombadas:'VER. NIVEL',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'PISTÃO DA PRENSA 01',item:'BOMBA',lubrificante:'ÓLEO 68',bombadas:'',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'CAIXA COLETORA E DOSADORA DE MASSA 2',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE  XTREME FG',bombadas:'5 A 6',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'ROSCA HORIZONTAL 2',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE  XTREME FG',bombadas:'5 A 6',frequencia:'QUINZENAL'},
    {setor:'extração',equip:'ROSCA VERTICAL 2',item:'ROLAMENTO',lubrificante:'PREMALUBE  XTREME FG',bombadas:'5 A 6',frequencia:'QUINZENAL'},
    {setor:'secagem',equip:'DOSADOR DE MASSA PRENSADA PARA FORNO PRÉ-AQUECEDOR 1',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'4 A 5',frequencia:'QUINZENAL'},
    {setor:'secagem',equip:'DOSADOR DE MASSA PRENSADA PARA FORNO PRÉ-AQUECEDOR 2',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'4 A 5',frequencia:'QUINZENAL'},
    {setor:'secagem',equip:'FORNO PRÉ-AQUECEDOR DE MASSA DE MANDIOCA 1',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'4 A 5',frequencia:'QUINZENAL'},
    {setor:'secagem',equip:'FORNO CONTINUO A VAPOR 1',item:'ROLAMENTO',lubrificante:'PREMALUBE  FG',bombadas:'2 A 3',frequencia:'SEMANAL'},
    {setor:'secagem',equip:'FORNO CONTINUO A VAPOR 2',item:'ROLAMENTO',lubrificante:'PREMALUBE  FG',bombadas:'2 A 3',frequencia:'SEMANAL'},
    {setor:'secagem',equip:'PENEIRA VIBRATÓPORIA 1',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'7 A 8',frequencia:'QUINZENAL'},
    {setor:'secagem',equip:'PENEIRA VIBRATÓPORIA 2',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'7 A 8',frequencia:'QUINZENAL'},
    {setor:'secagem',equip:'MOINHO TRITURADOR DE CAROLO COM TRANSPORTE PNEUMÁTICO 1',item:'ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'2 A 3',frequencia:'QUINZENAL'},
    {setor:'secagem',equip:'RESFRIADOR PARA FARINHA DE MANDIOCA 1',item:'ROLAMENTO',lubrificante:'PREMALUBE XTREME FG',bombadas:'3 A 4',frequencia:'QUINZENAL'},
    {setor:'ENSAQUE',equip:'ROSCA HORIZONTAL',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE FG',bombadas:'3  A 4',frequencia:'SEMANAL'},
    {setor:'ENSAQUE',equip:'ROSCA VERTICAL',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE FG',bombadas:'3 A 4',frequencia:'SEMANAL'},
    {setor:'ENSAQUE',equip:'PADRONIZADOR',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE FG',bombadas:'3 A 4',frequencia:'SEMANAL'},
    {setor:'ENSAQUE',equip:'MOINHO',item:'MANCAL ROLAMENTO',lubrificante:'PREMALUBE FG',bombadas:'3 A 4',frequencia:'SEMANAL'},
  ],

  colaboradores: [
    {id:1,nome:'Valmir',funcao:'Técnico Mecânico',setor:'Manutenção'},
    {id:2,nome:'Luan',funcao:'Técnico Mecânico',setor:'Manutenção'},
    {id:3,nome:'Eduardo',funcao:'Supervisor',setor:'Manutenção'},
    {id:4,nome:'Reginaldo',funcao:'Operador',setor:'Extração'},
  ],

  ferramentasEletrica: [
    {nome:'Alicate Universal 8” c/ prensa terminal',qty:1},
    {nome:'Alicate de Bico Meia Cana isolado 5”',qty:1},
    {nome:'Alicate de Corte Diagonal',qty:1},
    {nome:'Alicate de Pressão 8”',qty:1},
    {nome:'Chave Canhão 10mm',qty:1},
    {nome:'Chave Canhão 08mm',qty:1},
    {nome:'Chave Canhão 07mm',qty:1},
    {nome:'Chave Canhão 06mm',qty:1},
    {nome:'Chave Combinada 06mm',qty:1},
    {nome:'Chave Combinada 07mm',qty:1},
    {nome:'Chave Combinada 08mm',qty:1},
    {nome:'Chave Combinada 10mm',qty:2},
    {nome:'Chave Combinada 11mm',qty:2},
    {nome:'Chave Combinada 13mm',qty:2},
    {nome:'Chave Combinada 14mm',qty:2},
    {nome:'Chave Combinada 17mm',qty:2},
    {nome:'Chave Combinada 19mm',qty:2},
    {nome:'Chave Combinada 22mm',qty:2},
    {nome:'Chave Combinada 24mm',qty:2},
    {nome:'Chave Inglesa 8\'\' ou 10”',qty:1},
    {nome:'Chave de Fenda ¼”x5”  isol para 1000V',qty:1},
    {nome:'Chave de Fenda 1/8”x5”  isol para 1000V',qty:1},
    {nome:'Chave de Fenda 3/16”x6”  isol para 1000V',qty:1},
    {nome:'Chave de Fenda 3/8”x10”  isol para 1000V',qty:1},
    {nome:'Chave Philips ¼”x5”  isol para 1000V',qty:1},
    {nome:'Chave Philips 3/16”x3”  isol para 1000V',qty:1},
    {nome:'Jogo de Chave ALLEN MM',qty:1},
    {nome:'Jogo de Chave TORX',qty:1},
    {nome:'Alicate Amperímetro (Multímetro)',qty:1},
    {nome:'Caixa de ferramentas',qty:1},
  ],

  ferramentasMecanica: [
    {nome:'jogo allen polegada',qty:1},
    {nome:'chave inglesa 12\'',qty:1},
    {nome:'chave grifo 300mm',qty:1},
    {nome:'chave 28\'',qty:2},
    {nome:'espatula 18\'',qty:1},
    {nome:'chave 15/16',qty:2},
    {nome:'chave 22\'',qty:2},
    {nome:'chave 21\'',qty:1},
    {nome:'chave 20\'',qty:1},
    {nome:'chave 20-22\'',qty:1},
    {nome:'chave 19\'',qty:2},
    {nome:'chave 3/4',qty:2},
    {nome:'chave 17\'',qty:2},
    {nome:'chave 16\'',qty:2},
    {nome:'chave 5/8\'',qty:1},
    {nome:'chave 15\'',qty:2},
    {nome:'chave 14\'',qty:2},
    {nome:'chave 9/16\'',qty:2},
    {nome:'chave 1/2\'',qty:3},
    {nome:'chave 13\'',qty:1},
    {nome:'chave 12\'',qty:2},
    {nome:'chave 11\'',qty:2},
    {nome:'chave 10\'',qty:2},
    {nome:'chave 9\'',qty:1},
    {nome:'chave 8\'',qty:2},
    {nome:'jogo allen milimetros',qty:1},
    {nome:'chave 27\'',qty:2},
    {nome:'chave 32\'',qty:2},
    {nome:'chave 30\'',qty:1},
    {nome:'chave L 3/4\'',qty:1},
    {nome:'chave canhão 8\'',qty:1},
    {nome:'chave canhão 10\'',qty:1},
    {nome:'chave canhão 11\'',qty:1},
    {nome:'chave canhão 12\'',qty:1},
    {nome:'chave canhão 13\'',qty:1},
    {nome:'chave de fenda 4\'',qty:2},
    {nome:'chave de fenda 6\'',qty:2},
    {nome:'chave de fenda 10\'',qty:1},
    {nome:'chave de fenda 1,1/2\'',qty:1},
    {nome:'chave philips 4\'',qty:2},
    {nome:'chave philips 8\'',qty:1},
    {nome:'lima chata 8\'',qty:1},
    {nome:'alicates de pressão',qty:2},
    {nome:'alicates de trava elástica',qty:3},
    {nome:'talhadeira 14\'',qty:1},
    {nome:'talhadeira 10\'',qty:1},
    {nome:'marreta 1kg',qty:1},
    {nome:'alicate universal',qty:1},
    {nome:'alicate de bica',qty:1},
    {nome:'alicate de corte',qty:1},
  ],

  caixasFerramentas: [
    {caixa:'VERDE',nome:'CHAVE 1/2 OU 13',qty:2,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'CHAVE 9/16 OU 14',qty:2,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'CHAVE 3/4 OU 19',qty:2,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'CHAVE 15/16 OU 24',qty:2,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'CHAVE DE FENDA',qty:1,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'CHAVE PHILIPS',qty:1,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'ALICATE UNIVERSAL',qty:1,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'ALICATE DE CORTE',qty:1,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'MARRETA DE BORRACHA',qty:1,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'MARRETA',qty:1,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'FITA ISOLANTE',qty:1,area:'Secagem / Ensaques'},
    {caixa:'VERDE',nome:'FITA DE ALTA FUSÃO',qty:1,area:'Secagem / Ensaques'},
    {caixa:'VERMELHA',nome:'CHAVE 1/2 OU 13',qty:2,area:''},
    {caixa:'VERMELHA',nome:'CHAVE 9/16 OU 14',qty:2,area:''},
    {caixa:'VERMELHA',nome:'CHAVE 3/4 OU 19',qty:2,area:''},
    {caixa:'VERMELHA',nome:'CHAVE 15/16 OU 24',qty:2,area:''},
    {caixa:'VERMELHA',nome:'CHAVE DE FENDA',qty:1,area:''},
    {caixa:'VERMELHA',nome:'CHAVE PHILIPS',qty:1,area:''},
    {caixa:'VERMELHA',nome:'ALICATE UNIVERSAL',qty:1,area:''},
    {caixa:'VERMELHA',nome:'ALICATE DE CORTE',qty:1,area:''},
    {caixa:'VERMELHA',nome:'MARRETA DE BORRACHA',qty:1,area:''},
    {caixa:'VERMELHA',nome:'MARRETA',qty:1,area:''},
  ],
};

// ── As funções allXxx() estão definidas acima no bloco STATE ──
// (lêem de STATE, que é carregado do Supabase no loadAll())

// ══════════════════════════════════════════
// PAGINAÇÃO
// ══════════════════════════════════════════
const PAGE_SIZE = 12;
let osPage = 1, prevPage = 1, planPage = 1, luPage = 1;

// ══════════════════════════════════════════
// RELÓGIO
// ══════════════════════════════════════════
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('pt-BR');
  document.getElementById('today-date').textContent =
    now.toLocaleDateString('pt-BR');
}
setInterval(updateClock, 1000);
updateClock();

// ══════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════
function goPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(id)) {
      n.classList.add('active');
    }
  });
  // Render on navigate
  if (id === 'dashboard') renderDashboard();
  if (id === 'ordens') { osPage = 1; renderOrdens(); }
  if (id === 'preventiva') { prevPage = 1; renderPreventiva(); }
  if (id === 'planos') { planPage = 1; renderPlanos(); }
  if (id === 'equipamentos') renderEquipamentos();
  if (id === 'ferramentas') renderFerramentas();
  if (id === 'cadastros') { switchCadTab('equip'); }
  if (id === 'lubrificacao') { luPage = 1; renderLubrificacao(); }
  if (id === 'colaboradores') renderColaboradores();
  if (id === 'indicadores') renderIndicadores();
}

// ══════════════════════════════════════════
// SALVAR O.S.
// ══════════════════════════════════════════
async function salvarOS() {
  const peq  = document.getElementById('f-parada-equip').checked;
  const pprod = document.getElementById('f-parada-prod').checked;
  const nova = {
    data:           document.getElementById('f-data').value,
    hora:           document.getElementById('f-hora').value,
    req:            document.getElementById('f-req').value || '—',
    setor:          document.getElementById('f-setor').value,
    tipo:           document.getElementById('f-tipo').value,
    natureza:       document.getElementById('f-natureza').value,
    desc:           document.getElementById('f-desc').value || '—',
    prioridade:     document.getElementById('f-prioridade').value,
    dataProg:       document.getElementById('f-prog').value || null,
    dataConcl:      document.getElementById('f-status').value === 'Concluído' ? new Date().toISOString().split('T')[0] : null,
    realizado:      document.getElementById('f-realizado').value || null,
    exec:           document.getElementById('f-exec').value || null,
    status:         document.getElementById('f-status').value,
    paradaEquip:    peq,
    paradaEquipIni: peq ? document.getElementById('f-peq-ini-data').value || null : null,
    paradaEquipIniH:peq ? document.getElementById('f-peq-ini-hora').value || null : null,
    paradaEquipRet: peq ? document.getElementById('f-peq-ret-data').value || null : null,
    paradaEquipRetH:peq ? document.getElementById('f-peq-ret-hora').value || null : null,
    paradaProd:     pprod,
    paradaProdIni:  pprod ? document.getElementById('f-pprod-ini-data').value || null : null,
    paradaProdIniH: pprod ? document.getElementById('f-pprod-ini-hora').value || null : null,
    paradaProdRet:  pprod ? document.getElementById('f-pprod-ret-data').value || null : null,
    paradaProdRetH: pprod ? document.getElementById('f-pprod-ret-hora').value || null : null,
  };
  if (sb) {
    const { data: saved, error } = await sb.from('ordens').insert([{
      data: nova.data, hora: nova.hora, req: nova.req, setor: nova.setor,
      tipo: nova.tipo, natureza: nova.natureza, descricao: nova.desc,
      prioridade: nova.prioridade, data_prog: nova.dataProg || null,
      realizado: nova.realizado || null, exec: nova.exec || null, status: nova.status,
      parada_equip:      nova.paradaEquip,
      parada_equip_ini:  nova.paradaEquipIni,
      parada_equip_ini_h:nova.paradaEquipIniH,
      parada_equip_ret:  nova.paradaEquipRet,
      parada_equip_ret_h:nova.paradaEquipRetH,
      parada_prod:       nova.paradaProd,
      parada_prod_ini:   nova.paradaProdIni,
      parada_prod_ini_h: nova.paradaProdIniH,
      parada_prod_ret:   nova.paradaProdRet,
      parada_prod_ret_h: nova.paradaProdRetH,
    }]).select().single();
    if (error) { showToast('Erro ao salvar O.S.: ' + error.message, true); return; }
    nova.id = saved.id;
    showToast('O.S. #' + saved.id + ' criada!');
  } else {
    nova.id = Date.now();
  }
  STATE.ordens.unshift(nova);
  closeModal('modal-os');
  document.getElementById('f-data').value = '';
  document.getElementById('f-desc').value = '';
  document.getElementById('f-parada-equip').checked = false;
  document.getElementById('f-parada-prod').checked  = false;
  toggleParadaEquip(); toggleParadaProd();
  renderDashboard();
  renderOrdens();
}

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
function renderDashboard() {
  const ordens = allOrdens();
  const total = ordens.length;
  const abertas = ordens.filter(o => o.status === 'Em Aberto').length;
  const concluidas = ordens.filter(o => o.status === 'Concluído').length;
  const alta = ordens.filter(o => o.prioridade === 'Urgente' || o.prioridade === 'Emergente').length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card yellow">
      <div class="stat-label">Total O.S.</div>
      <div class="stat-value" style="color:var(--accent)">${total}</div>
      <div class="stat-sub">desde o início</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">Em Aberto</div>
      <div class="stat-value" style="color:var(--danger)">${abertas}</div>
      <div class="stat-sub">aguardando execução</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Concluídas</div>
      <div class="stat-value" style="color:var(--accent3)">${concluidas}</div>
      <div class="stat-sub">${Math.round(concluidas/total*100)}% de conclusão</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Alta Prioridade</div>
      <div class="stat-value" style="color:var(--accent2)">${alta}</div>
      <div class="stat-sub">atenção imediata</div>
    </div>
    <div class="stat-card yellow">
      <div class="stat-label">Equipamentos</div>
      <div class="stat-value" style="color:var(--accent)">${STATE.equipamentos.length}</div>
      <div class="stat-sub">cadastrados</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Planos Ativos</div>
      <div class="stat-value" style="color:var(--accent2)">${STATE.planos.length}</div>
      <div class="stat-sub">itens de manutenção</div>
    </div>
  `;

  // Chart tipo
  const tipos = {};
  ordens.forEach(o => { tipos[o.tipo] = (tipos[o.tipo]||0)+1; });
  const maxTipo = Math.max(...Object.values(tipos));
  const colors = { 'Corretiva': '#f87171', 'melhoria': '#60b8ff', 'Preventiva': '#34d399' };
  document.getElementById('chart-tipo').innerHTML = Object.entries(tipos).map(([k,v]) =>
    `<div class="bar-item">
      <div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxTipo*100)}%;background:${colors[k]||'#F1FFFF'}"></div></div>
      <div class="bar-val">${v}</div>
    </div>`
  ).join('');

  // Chart setor
  const setores = {};
  ordens.forEach(o => { setores[o.setor.trim()] = (setores[o.setor.trim()]||0)+1; });
  const maxSet = Math.max(...Object.values(setores));
  const setColors = ['#F1FFFF','#60b8ff','#34d399','#f87171','#a78bfa','#38bdf8'];
  let si = 0;
  document.getElementById('chart-setor').innerHTML = Object.entries(setores)
    .sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v]) =>
    `<div class="bar-item">
      <div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxSet*100)}%;background:${setColors[si++%setColors.length]}"></div></div>
      <div class="bar-val">${v}</div>
    </div>`
  ).join('');

  // Últimas O.S.
  const recentes = [...ordens].sort((a,b) => b.id - a.id).slice(0, 8);
  document.getElementById('dash-os-tbody').innerHTML = recentes.map(o => dashRow(o)).join('');
}

// ══════════════════════════════════════════
// ORDENS
// ══════════════════════════════════════════
function osFiltered() {
  const q = (document.getElementById('os-search')?.value || '').toLowerCase();
  const tipo = document.getElementById('os-filter-tipo')?.value || '';
  const status = document.getElementById('os-filter-status')?.value || '';
  const setor = document.getElementById('os-filter-setor')?.value || '';
  return allOrdens().filter(o => {
    const match = !q || o.desc.toLowerCase().includes(q) || o.setor.toLowerCase().includes(q) || o.req.toLowerCase().includes(q);
    const matchTipo = !tipo || o.tipo === tipo;
    const matchStatus = !status || o.status === status;
    const matchSetor = !setor || o.setor.trim() === setor;
    return match && matchTipo && matchStatus && matchSetor;
  }).sort((a,b) => b.id - a.id);
}

function renderOrdens() {
  // populate setor filter
  const setorSel = document.getElementById('os-filter-setor');
  if (setorSel && setorSel.children.length < 2) {
    const setores = [...new Set(allOrdens().map(o => o.setor.trim()))].sort();
    setores.forEach(s => { const opt = document.createElement('option'); opt.value = s; opt.textContent = s; setorSel.appendChild(opt); });
  }

  const data = osFiltered();
  const total = data.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (osPage > pages) osPage = 1;
  const slice = data.slice((osPage-1)*PAGE_SIZE, osPage*PAGE_SIZE);

  document.getElementById('os-tbody').innerHTML = slice.map(o => osRow(o, true)).join('');
  document.getElementById('os-count-label').textContent = `${total} registros`;
  renderPagination('os-pages', pages, osPage, p => { osPage=p; renderOrdens(); });
}

function dashRow(o) {
  const statusBadge = o.status === 'Concluído'
    ? '<span class="badge badge-green">✓ Concluído</span>'
    : '<span class="badge badge-red">● Em Aberto</span>';
  const pClass = o.prioridade === 'Emergente' ? 'prio-alta' : o.prioridade === 'Urgente' ? 'prio-alta' : o.prioridade === 'Normal' ? 'prio-media' : 'prio-baixa';
  const dataFmt = o.data ? o.data.split('-').reverse().join('/') : '—';
  return `<tr style="cursor:pointer" onclick="openDetail(${o.id})">
    <td><span style="font-family:var(--mono);color:var(--muted)">#${o.id}</span></td>
    <td style="font-family:var(--mono);font-size:.75rem">${dataFmt}</td>
    <td style="font-size:.82rem">${h(o.req)}</td>
    <td><span style="color:var(--accent);font-size:.75rem;font-weight:700">${h(o.setor.trim())}</span></td>
    <td><span class="badge ${o.tipo==='Corretiva'?'badge-red':o.tipo==='melhoria'?'badge-blue':'badge-green'}">${h(o.tipo)}</span></td>
    <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem">${h(o.desc)}</td>
    <td style="font-size:.78rem">${h(o.exec)||'—'}</td>
    <td>${statusBadge}</td>
    <td><div class="prio ${pClass}"><div class="prio-dot"></div>${h(o.prioridade)}</div></td>
  </tr>`;
}

function osRow(o, withAction=false) {
  const statusBadge = o.status === 'Concluído'
    ? '<span class="badge badge-green">✓ Concluído</span>'
    : '<span class="badge badge-red">● Em Aberto</span>';
  const pClass = o.prioridade === 'Emergente' ? 'prio-alta' : o.prioridade === 'Urgente' ? 'prio-alta' : o.prioridade === 'Normal' ? 'prio-media' : 'prio-baixa';
  const dataFmt = o.data ? o.data.split('-').reverse().join('/') : '—';
  const action = withAction
    ? `<td><div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="openDetail(${o.id})">Ver</button>
        ${o.status === 'Em Aberto' ? `<button class="btn btn-success btn-sm" onclick="abrirConcluirOS(${o.id})">✓ Concluir</button>` : ''}
      </div></td>`
    : '';
  return `<tr>
    <td><span style="font-family:var(--mono);color:var(--muted)">#${o.id}</span></td>
    <td style="font-family:var(--mono);font-size:.75rem">${dataFmt}</td>
    <td>${h(o.req)}</td>
    <td><span style="color:var(--accent);font-size:.75rem;font-weight:700">${h(o.setor.trim())}</span></td>
    <td><span class="badge ${o.tipo==='Corretiva'?'badge-red':o.tipo==='melhoria'?'badge-blue':'badge-green'}">${h(o.tipo)}</span></td>
    <td style="color:var(--muted);font-size:.78rem">${h(o.natureza)}</td>
    <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(o.desc)}</td>
    <td style="font-size:.78rem">${h(o.exec)||'—'}</td>
    <td>${statusBadge}</td>
    <td><div class="prio ${pClass}"><div class="prio-dot"></div>${h(o.prioridade)}</div></td>
    ${action}
  </tr>`;
}

function openDetail(id) {
  const o = allOrdens().find(x => x.id === id);
  if (!o) return;

  const fmtD = s => s ? s.split('-').reverse().join('/') : '—';
  const lbl  = (title, val) =>
    '<div class="os-field"><span class="lbl">' + title + '</span><span class="val">' + (val || '—') + '</span></div>';

  // bloco de parada
  const paradaEquipHtml = o.paradaEquip ? (
    '<div style="grid-column:span 2;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:6px;padding:8px 12px;margin-top:4px">' +
    '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:#fbbf24;font-weight:700;margin-bottom:6px">⚠ Parada de Equipamento</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">' +
    lbl('Início — Data', fmtD(o.paradaEquipIni)) +
    lbl('Início — Hora', h(o.paradaEquipIniH)) +
    lbl('Retorno — Data', fmtD(o.paradaEquipRet)) +
    lbl('Retorno — Hora', h(o.paradaEquipRetH)) +
    '</div></div>'
  ) : '';

  const paradaProdHtml = o.paradaProd ? (
    '<div style="grid-column:span 2;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:6px;padding:8px 12px;margin-top:4px">' +
    '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:#ef4444;font-weight:700;margin-bottom:6px">⛔ Parada de Produção</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">' +
    lbl('Início — Data', fmtD(o.paradaProdIni)) +
    lbl('Início — Hora', h(o.paradaProdIniH)) +
    lbl('Retorno — Data', fmtD(o.paradaProdRet)) +
    lbl('Retorno — Hora', h(o.paradaProdRetH)) +
    '</div></div>'
  ) : '';

  // checklist de execuções
  const execucoes = STATE.osExecucoes.filter(e => e.os_id === id);
  const checklistHtml = execucoes.length > 0 ? (
    '<div style="margin-top:16px">' +
    '<div style="font-size:.7rem;text-transform:uppercase;color:var(--muted);font-weight:700;letter-spacing:.1em;margin-bottom:8px">Checklist de Execução</div>' +
    '<div style="overflow-x:auto"><table class="table" style="min-width:640px;font-size:.8rem"><thead><tr>' +
    '<th>Mantenedor</th><th>Data Exec.</th><th>Hora Início</th><th>Data Fim</th><th>Hora Fim</th><th>Data Fech.</th><th>Assinatura</th>' +
    '</tr></thead><tbody>' +
    execucoes.map(e =>
      '<tr>' +
      '<td>' + h(e.mantenedor) + '</td>' +
      '<td>' + fmtD(e.data_exec) + '</td>' +
      '<td>' + h(e.hora_ini || '—') + '</td>' +
      '<td>' + fmtD(e.data_fim) + '</td>' +
      '<td>' + h(e.hora_fim || '—') + '</td>' +
      '<td>' + fmtD(e.data_fech) + '</td>' +
      '<td>' + h(e.assinatura || '—') + '</td>' +
      '</tr>'
    ).join('') +
    '</tbody></table></div></div>'
  ) : '';

  document.getElementById('detail-title').textContent = 'Ordem de Serviço #' + String(o.id).padStart(4, '0');
  document.getElementById('detail-body').innerHTML =
    '<div class="os-detail">' +
    lbl('Data',           fmtD(o.data)) +
    lbl('Hora',           h(o.hora)) +
    lbl('Requisitante',   h(o.req)) +
    lbl('Setor',          h(o.setor ? o.setor.trim() : '')) +
    lbl('Tipo',           h(o.tipo)) +
    lbl('Demanda',        h(o.natureza)) +
    lbl('Prioridade',     h(o.prioridade)) +
    lbl('Status',         h(o.status)) +
    lbl('Data Programada',fmtD(o.dataProg)) +
    lbl('Data Conclusão', fmtD(o.dataConcl)) +
    paradaEquipHtml +
    paradaProdHtml +
    '</div>' +
    '<div style="margin-bottom:12px">' +
    '<div style="font-size:.7rem;text-transform:uppercase;color:var(--muted);font-weight:700;letter-spacing:.1em;margin-bottom:5px">Descrição</div>' +
    '<div style="background:var(--surface2);border-radius:6px;padding:10px 14px;font-size:.85rem">' + h(o.desc) + '</div>' +
    '</div>' +
    (o.realizado ?
      '<div><div style="font-size:.7rem;text-transform:uppercase;color:var(--muted);font-weight:700;letter-spacing:.1em;margin-bottom:5px">Serviço Realizado</div>' +
      '<div style="background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.25);border-radius:6px;padding:10px 14px;font-size:.85rem">' + h(o.realizado) + '</div></div>'
      : '') +
    checklistHtml;

  currentDetailId = id;
  document.getElementById('detail-concluir-btn').style.display = o.status === 'Em Aberto' ? 'inline-flex' : 'none';

  const delBtn = document.getElementById('detail-delete-btn');
  delBtn.style.display = 'inline-flex';
  delBtn.onclick = async () => {
    if (!confirm('Excluir esta O.S.?')) return;
    if (sb) {
      const { error } = await sb.from('ordens').delete().eq('id', id);
      if (error) { showToast('Erro: ' + error.message, true); return; }
      showToast('O.S. excluída.');
    }
    STATE.ordens = STATE.ordens.filter(o => o.id !== id);
    STATE.osExecucoes = STATE.osExecucoes.filter(e => e.os_id !== id);
    closeModal('modal-os-detail');
    renderDashboard();
    renderOrdens();
  };
  openModal('modal-os-detail');
}

let currentDetailId = null;

function imprimirOS(id) {
  const o = allOrdens().find(x => x.id === id);
  if (!o) return;

  const fmtD = s => s ? s.split('-').reverse().join('/') : '—';
  const chk  = (val, opt, label) => (val === opt ? '☑' : '☐') + ' ' + label;
  const set  = (elId, txt) => { const el = document.getElementById(elId); if (el) el.textContent = txt; };

  set('pos-setor',    o.setor ? o.setor.trim() : '—');
  set('pos-numero',   '#' + String(o.id).padStart(4, '0'));
  set('pos-req',      o.req || '');
  set('pos-descricao', o.desc || '');
  set('pos-datahora',  fmtD(o.data) + '   ' + (o.hora || '—'));
  set('pos-realizado', o.realizado || '');

  document.getElementById('pos-tipo').innerHTML =
    '<span class="chk-item">' + chk(o.tipo, 'Corretiva',           'Corretiva')       + '</span> ' +
    '<span class="chk-item">' + chk(o.tipo, 'Corretiva Programada','Corr. Programada') + '</span> ' +
    '<span class="chk-item">' + chk(o.tipo, 'Preventiva',          'Preventiva')       + '</span> ' +
    '<span class="chk-item">' + chk(o.tipo, 'Inspeção de Rota',    'Insp. Rota')        + '</span> ' +
    '<span class="chk-item">' + chk(o.tipo, 'melhoria',            'Melhoria')         + '</span>';

  document.getElementById('pos-equipe').innerHTML =
    '<span class="chk-item">' + chk(o.natureza, 'Predial',  'Predial')  + '</span> ' +
    '<span class="chk-item">' + chk(o.natureza, 'Elétrica', 'Elétrica') + '</span> ' +
    '<span class="chk-item">' + chk(o.natureza, 'Mecânica', 'Mecânica') + '</span>';

  document.getElementById('pos-prioridade').innerHTML =
    '<span class="chk-item">' + chk(o.prioridade, 'Baixa',    'Baixa')     + '</span> ' +
    '<span class="chk-item">' + chk(o.prioridade, 'Normal',   'Normal')    + '</span> ' +
    '<span class="chk-item">' + chk(o.prioridade, 'Urgente',  'Urgente')   + '</span> ' +
    '<span class="chk-item">' + chk(o.prioridade, 'Emergente','Emergente') + '</span>';

  // Parada de Equipamento
  const peqSec = document.getElementById('pos-parada-equip-section');
  if (o.paradaEquip) {
    peqSec.style.display = 'block';
    set('pos-peq-ini-data', fmtD(o.paradaEquipIni));
    set('pos-peq-ini-hora', o.paradaEquipIniH || '—');
    set('pos-peq-ret-data', fmtD(o.paradaEquipRet));
    set('pos-peq-ret-hora', o.paradaEquipRetH || '—');
  } else { peqSec.style.display = 'none'; }

  // Parada de Produção
  const pprodSec = document.getElementById('pos-parada-prod-section');
  if (o.paradaProd) {
    pprodSec.style.display = 'block';
    set('pos-pprod-ini-data', fmtD(o.paradaProdIni));
    set('pos-pprod-ini-hora', o.paradaProdIniH || '—');
    set('pos-pprod-ret-data', fmtD(o.paradaProdRet));
    set('pos-pprod-ret-hora', o.paradaProdRetH || '—');
  } else { pprodSec.style.display = 'none'; }

  // Checklist de execução
  const execucoes = STATE.osExecucoes.filter(e => e.os_id === id);
  const tbody = document.getElementById('pos-checklist-tbody');
  if (execucoes.length > 0) {
    tbody.innerHTML = execucoes.map(e =>
      '<tr>' +
      '<td>' + h(e.mantenedor || '') + '</td>' +
      '<td>' + fmtD(e.data_exec) + '</td>' +
      '<td>' + h(e.hora_ini || '') + '</td>' +
      '<td>' + fmtD(e.data_fim) + '</td>' +
      '<td>' + h(e.hora_fim || '') + '</td>' +
      '<td>' + fmtD(e.data_fech) + '</td>' +
      '<td>' + h(e.assinatura || '') + '</td>' +
      '</tr>'
    ).join('');
  } else {
    tbody.innerHTML =
      '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
      '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
      '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  }

  const logo = document.getElementById('pos-logo');
  const logoTxt = document.getElementById('pos-logo-txt');
  if (logo) {
    logo.onerror = () => { logo.style.display = 'none'; if (logoTxt) logoTxt.style.display = 'block'; };
    logo.style.display = '';
    if (logoTxt) logoTxt.style.display = 'none';
  }

  window.print();
}

function toggleParadaEquip() {
  const show = document.getElementById('f-parada-equip').checked;
  document.getElementById('f-parada-equip-fields').style.display = show ? 'grid' : 'none';
}
function toggleParadaProd() {
  const show = document.getElementById('f-parada-prod').checked;
  document.getElementById('f-parada-prod-fields').style.display = show ? 'grid' : 'none';
}

function addLinhaChecklist(row = {}) {
  const tbody = document.getElementById('checklist-exec-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="text" class="cl-mantenedor" value="' + h(row.mantenedor || '') + '" placeholder="Nome" style="width:120px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:inherit"></td>' +
    '<td><input type="date" class="cl-data-exec" value="' + (row.data_exec || '') + '" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 4px;color:inherit"></td>' +
    '<td><input type="time" class="cl-hora-ini" value="' + (row.hora_ini || '') + '" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 4px;color:inherit"></td>' +
    '<td><input type="date" class="cl-data-fim" value="' + (row.data_fim || '') + '" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 4px;color:inherit"></td>' +
    '<td><input type="time" class="cl-hora-fim" value="' + (row.hora_fim || '') + '" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 4px;color:inherit"></td>' +
    '<td><input type="date" class="cl-data-fech" value="' + (row.data_fech || '') + '" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 4px;color:inherit"></td>' +
    '<td><input type="text" class="cl-assinatura" value="' + h(row.assinatura || '') + '" placeholder="Assinatura" style="width:100px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:inherit"></td>' +
    '<td><button class="btn btn-danger btn-sm" onclick="this.closest(\'tr\').remove()" style="padding:2px 7px">✕</button></td>';
  tbody.appendChild(tr);
}

function abrirConcluirOS(id) {
  currentDetailId = id;
  const o = allOrdens().find(x => x.id === id);
  document.getElementById('concluir-os-id').value = id;
  document.getElementById('concluir-realizado').value = o?.realizado || '';
  document.getElementById('concluir-data').value = new Date().toISOString().split('T')[0];
  document.getElementById('concluir-title').textContent = 'Concluir O.S. #' + id;

  const tbody = document.getElementById('checklist-exec-tbody');
  tbody.innerHTML = '';
  const execucoes = STATE.osExecucoes.filter(e => e.os_id === id);
  if (execucoes.length > 0) {
    execucoes.forEach(e => addLinhaChecklist(e));
  } else {
    addLinhaChecklist();
  }

  closeModal('modal-os-detail');
  openModal('modal-os-concluir');
}

async function confirmarConclusao() {
  const id = parseInt(document.getElementById('concluir-os-id').value);
  const realizado = document.getElementById('concluir-realizado').value.trim() || null;
  const dataConcl = document.getElementById('concluir-data').value || new Date().toISOString().split('T')[0];

  const rows = [];
  document.querySelectorAll('#checklist-exec-tbody tr').forEach(tr => {
    const mantenedor = tr.querySelector('.cl-mantenedor')?.value.trim() || null;
    if (!mantenedor) return;
    rows.push({
      os_id:      id,
      mantenedor,
      data_exec:  tr.querySelector('.cl-data-exec')?.value  || null,
      hora_ini:   tr.querySelector('.cl-hora-ini')?.value   || null,
      data_fim:   tr.querySelector('.cl-data-fim')?.value   || null,
      hora_fim:   tr.querySelector('.cl-hora-fim')?.value   || null,
      data_fech:  tr.querySelector('.cl-data-fech')?.value  || null,
      assinatura: tr.querySelector('.cl-assinatura')?.value.trim() || null,
    });
  });

  const exec = rows.map(r => r.mantenedor).join(' / ') || null;

  if (sb) {
    const { error } = await sb.from('ordens').update({
      status: 'Concluído', data_concl: dataConcl, exec, realizado,
    }).eq('id', id);
    if (error) { showToast('Erro: ' + error.message, true); return; }

    await sb.from('os_execucoes').delete().eq('os_id', id);
    if (rows.length > 0) {
      const { error: e2 } = await sb.from('os_execucoes').insert(rows);
      if (e2) { showToast('Erro no checklist: ' + e2.message, true); return; }
    }
  }

  const idx = STATE.ordens.findIndex(o => o.id === id);
  if (idx !== -1) {
    STATE.ordens[idx] = { ...STATE.ordens[idx], status: 'Concluído', dataConcl, data_concl: dataConcl, exec, realizado };
  }
  STATE.osExecucoes = STATE.osExecucoes.filter(e => e.os_id !== id).concat(rows);

  showToast('O.S. #' + id + ' concluída!');
  closeModal('modal-os-concluir');
  renderDashboard();
  renderOrdens();
}

// ══════════════════════════════════════════
// PREVENTIVA
// ══════════════════════════════════════════
// allPreventiva() → STATE.preventiva

function editarPreventiva(id) {
  const p = STATE.preventiva.find(x => x.id === id);
  if (!p) return;
  document.getElementById('fp-edit-id').value = id;
  document.getElementById('fp-equip').value    = p.equip || '';
  document.getElementById('fp-comp').value     = p.comp  || '';
  document.getElementById('fp-trim').value     = p.trim  || '1';
  document.getElementById('fp-planejada').value= p.planejada || '';
  document.getElementById('fp-realizada').value= p.realizada || '';
  document.getElementById('fp-exec').value     = p.exec  || '';
  document.getElementById('modal-prev-title').textContent = 'Editar Manutenção Preventiva';
  openModal('modal-prev');
}

async function excluirPreventiva(id) {
  if (!confirm('Excluir este registro de preventiva?')) return;
  if (sb) {
    const { error } = await sb.from('preventiva').delete().eq('id', id);
    if (error) { showToast('Erro: ' + error.message, true); return; }
  }
  STATE.preventiva = STATE.preventiva.filter(p => p.id !== id);
  showToast('Preventiva excluída.');
  renderPreventiva();
}

async function salvarPreventiva() {
  const editId = document.getElementById('fp-edit-id').value;
  const equip  = document.getElementById('fp-equip').value.trim();
  const comp   = document.getElementById('fp-comp').value.trim();
  if (!equip || !comp) { alert('Preencha equipamento e componente.'); return; }
  const campos = {
    equip,
    comp,
    trim:      document.getElementById('fp-trim').value,
    planejada: document.getElementById('fp-planejada').value || null,
    realizada: document.getElementById('fp-realizada').value || null,
    exec:      document.getElementById('fp-exec').value.trim() || null,
  };

  if (editId) {
    if (sb) {
      const { error } = await sb.from('preventiva').update({
        equip: campos.equip, comp: campos.comp, trimestre: campos.trim,
        planejada: campos.planejada, realizada: campos.realizada, exec: campos.exec,
      }).eq('id', parseInt(editId));
      if (error) { showToast('Erro: ' + error.message, true); return; }
    }
    const idx = STATE.preventiva.findIndex(p => p.id === parseInt(editId));
    if (idx !== -1) STATE.preventiva[idx] = { ...STATE.preventiva[idx], ...campos };
    showToast('Preventiva atualizada!');
  } else {
    if (sb) {
      const { data: saved, error } = await sb.from('preventiva').insert([{
        equip: campos.equip, comp: campos.comp, trimestre: campos.trim,
        planejada: campos.planejada, realizada: campos.realizada, exec: campos.exec,
      }]).select().single();
      if (error) { showToast('Erro: ' + error.message, true); return; }
      campos.id = saved.id;
      showToast('Preventiva salva!');
    }
    STATE.preventiva.unshift(campos);
  }
  closeModal('modal-prev');
  renderPreventiva();
}

function renderPreventiva() {
  const eqSel = document.getElementById('prev-filter-eq');
  if (eqSel && eqSel.children.length < 2) {
    const eqs = [...new Set(allPreventiva().map(p => p.equip))].sort();
    eqs.forEach(e => { const o = document.createElement('option'); o.value = e; o.textContent = e; eqSel.appendChild(o); });
  }

  const q = (document.getElementById('prev-search')?.value || '').toLowerCase();
  const eq = document.getElementById('prev-filter-eq')?.value || '';

  const data = allPreventiva().filter(p => {
    const match = !q || p.equip.toLowerCase().includes(q) || p.comp.toLowerCase().includes(q);
    const matchEq = !eq || p.equip === eq;
    return match && matchEq;
  });

  const total = data.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (prevPage > pages) prevPage = 1;
  const slice = data.slice((prevPage-1)*PAGE_SIZE, prevPage*PAGE_SIZE);

  const today = new Date().toISOString().split('T')[0];

  document.getElementById('prev-tbody').innerHTML = slice.map(p => {
    const done = !!p.realizada;
    const late = !done && p.planejada && p.planejada < today;
    const status = done
      ? '<span class="badge badge-green">✓ Realizado</span>'
      : late
        ? '<span class="badge badge-red">⚠ Atrasado</span>'
        : '<span class="badge badge-yellow">Pendente</span>';
    return `<tr>
      <td style="font-weight:600;font-size:.82rem">${h(p.equip)}</td>
      <td style="font-size:.8rem;color:var(--muted)">${h(p.comp)}</td>
      <td><span class="badge badge-gray">${h(p.trim)}º Trim.</span></td>
      <td style="font-family:var(--mono);font-size:.78rem">${h(p.planejada)||'—'}</td>
      <td style="font-family:var(--mono);font-size:.78rem">${h(p.realizada)||'—'}</td>
      <td style="font-size:.78rem">${h(p.exec)||'—'}</td>
      <td>${status}</td>
      <td><div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="editarPreventiva(${p.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="excluirPreventiva(${p.id})">Excluir</button>
      </div></td>
    </tr>`;
  }).join('');

  document.getElementById('prev-count-label').textContent = `${total} registros`;
  renderPagination('prev-pages', pages, prevPage, p => { prevPage=p; renderPreventiva(); });
}

// ══════════════════════════════════════════
// PLANOS
// ══════════════════════════════════════════
// allPlanos() → STATE.planos

function editarPlano(id) {
  const p = STATE.planos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('fpl-edit-id').value  = id;
  document.getElementById('fpl-setor').value    = p.setor  || '';
  document.getElementById('fpl-equip').value    = p.equip  || '';
  document.getElementById('fpl-plano').value    = p.plano  || 'LU';
  document.getElementById('fpl-item').value     = p.item   || '';
  document.getElementById('fpl-period').value   = p.period || '30 dias';
  document.getElementById('fpl-qty').value      = p.qty    || '';
  document.getElementById('modal-plano-title').textContent = 'Editar Item de Plano';
  openModal('modal-plano');
}

async function excluirPlano(id) {
  if (!confirm('Excluir este item do plano?')) return;
  if (sb) {
    const { error } = await sb.from('planos').delete().eq('id', id);
    if (error) { showToast('Erro: ' + error.message, true); return; }
  }
  STATE.planos = STATE.planos.filter(p => p.id !== id);
  showToast('Item excluído.');
  renderPlanos();
}

async function salvarPlano() {
  const editId = document.getElementById('fpl-edit-id').value;
  const setor  = document.getElementById('fpl-setor').value.trim().toUpperCase();
  const equip  = document.getElementById('fpl-equip').value.trim();
  const item   = document.getElementById('fpl-item').value.trim();
  if (!setor || !equip || !item) { alert('Preencha setor, equipamento e descrição do item.'); return; }
  const campos = {
    setor, equip, item,
    plano:  document.getElementById('fpl-plano').value,
    period: document.getElementById('fpl-period').value,
    qty:    parseInt(document.getElementById('fpl-qty').value) || null,
  };

  if (editId) {
    if (sb) {
      const { error } = await sb.from('planos').update(campos).eq('id', parseInt(editId));
      if (error) { showToast('Erro: ' + error.message, true); return; }
    }
    const idx = STATE.planos.findIndex(p => p.id === parseInt(editId));
    if (idx !== -1) STATE.planos[idx] = { ...STATE.planos[idx], ...campos };
    showToast('Plano atualizado!');
  } else {
    if (sb) {
      const { data: s, error } = await sb.from('planos').insert([campos]).select().single();
      if (error) { showToast('Erro: ' + error.message, true); return; }
      campos.id = s.id;
      showToast('Plano salvo!');
    }
    STATE.planos.push(campos);
  }
  closeModal('modal-plano');
  renderPlanos();
}

function renderPlanos() {
  const setorSel = document.getElementById('plan-filter-setor');
  if (setorSel && setorSel.children.length < 2) {
    const setores = [...new Set(allPlanos().map(p => p.setor))].sort();
    setores.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; setorSel.appendChild(o); });
  }

  const q = (document.getElementById('plan-search')?.value || '').toLowerCase();
  const setor = document.getElementById('plan-filter-setor')?.value || '';
  const plano = document.getElementById('plan-filter-plano')?.value || '';

  const data = allPlanos().filter(p => {
    const match = !q || p.equip.toLowerCase().includes(q) || p.item.toLowerCase().includes(q);
    const matchS = !setor || p.setor === setor;
    const matchP = !plano || p.plano === plano;
    return match && matchS && matchP;
  });

  const total = data.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (planPage > pages) planPage = 1;
  const slice = data.slice((planPage-1)*PAGE_SIZE, planPage*PAGE_SIZE);

  const tagClass = { LU: 'tag-lu', PRM: 'tag-prm', IRM: 'tag-irm' };

  document.getElementById('plan-tbody').innerHTML = slice.map(p => `<tr>
    <td style="color:var(--accent);font-size:.78rem;font-weight:700">${h(p.setor)}</td>
    <td style="font-weight:600;font-size:.82rem">${h(p.equip)}</td>
    <td><span class="plan-tag ${tagClass[p.plano]||''}">${h(p.plano)}</span></td>
    <td style="font-size:.8rem">${h(p.item)}</td>
    <td style="font-family:var(--mono);font-size:.78rem;color:var(--accent2)">${h(p.period)}</td>
    <td style="font-family:var(--mono);font-size:.78rem">${p.qty||'—'}</td>
    <td><div style="display:flex;gap:6px">
      <button class="btn btn-secondary btn-sm" onclick="editarPlano(${p.id})">Editar</button>
      <button class="btn btn-danger btn-sm" onclick="excluirPlano(${p.id})">Excluir</button>
    </div></td>
  </tr>`).join('');

  document.getElementById('plan-count-label').textContent = `${total} registros`;
  renderPagination('plan-pages', pages, planPage, p => { planPage=p; renderPlanos(); });
}

// ══════════════════════════════════════════
// EQUIPAMENTOS — SETOR → CARDS
// ══════════════════════════════════════════
let selectedSetor = null;

// allEquipamentos() → STATE.equipamentos

function allSetores() {
  const fromEquip  = allEquipamentos().map(e => e.setor.trim().toUpperCase());
  const fromState  = STATE.setores.map(s => s.trim().toUpperCase());
  const base = ['EXTRAÇÃO','SECAGEM','CALDEIRA','ENSAQUE','OFICINA','POÇO'];
  return [...new Set([...base, ...fromEquip, ...fromState])].sort();
}

const SETOR_ICONS = {
  'EXTRAÇÃO':'🌿','SECAGEM':'🔥','CALDEIRA':'♨️','ENSAQUE':'📦',
  'ENSAQUE 2':'📦','ENSAQUE 3':'📦','OFICINA':'🛠️','POÇO':'💧',
  'ÁREA SECA':'🌾','ENSAQUE 02':'📦','ARMAZENAMENTO':'🏪',
  'RECEPÇÃO DESCARGA':'🚛','MOAGEM':'⚙️','MANUTENÇÃO':'🔧',
};
function setorIcon(s) { return SETOR_ICONS[s] || '🏭'; }

function renderEquipamentos() {
  selectedSetor = null;
  document.getElementById('eq-setor-grid').style.display = 'grid';
  document.getElementById('eq-detail-panel').style.display = 'none';

  const setores = allSetores();
  const equips = allEquipamentos();

  document.getElementById('eq-setor-grid').innerHTML = setores.map(s => {
    const count = equips.filter(e => e.setor.trim().toUpperCase() === s).length;
    return `
      <div class="setor-card" onclick="selectSetor('${s}')">
        <div class="setor-card-icon">${setorIcon(s)}</div>
        <div class="setor-card-name">${s}</div>
        <div class="setor-card-count">${count} equipamento${count !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
}

function selectSetor(setor) {
  selectedSetor = setor;
  document.getElementById('eq-setor-grid').style.display = 'none';
  document.getElementById('eq-detail-panel').style.display = 'block';
  document.getElementById('eq-setor-label').textContent = setor;
  document.getElementById('eq-search').value = '';
  renderEquipCards();
}

function voltarSetores() {
  selectedSetor = null;
  document.getElementById('eq-setor-grid').style.display = 'grid';
  document.getElementById('eq-detail-panel').style.display = 'none';
}

function renderEquipCards() {
  const q = (document.getElementById('eq-search')?.value || '').toLowerCase();
  const equips = allEquipamentos().filter(e => {
    const matchSetor = e.setor.trim().toUpperCase() === selectedSetor;
    const matchQ = !q || e.nome.toLowerCase().includes(q);
    return matchSetor && matchQ;
  });

  document.getElementById('eq-setor-count').textContent = `${equips.length} equipamento(s)`;

  document.getElementById('eq-grid').innerHTML = equips.length ? equips.map(e => `
    <div class="eq-card">
      <div class="eq-sector">${h(e.setor)}</div>
      <div class="eq-name">${h(e.nome)}</div>
      <div style="font-size:.72rem;color:var(--muted)">${e.componentes.length} componente(s)</div>
      <div class="eq-components">
        ${e.componentes.map(c => `
          <div class="eq-comp">
            <span class="eq-comp-qty">${c.qty}×</span>
            <span>${h(c.nome)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('') : '<div class="empty"><div class="empty-icon">⚙️</div>Nenhum equipamento neste setor.</div>';
}

// ══════════════════════════════════════════
// FERRAMENTAS
// ══════════════════════════════════════════
// allFerretasEletrica() e allFerretasMecanica() → STATE (definidas acima)

function renderFerramentas() {
  renderCaixasFerramentas();
  const checkState = STATE.checkState;

  function buildCard(title, type, items) {
    const total = items.length;
    const checked = items.filter((_, i) => checkState[`${type}_${i}`]).length;
    return `
      <div class="checklist-card">
        <div class="checklist-hd">${title}</div>
        <div class="checklist-type">${type.toUpperCase()} · ${checked}/${total} verificados</div>
        <div style="height:4px;background:var(--surface2);border-radius:2px;margin-bottom:14px">
          <div style="height:100%;width:${Math.round(total?checked/total*100:0)}%;background:var(--accent3);border-radius:2px;transition:width .3s"></div>
        </div>
        ${items.map((f, i) => `
          <div class="tool-item">
            <div class="tool-check ${checkState[`${type}_${i}`] ? 'checked' : ''}" onclick="(function(){
              STATE.checkState['${type}_${i}']=!STATE.checkState['${type}_${i}'];
              renderFerramentas();
            })()"></div>
            <span style="${checkState[`${type}_${i}`]?'text-decoration:line-through;color:var(--muted)':''}">${h(f.nome)}</span>
            <span class="tool-qty">×${f.qty}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  document.getElementById('checklist-grid').innerHTML =
    buildCard('Ferramentas — Elétrica', 'eletrica', allFerretasEletrica()) +
    buildCard('Ferramentas — Mecânica', 'mecanica', allFerretasMecanica());
}

// ══════════════════════════════════════════
// CADASTROS
// ══════════════════════════════════════════
function switchCadTab(tab) {
  ['equip','itens','setores'].forEach(t => {
    document.getElementById('cad-'+t).style.display = t===tab ? 'block' : 'none';
    document.getElementById('tab-'+t).classList.toggle('active', t===tab);
  });
  renderCadAtivo(tab);
}

function renderCadAtivo(tab) {
  if (tab === 'equip') renderCadEquip();
  if (tab === 'itens') renderCadItens();
  if (tab === 'setores') renderCadSetores();
}

// ── Equipamentos ──
function renderCadEquip() {
  const equips = allEquipamentos();
  document.getElementById('cad-equip-tbody').innerHTML = equips.length
    ? equips.map((e, i) => `
      <tr>
        <td style="color:var(--accent);font-size:.78rem;font-weight:700">${h(e.setor)}</td>
        <td style="font-weight:600">${h(e.nome)}</td>
        <td style="color:var(--muted);font-size:.78rem">${e.componentes.length} componente(s)</td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="editarEquipamento(${e.id})">Editar</button>
            <button class="btn btn-danger btn-sm" onclick="excluirEquipamento(${e.id})">Excluir</button>
          </div>
        </td>
      </tr>`)
    .join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:30px">Nenhum equipamento cadastrado.</td></tr>';
}

function openModal_cadEquip(edit=false) {
  // populate setor select
  const sel = document.getElementById('ce-setor');
  sel.innerHTML = allSetores().map(s => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('modal-cad-equip-title').textContent = edit ? 'Editar Equipamento' : 'Novo Equipamento';
  openModal('modal-cad-equip');
}

function editarEquipamento(id) {
  const e = STATE.equipamentos.find(e => e.id === id);
  document.getElementById('ce-edit-id').value = id;
  // populate setor select
  const sel = document.getElementById('ce-setor');
  sel.innerHTML = allSetores().map(s => `<option value="${s}" ${s===e.setor?'selected':''}>${s}</option>`).join('');
  document.getElementById('ce-nome').value = e.nome;
  document.getElementById('ce-comps').value = e.componentes.map(c => `${c.qty} × ${c.nome}`).join('\n');
  document.getElementById('modal-cad-equip-title').textContent = 'Editar Equipamento';
  openModal('modal-cad-equip');
}

async function salvarEquipamento() {
  const editIdRaw = document.getElementById('ce-edit-id').value;
  const setor = document.getElementById('ce-setor').value.trim();
  const nome = document.getElementById('ce-nome').value.trim();
  const compsRaw = document.getElementById('ce-comps').value.trim();
  if (!setor || !nome) { alert('Preencha setor e nome.'); return; }

  const componentes = compsRaw.split('\n').filter(l=>l.trim()).map(l => {
    const m = l.match(/^(\d+)\s*[x×]\s*(.+)/i);
    return m ? {qty: parseInt(m[1]), nome: m[2].trim()} : {qty:1, nome: l.trim()};
  });

  if (editIdRaw !== '') {
    const editId = parseInt(editIdRaw);
    const pos = STATE.equipamentos.findIndex(e => e.id === editId);
    const equip = STATE.equipamentos[pos];
    if (sb && equip && equip.id) {
      const { error } = await sb.from('equipamentos').update({setor,nome}).eq('id', equip.id);
      if (error) { showToast('Erro: '+error.message,true); return; }
    }
    STATE.equipamentos[pos] = { ...equip, setor, nome, componentes };
    showToast('Equipamento atualizado!');
  } else {
    const newEquip = { setor, nome, componentes };
    if (sb) {
      const { data: eq, error } = await sb.from('equipamentos').insert([{setor,nome}]).select().single();
      if (error) { showToast('Erro: '+error.message,true); return; }
      newEquip.id = eq.id; showToast('Equipamento salvo!');
    } else {
      newEquip.id = Date.now();
    }
    STATE.equipamentos.push(newEquip);
  }
  closeModal('modal-cad-equip');
  document.getElementById('ce-edit-id').value = '';
  document.getElementById('ce-nome').value = '';
  document.getElementById('ce-comps').value = '';
  renderCadEquip();
  renderEquipamentos();
}

async function excluirEquipamento(id) {
  if (!confirm('Excluir equipamento?')) return;
  const pos = STATE.equipamentos.findIndex(e => e.id === id);
  if (pos === -1) return;
  if (sb) {
    await sb.from('equipamentos').delete().eq('id', id);
  }
  STATE.equipamentos.splice(pos, 1);
  renderCadEquip();
  renderEquipamentos();
}

// ══════════════════════════════════════════
// MODAL — função única centralizada
// ══════════════════════════════════════════
function openModal(id) {
  // Preparar campos antes de abrir
  if (id === 'modal-os') {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('f-data').value = today;
    document.getElementById('f-hora').value = new Date().toTimeString().slice(0,5);
  }

  if (id === 'modal-cad-equip') {
    const idx = document.getElementById('ce-edit-id').value;
    if (!idx) {
      const sel = document.getElementById('ce-setor');
      sel.innerHTML = allSetores().map(s => `<option value="${s}">${s}</option>`).join('');
      document.getElementById('modal-cad-equip-title').textContent = 'Novo Equipamento';
      document.getElementById('ce-nome').value = '';
      document.getElementById('ce-comps').value = '';
    }
  }

  if (id === 'modal-prev') {
    document.getElementById('fp-edit-id').value = '';
    document.getElementById('modal-prev-title').textContent = 'Nova Manutenção Preventiva';
    ['fp-equip','fp-comp','fp-planejada','fp-realizada','fp-exec'].forEach(fid => {
      document.getElementById(fid).value = '';
    });
    document.getElementById('fp-trim').value = '1';
  }

  if (id === 'modal-plano') {
    document.getElementById('fpl-edit-id').value = '';
    document.getElementById('modal-plano-title').textContent = 'Novo Item de Plano de Manutenção';
    ['fpl-setor','fpl-equip','fpl-item','fpl-qty'].forEach(fid => {
      document.getElementById(fid).value = '';
    });
    document.getElementById('fpl-plano').value = 'LU';
    document.getElementById('fpl-period').value = '30 dias';
  }

  if (id === 'modal-cad-setor') {
    document.getElementById('cs-nome').value = '';
    document.getElementById('cs-edit-idx').value = '';
    document.getElementById('modal-cad-setor-title').textContent = 'Novo Setor';
  }

  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Fechar clicando fora do modal
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// ── Itens / Ferramentas ──
function renderCadItens() {
  const eletrica = allFerretasEletrica();
  const mecanica = allFerretasMecanica();

  document.getElementById('cad-eletrica-tbody').innerHTML = eletrica.map(f => `
    <tr>
      <td>${h(f.nome)}</td>
      <td style="font-family:var(--mono)">${f.qty}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="editarItem('eletrica',${f.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="excluirItem('eletrica',${f.id})">✕</button>
        </div>
      </td>
    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:20px">Nenhum item.</td></tr>';

  document.getElementById('cad-mecanica-tbody').innerHTML = mecanica.map(f => `
    <tr>
      <td>${h(f.nome)}</td>
      <td style="font-family:var(--mono)">${f.qty}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="editarItem('mecanica',${f.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="excluirItem('mecanica',${f.id})">✕</button>
        </div>
      </td>
    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:20px">Nenhum item.</td></tr>';
}

function openModalItem(tipo) {
  document.getElementById('ci-tipo').value = tipo;
  document.getElementById('ci-edit-id').value = '';
  document.getElementById('ci-nome').value = '';
  document.getElementById('ci-qty').value = '1';
  document.getElementById('modal-cad-item-title').textContent = 'Novo Item';
  openModal('modal-cad-item');
}

function editarItem(tipo, id) {
  const arr = tipo === 'eletrica' ? STATE.ferramentasEletrica : STATE.ferramentasMecanica;
  const item = arr.find(f => f.id === id);
  document.getElementById('ci-tipo').value = tipo;
  document.getElementById('ci-edit-id').value = id;
  document.getElementById('ci-nome').value = item.nome;
  document.getElementById('ci-qty').value = item.qty;
  document.getElementById('modal-cad-item-title').textContent = 'Editar Item';
  openModal('modal-cad-item');
}

async function salvarItem() {
  const tipo = document.getElementById('ci-tipo').value;
  const editIdRaw = document.getElementById('ci-edit-id').value;
  const nome = document.getElementById('ci-nome').value.trim();
  const qty = parseInt(document.getElementById('ci-qty').value) || 1;
  if (!nome) { alert('Informe o nome do item.'); return; }

  const arr = tipo === 'eletrica' ? STATE.ferramentasEletrica : STATE.ferramentasMecanica;
  if (editIdRaw !== '') {
    const editId = parseInt(editIdRaw);
    const pos = arr.findIndex(f => f.id === editId);
    const item = arr[pos];
    if (sb && item && item.id) {
      const { error } = await sb.from('ferramentas').update({nome, qty}).eq('id', item.id);
      if (error) { showToast('Erro: '+error.message,true); return; }
    }
    arr[pos] = { ...item, nome, qty };
    showToast('Item atualizado!');
  } else {
    const novoItem = {tipo, nome, qty, caixa: null, area: null};
    if (sb) {
      const { data: s, error } = await sb.from('ferramentas').insert([novoItem]).select().single();
      if (error) { showToast('Erro: '+error.message,true); return; }
      novoItem.id = s.id; showToast('Ferramenta salva!');
    } else {
      novoItem.id = Date.now();
    }
    arr.push(novoItem);
  }
  closeModal('modal-cad-item');
  document.getElementById('modal-cad-item-title').textContent = 'Novo Item';
  renderCadItens();
  renderFerramentas();
}

async function excluirItem(tipo, id) {
  if (!confirm('Excluir item?')) return;
  const arr = tipo === 'eletrica' ? STATE.ferramentasEletrica : STATE.ferramentasMecanica;
  const pos = arr.findIndex(f => f.id === id);
  if (pos === -1) return;
  if (sb) await sb.from('ferramentas').delete().eq('id', id);
  arr.splice(pos, 1);
  renderCadItens();
  renderFerramentas();
}

// ── Setores ──
const BASE_SETORES = ['EXTRAÇÃO','SECAGEM','CALDEIRA','ENSAQUE','OFICINA','POÇO'];

function isSetorExtra(s) {
  const fromEquip = allEquipamentos().map(e => e.setor.trim().toUpperCase());
  return !BASE_SETORES.includes(s) && !fromEquip.includes(s);
}

function renderCadSetores() {
  const setores = allSetores();
  const equips  = allEquipamentos();
  document.getElementById('cad-setores-tbody').innerHTML = setores.map(s => {
    const count   = equips.filter(e => e.setor.trim().toUpperCase() === s).length;
    const isExtra = isSetorExtra(s);
    return `<tr>
      <td style="font-weight:700">${setorIcon(s)} ${h(s)}</td>
      <td style="font-family:var(--mono);color:var(--muted)">${count}</td>
      <td>
        <div style="display:flex;gap:6px">
          ${isExtra
            ? `<button class="btn btn-secondary btn-sm" onclick="editarSetor('${s}')">Editar</button>
               <button class="btn btn-danger btn-sm" onclick="excluirSetor('${s}')">Excluir</button>`
            : '<span style="color:var(--muted);font-size:.75rem">padrão</span>'}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function editarSetor(nome) {
  document.getElementById('cs-edit-idx').value = nome;
  document.getElementById('cs-nome').value = nome;
  document.getElementById('modal-cad-setor-title').textContent = 'Editar Setor';
  document.getElementById('modal-cad-setor').classList.add('open');
}

async function salvarSetor() {
  const original = document.getElementById('cs-edit-idx').value;
  const nome = document.getElementById('cs-nome').value.trim().toUpperCase();
  if (!nome) { alert('Informe o nome do setor.'); return; }

  if (original) {
    // editar: renomear no Supabase e em STATE
    if (sb) {
      const { error } = await sb.from('setores').update({ nome }).eq('nome', original);
      if (error) { showToast('Erro: ' + error.message, true); return; }
    }
    const idx = STATE.setores.findIndex(s => s.toUpperCase() === original);
    if (idx !== -1) STATE.setores[idx] = nome;
    else if (!STATE.setores.includes(nome)) STATE.setores.push(nome);
  } else {
    // novo setor
    if (STATE.setores.map(s => s.toUpperCase()).includes(nome)) {
      showToast('Setor já existe.', true); return;
    }
    if (sb) {
      const { error } = await sb.from('setores').insert([{ nome }]);
      if (error) { showToast('Erro: ' + error.message, true); return; }
    }
    STATE.setores.push(nome);
  }
  showToast('Setor salvo!');
  closeModal('modal-cad-setor');
  document.getElementById('cs-nome').value = '';
  document.getElementById('cs-edit-idx').value = '';
  renderCadSetores();
  renderEquipamentos();
}

async function excluirSetor(nome) {
  if (!confirm(`Excluir setor "${nome}"?`)) return;
  if (sb) {
    const { error } = await sb.from('setores').delete().eq('nome', nome);
    if (error) { showToast('Erro: ' + error.message, true); return; }
  }
  STATE.setores = STATE.setores.filter(s => s.toUpperCase() !== nome);
  renderCadSetores();
  renderEquipamentos();
}



// ══════════════════════════════════════════
// CAIXAS DE FERRAMENTAS (Verde / Vermelha)
// ══════════════════════════════════════════
function renderCaixasFerramentas() {
  const container = document.getElementById('checklist-grid');
  if (!container) return;

  const caixas = {};
  STATE.caixasFerramentas.forEach(f => {
    if (!caixas[f.caixa]) caixas[f.caixa] = [];
    caixas[f.caixa].push(f);
  });

  const cores = { VERDE: '#34d399', VERMELHA: '#f87171' };

  const caixaHtml = Object.entries(caixas).map(([cor, items]) => `
    <div class="checklist-card" style="border-top:3px solid ${cores[cor]||'var(--border)'}">
      <div class="checklist-title">
        <span style="color:${cores[cor]||'var(--muted)'};font-weight:700">● Caixa ${cor}</span>
        <span style="color:var(--muted);font-size:.75rem">${items[0]?.area||''}</span>
      </div>
      <table style="width:100%;font-size:.8rem;border-collapse:collapse;">
        <thead>
          <tr style="color:var(--muted);font-size:.7rem">
            <th style="text-align:left;padding:4px 0">Item</th>
            <th style="text-align:center;padding:4px 0">Qtd</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(f => `
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:5px 0">${f.nome}</td>
              <td style="text-align:center;font-family:var(--mono)">${f.qty}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');

  // Inserir no topo do checklist-grid se não existir já
  let caixaDiv = document.getElementById('caixas-ferramentas-section');
  if (!caixaDiv) {
    caixaDiv = document.createElement('div');
    caixaDiv.id = 'caixas-ferramentas-section';
    caixaDiv.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:28px';
    container.parentNode.insertBefore(caixaDiv, container);
  }
  caixaDiv.innerHTML = `
    <div style="grid-column:1/-1;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-bottom:-4px">Inventário de Caixas</div>
    ${caixaHtml}`;
}

// ══════════════════════════════════════════
// LUBRIFICAÇÃO
// ══════════════════════════════════════════
function luFreqBadge(freq) {
  const f = (freq||'').toUpperCase();
  if (f.includes('SEMAN')) return '<span class="badge badge-blue">Semanal</span>';
  if (f.includes('QUINZ')) return '<span class="badge badge-yellow">Quinzenal</span>';
  if (f.includes('MENSAL') || f === 'MENSAL') return '<span class="badge badge-gray">Mensal</span>';
  if (f.includes('TRIM'))  return '<span class="badge badge-green">Trimestral</span>';
  return `<span class="badge badge-gray">${freq||'—'}</span>`;
}

function renderLubrificacao() {
  const setorFilter = document.getElementById('lu-setor-filter').value;
  const freqFilter  = document.getElementById('lu-freq-filter').value;
  const q = (document.getElementById('lu-search')?.value || '').toLowerCase();

  // Preencher opções de setor
  const setorEl = document.getElementById('lu-setor-filter');
  const setores = [...new Set(STATE.lubrificacao.map(l => l.setor))];
  if (setorEl.options.length <= 1) {
    setores.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      setorEl.appendChild(opt);
    });
  }

  const execucoes = allLuExecucoes();
  let items = allLubrificacao().filter(l => {
    const matchSetor = !setorFilter || l.setor === setorFilter;
    const matchFreq  = !freqFilter  || (l.frequencia||'').toUpperCase().includes(freqFilter.toUpperCase().replace('SEMANALMENTE','SEMAN').replace('SEMANAL','SEMAN'));
    const matchQ     = !q || l.equip.toLowerCase().includes(q) || l.item.toLowerCase().includes(q);
    return matchSetor && matchFreq && matchQ;
  });

  document.getElementById('lu-count-label').textContent = `${items.length} item(ns) de lubrificação`;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  luPage = Math.min(luPage, totalPages);
  const slice = items.slice((luPage-1)*PAGE_SIZE, luPage*PAGE_SIZE);

  document.getElementById('lu-tbody').innerHTML = slice.map((l,idx) => {
    const key = `${l.setor}||${l.equip}||${l.item}`;
    const execs = execucoes.filter(e => e.key === key).sort((a,b) => b.data.localeCompare(a.data));
    const ultima = execs[0];
    const hoje = new Date().toISOString().slice(0,10);

    let status = '<span class="badge badge-gray">Pendente</span>';
    if (ultima) {
      const diff = Math.floor((new Date(hoje) - new Date(ultima.data)) / 86400000);
      const limites = {semanal:7,semanalmente:7,quinzenal:15,mensal:30,trimestralmente:92};
      const f = (l.frequencia||'').toLowerCase().replace('semanal','semanal');
      const limite = limites[f] || 999;
      status = diff <= limite
        ? '<span class="badge badge-green">Em dia</span>'
        : '<span class="badge badge-red">Atrasado</span>';
    }

    return `<tr>
      <td><span style="font-size:.72rem;color:var(--muted)">${h(l.setor)}</span></td>
      <td style="font-weight:600">${h(l.equip)}</td>
      <td>${h(l.item)}</td>
      <td style="font-family:var(--mono);font-size:.78rem">${h(l.lubrificante)||'—'}</td>
      <td style="font-family:var(--mono);text-align:center">${l.bombadas||'—'}</td>
      <td>${luFreqBadge(l.frequencia)}</td>
      <td style="font-family:var(--mono);font-size:.78rem">${ultima ? h(ultima.data) + '<br><span style="color:var(--muted);font-size:.72rem">'+h(ultima.exec)+'</span>' : '—'}</td>
      <td>${status}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Nenhum item encontrado</td></tr>';

  renderPagination('lu-pag', totalPages, luPage, p => { luPage=p; renderLubrificacao(); });
}

function populateLuSetores() {
  const sel = document.getElementById('fle-setor');
  const setores = [...new Set(allLubrificacao().map(l => l.setor))];
  sel.innerHTML = '<option value="">Selecione…</option>' + setores.map(s => `<option>${s}</option>`).join('');
}

function populateLuEquip() {
  const setor = document.getElementById('fle-setor').value;
  const equips = [...new Set(allLubrificacao().filter(l => l.setor === setor).map(l => l.equip))];
  document.getElementById('fle-equip').innerHTML = '<option value="">Selecione…</option>' + equips.map(e => `<option>${e}</option>`).join('');
  document.getElementById('fle-item').innerHTML = '<option value="">Selecione…</option>';
}

function populateLuItem() {
  const setor = document.getElementById('fle-setor').value;
  const equip = document.getElementById('fle-equip').value;
  const items = allLubrificacao().filter(l => l.setor === setor && l.equip === equip).map(l => l.item);
  document.getElementById('fle-item').innerHTML = '<option value="">Selecione…</option>' + items.map(i => `<option>${i}</option>`).join('');
}

function openModalLuExec() {
  populateLuSetores();
  // Preencher executantes
  const execEl = document.getElementById('fle-exec');
  const colabs = allColaboradores();
  execEl.innerHTML = '<option value="">Selecione…</option>' + colabs.map(c => `<option>${c.nome}</option>`).join('');
  document.getElementById('fle-data').value = new Date().toISOString().slice(0,10);
  openModal('modal-lu-exec');
}

async function salvarLuExec() {
  const setor = document.getElementById('fle-setor').value;
  const equip = document.getElementById('fle-equip').value;
  const item  = document.getElementById('fle-item').value;
  const data  = document.getElementById('fle-data').value;
  const exec  = document.getElementById('fle-exec').value;
  if (!setor || !equip || !item || !data || !exec) {
    alert('Preencha todos os campos obrigatórios.'); return;
  }
  const obs = document.getElementById('fle-obs').value;
  const key = `${setor}||${equip}||${item}`;
  if (sb) {
    const { error } = await sb.from('lu_execucoes').insert([{ setor, equip, item, data, exec, obs }]);
    if (error) { showToast('Erro: ' + error.message, true); return; }
    showToast('Execução registrada!');
  }
  STATE.luExecucoes.unshift({ setor, equip, item, data, exec, obs, key });
  closeModal('modal-lu-exec');
  renderLubrificacao();
}

// ══════════════════════════════════════════
// COLABORADORES
// ══════════════════════════════════════════
function renderColaboradores() {
  const q = (document.getElementById('colab-search')?.value || '').toLowerCase();
  const colabs = allColaboradores().filter(c =>
    !q || c.nome.toLowerCase().includes(q) || c.funcao.toLowerCase().includes(q) || c.setor.toLowerCase().includes(q)
  );

  document.getElementById('colab-count-label').textContent = `${colabs.length} colaborador(es)`;

  document.getElementById('colab-tbody').innerHTML = colabs.map((c, i) => `
    <tr>
      <td style="font-family:var(--mono);color:var(--muted)">${String(i+1).padStart(3,'0')}</td>
      <td style="font-weight:700">${h(c.nome)}</td>
      <td>${h(c.funcao)}</td>
      <td>${h(c.setor)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="editarColaborador(${c.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="excluirColaborador(${c.id})">Excluir</button>
        </div>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">Nenhum colaborador cadastrado</td></tr>';
}

function openModalColaborador() {
  document.getElementById('fc-edit-id').value = '';
  document.getElementById('fc-nome').value = '';
  document.getElementById('fc-setor').value = '';
  document.querySelector('#modal-colaborador .modal-title').textContent = 'Novo Colaborador';
  openModal('modal-colaborador');
}

function editarColaborador(id) {
  const c = STATE.colaboradores.find(c => c.id === id);
  document.getElementById('fc-edit-id').value = id;
  document.getElementById('fc-nome').value = c.nome;
  document.getElementById('fc-funcao').value = c.funcao;
  document.getElementById('fc-setor').value = c.setor;
  document.querySelector('#modal-colaborador .modal-title').textContent = 'Editar Colaborador';
  openModal('modal-colaborador');
}

async function salvarColaborador() {
  const editIdRaw = document.getElementById('fc-edit-id').value;
  const nome   = document.getElementById('fc-nome').value.trim();
  const funcao = document.getElementById('fc-funcao').value;
  const setor  = document.getElementById('fc-setor').value.trim();
  if (!nome || !setor) { alert('Preencha nome e setor.'); return; }

  if (editIdRaw !== '') {
    const editId = parseInt(editIdRaw);
    const pos = STATE.colaboradores.findIndex(c => c.id === editId);
    const colab = STATE.colaboradores[pos];
    if (sb && colab && colab.id) {
      const { error } = await sb.from('colaboradores').update({nome, funcao, setor}).eq('id', colab.id);
      if (error) { showToast('Erro: ' + error.message, true); return; }
    }
    STATE.colaboradores[pos] = { ...colab, nome, funcao, setor };
    showToast('Colaborador atualizado!');
  } else {
    const novoColab = {nome, funcao, setor};
    if (sb) {
      const { data: saved, error } = await sb.from('colaboradores').insert([novoColab]).select().single();
      if (error) { showToast('Erro: ' + error.message, true); return; }
      novoColab.id = saved.id; showToast('Colaborador salvo!');
    } else { novoColab.id = Date.now(); }
    STATE.colaboradores.push(novoColab);
  }
  closeModal('modal-colaborador');
  document.getElementById('fc-edit-id').value = '';
  document.getElementById('fc-nome').value = '';
  document.getElementById('fc-setor').value = '';
  document.querySelector('#modal-colaborador .modal-title').textContent = 'Novo Colaborador';
  renderColaboradores();
}

async function excluirColaborador(id) {
  if (!confirm('Excluir colaborador?')) return;
  const pos = STATE.colaboradores.findIndex(c => c.id === id);
  if (pos === -1) return;
  if (sb) await sb.from('colaboradores').delete().eq('id', id);
  STATE.colaboradores.splice(pos, 1);
  renderColaboradores();
}

// ══════════════════════════════════════════
// PAGINAÇÃO HELPER
// ══════════════════════════════════════════
function renderPagination(containerId, totalPages, current, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  // Páginas a exibir: sempre 1, última, e current ±2
  const show = new Set([1, totalPages]);
  for (let i = Math.max(1, current - 2); i <= Math.min(totalPages, current + 2); i++) show.add(i);
  const sorted = [...show].sort((a, b) => a - b);

  let html = '';
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) html += '<span class="pag-ellipsis">…</span>';
    html += `<button class="pag-btn${p === current ? ' active' : ''}" onclick="(${onChange})(${p})">${p}</button>`;
    prev = p;
  }

  container.innerHTML =
    `<button class="pag-btn" ${current <= 1 ? 'disabled' : ''} onclick="(${onChange})(${current - 1})">‹</button>` +
    html +
    `<button class="pag-btn" ${current >= totalPages ? 'disabled' : ''} onclick="(${onChange})(${current + 1})">›</button>`;
}

// ══════════════════════════════════════════
// INDICADORES
// ══════════════════════════════════════════

// --- estado de período ---
let indPeriodo = 'mes'; // 'mes' | '3m' | '6m' | 'ano' | 'tudo'

const IND_PERIODOS = [
  { key: 'mes',  label: '30 dias'   },
  { key: '3m',   label: '3 meses'   },
  { key: '6m',   label: '6 meses'   },
  { key: 'ano',  label: '12 meses'  },
  { key: 'tudo', label: 'Tudo'      },
];

// Instâncias Chart.js para evitar duplicação
let _chartDisp = null, _chartMttr = null, _chartCustos = null;
let _chartParadasMensal = null, _chartParadasTipo = null,
    _chartParadasSetor  = null, _chartParadasTurno = null;

function setIndPeriodo(key) {
  indPeriodo = key;
  renderIndicadores();
}

function indDataCorte() {
  const hoje = new Date();
  if (indPeriodo === 'mes')  { const d = new Date(hoje); d.setDate(d.getDate() - 30);  return d; }
  if (indPeriodo === '3m')   { const d = new Date(hoje); d.setMonth(d.getMonth() - 3);  return d; }
  if (indPeriodo === '6m')   { const d = new Date(hoje); d.setMonth(d.getMonth() - 6);  return d; }
  if (indPeriodo === 'ano')  { const d = new Date(hoje); d.setFullYear(d.getFullYear() - 1); return d; }
  return new Date('2000-01-01');
}

function fmtR(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtH(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function dispBadge(pct) {
  if (pct >= 90) return ['ok',   'Boa'];
  if (pct >= 75) return ['warn', 'Regular'];
  return ['bad', 'Crítica'];
}
function mttrBadge(h) {
  if (h <= 2)  return ['ok',   '≤ 2h'];
  if (h <= 6)  return ['warn', '≤ 6h'];
  return ['bad', '> 6h'];
}
function mtbfBadge(h) {
  if (h >= 200) return ['ok',   '≥ 200h'];
  if (h >= 80)  return ['warn', '≥ 80h'];
  return ['bad', '< 80h'];
}

function renderIndicadores() {
  // ── Botões de período ──
  const bar = document.getElementById('ind-period-bar');
  if (!bar) return;
  bar.innerHTML = IND_PERIODOS.map(p =>
    `<button class="ind-period-btn${indPeriodo === p.key ? ' active' : ''}"
       onclick="setIndPeriodo('${p.key}')">${p.label}</button>`
  ).join('');

  const corte = indDataCorte();

  // ── Paradas no período ──
  const paradasPerio = STATE.paradas.filter(p => new Date(p.data + 'T00:00:00') >= corte);

  // Todas as paradas contam para Disponibilidade
  const horasParadas = paradasPerio.reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);

  // Somente Manutenção / Quebra contam para MTTR / MTBF
  const paradasManut = paradasPerio.filter(p => p.tipo === 'Manutenção / Quebra');
  const horasManut   = paradasManut.reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
  const nFalhas      = paradasManut.length;

  // ── Horas planejadas no período ──
  const prodPerio = STATE.producao.filter(p => {
    const d = new Date(p.ano, p.mes - 1, 1);
    return d >= corte;
  });
  const horasPlan = prodPerio.reduce((s, p) => s + parseFloat(p.horas_planejadas || 0), 0);

  // ── Métricas ──
  const horasOper = Math.max(0, horasPlan - horasParadas);
  const dispPct   = horasPlan > 0 ? (horasOper / horasPlan) * 100 : null;
  const mttr      = nFalhas > 0 ? horasManut / nFalhas : null;
  const mtbf      = nFalhas > 0 ? horasOper / nFalhas : null;

  const dEl = v => document.getElementById(v);

  // ── Disponibilidade ──
  if (dispPct !== null) {
    const [cls, lbl] = dispBadge(dispPct);
    dEl('disp-value').innerHTML = `${dispPct.toFixed(1)}<span>%</span>`;
    dEl('disp-badge').textContent = lbl;
    dEl('disp-badge').className = `kpi-badge ${cls}`;
    dEl('disp-gauge').style.width = Math.min(100, dispPct) + '%';
    dEl('disp-gauge').className = `gauge-fill ${cls}`;
  } else {
    dEl('disp-value').innerHTML = `—<span>%</span>`;
    dEl('disp-badge').textContent = 'Sem dados';
    dEl('disp-badge').className = 'kpi-badge warn';
    dEl('disp-gauge').style.width = '0%';
  }
  dEl('disp-hplan').textContent = horasPlan > 0 ? fmtH(horasPlan) + 'h' : '—';
  dEl('disp-hpara').textContent = fmtH(horasParadas) + 'h';
  dEl('disp-hoper').textContent = horasOper > 0 ? fmtH(horasOper) + 'h' : '—';

  // ── MTTR ──
  if (mttr !== null) {
    const [cls, lbl] = mttrBadge(mttr);
    dEl('mttr-value').innerHTML = `${fmtH(mttr)}<span>h</span>`;
    dEl('mttr-badge').textContent = lbl;
    dEl('mttr-badge').className = `kpi-badge ${cls}`;
  } else {
    dEl('mttr-value').innerHTML = `—<span>h</span>`;
    dEl('mttr-badge').textContent = 'Sem dados';
    dEl('mttr-badge').className = 'kpi-badge warn';
  }
  dEl('mttr-total').textContent  = fmtH(horasManut) + 'h';
  dEl('mttr-falhas').textContent = nFalhas;

  // ── MTBF ──
  if (mtbf !== null) {
    const [cls, lbl] = mtbfBadge(mtbf);
    dEl('mtbf-value').innerHTML = `${fmtH(mtbf)}<span>h</span>`;
    dEl('mtbf-badge').textContent = lbl;
    dEl('mtbf-badge').className = `kpi-badge ${cls}`;
  } else {
    dEl('mtbf-value').innerHTML = `—<span>h</span>`;
    dEl('mtbf-badge').textContent = 'Sem dados';
    dEl('mtbf-badge').className = 'kpi-badge warn';
  }
  dEl('mtbf-hoper').textContent  = horasOper > 0 ? fmtH(horasOper) + 'h' : '—';
  dEl('mtbf-falhas').textContent = nFalhas;

  // ── Gráficos mensais ──
  renderChartDisp();
  renderChartMttr();

  // ── Horas planejadas — tabela editável ──
  renderProducao();

  // ── Paradas — tabela, sub-totais e gráficos ──
  renderParadas(paradasPerio);
  renderChartParadasMensal();
  renderChartParadasTipo(paradasPerio);
  renderChartParadasSetor(paradasPerio);
  renderChartParadasTurno(paradasPerio);

  // ── Custos ──
  const custosPerio = STATE.custos.filter(c => new Date(c.data + 'T00:00:00') >= corte);
  renderCustos(custosPerio);
}

// ── Disponibilidade mensal ──
function renderChartDisp() {
  // Últimos 12 meses (independente do filtro de período)
  const hoje = new Date();
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) });
  }

  const valores = meses.map(m => {
    const prod = STATE.producao.find(p => p.ano === m.ano && p.mes === m.mes);
    if (!prod) return null;
    const hPlan = parseFloat(prod.horas_planejadas) || 0;
    if (hPlan === 0) return null;
    const ini = new Date(m.ano, m.mes - 1, 1);
    const fim = new Date(m.ano, m.mes, 1);
    // Usa STATE.paradas como fonte primária (todos os tipos contam para disponibilidade)
    const hPara = STATE.paradas
      .filter(p => { const d = new Date(p.data + 'T00:00:00'); return d >= ini && d < fim; })
      .reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
    return Math.min(100, ((hPlan - hPara) / hPlan) * 100);
  });

  const ctx = document.getElementById('chart-disp');
  if (!ctx) return;
  if (_chartDisp) { _chartDisp.destroy(); _chartDisp = null; }
  _chartDisp = new Chart(ctx, {
    type: 'line',
    data: {
      labels: meses.map(m => m.label),
      datasets: [{
        label: 'Disponibilidade (%)',
        data: valores,
        borderColor: '#34d399',
        backgroundColor: 'rgba(52,211,153,.1)',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        spanGaps: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,.07)' }, ticks: { color: '#7ca3c8', callback: v => v + '%' } },
        x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#7ca3c8' } },
      },
      plugins: { legend: { display: false } },
    }
  });
}

// ── MTTR/MTBF mensal ──
function renderChartMttr() {
  const hoje = new Date();
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) });
  }

  const mttrVals = [], mtbfVals = [];
  meses.forEach(m => {
    const prod  = STATE.producao.find(p => p.ano === m.ano && p.mes === m.mes);
    const hPlan = prod ? (parseFloat(prod.horas_planejadas) || 0) : 0;
    const ini = new Date(m.ano, m.mes - 1, 1);
    const fim = new Date(m.ano, m.mes, 1);
    // Somente paradas de Manutenção/Quebra alimentam MTTR/MTBF
    const paradasM = STATE.paradas.filter(p => {
      const d = new Date(p.data + 'T00:00:00');
      return d >= ini && d < fim && p.tipo === 'Manutenção / Quebra';
    });
    // Todas as paradas contam para horas operando (base do MTBF)
    const todasParadasM = STATE.paradas.filter(p => {
      const d = new Date(p.data + 'T00:00:00');
      return d >= ini && d < fim;
    });
    const hManut   = paradasM.reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
    const hTodasP  = todasParadasM.reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
    const hOper    = Math.max(0, hPlan - hTodasP);
    const nF       = paradasM.length;
    mttrVals.push(nF > 0 ? hManut / nF : null);
    mtbfVals.push(nF > 0 && hOper > 0 ? hOper / nF : null);
  });

  const ctx = document.getElementById('chart-mttr');
  if (!ctx) return;
  if (_chartMttr) { _chartMttr.destroy(); _chartMttr = null; }
  _chartMttr = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses.map(m => m.label),
      datasets: [
        { label: 'MTTR (h)', data: mttrVals, backgroundColor: 'rgba(248,113,113,.7)', borderRadius: 4, spanGaps: true },
        { label: 'MTBF (h)', data: mtbfVals, backgroundColor: 'rgba(96,165,250,.7)',  borderRadius: 4, spanGaps: true },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { grid: { color: 'rgba(255,255,255,.07)' }, ticks: { color: '#7ca3c8' } },
        x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#7ca3c8' } },
      },
      plugins: { legend: { labels: { color: '#7ca3c8', boxWidth: 12 } } },
    }
  });
}

// ── Custos ──
function renderCustos(custos) {
  const cats = ['Corretiva', 'Preventiva', 'Materiais', 'Terceiros', 'Outros'];
  const totCat = cat => custos.filter(c => c.categoria === cat).reduce((s, c) => s + parseFloat(c.valor || 0), 0);

  document.getElementById('custo-corretiva').textContent  = 'R$ ' + fmtR(totCat('Corretiva'));
  document.getElementById('custo-preventiva').textContent = 'R$ ' + fmtR(totCat('Preventiva'));
  document.getElementById('custo-materiais').textContent  = 'R$ ' + fmtR(totCat('Materiais'));

  // Gráfico de pizza
  const ctx = document.getElementById('chart-custos');
  if (ctx) {
    if (_chartCustos) { _chartCustos.destroy(); _chartCustos = null; }
    const totais = cats.map(c => totCat(c));
    _chartCustos = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: cats,
        datasets: [{
          data: totais,
          backgroundColor: ['rgba(248,113,113,.8)','rgba(52,211,153,.8)','rgba(96,165,250,.8)','rgba(251,191,36,.8)','rgba(167,139,250,.8)'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#7ca3c8', boxWidth: 12, font: { size: 11 } } },
        },
      }
    });
  }

  // Tabela de lançamentos
  const tbody = document.getElementById('custo-tbody');
  if (!tbody) return;
  if (custos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.2rem">Nenhum lançamento no período.</td></tr>`;
  } else {
    tbody.innerHTML = [...custos].sort((a, b) => b.data.localeCompare(a.data)).map(c => `
      <tr>
        <td>${c.data ? new Date(c.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
        <td>${h(c.categoria)}</td>
        <td>${h(c.descricao || '—')}</td>
        <td class="val-col">R$ ${fmtR(parseFloat(c.valor || 0))}</td>
        <td style="text-align:right;">
          <button class="btn btn-danger btn-sm" style="padding:.2rem .55rem;font-size:.7rem" onclick="excluirCusto(${c.id})">✕</button>
        </td>
      </tr>`).join('');
  }

  const total = custos.reduce((s, c) => s + parseFloat(c.valor || 0), 0);
  document.getElementById('custo-total-val').textContent = 'R$ ' + fmtR(total);
}

// ══════════════════════════════════════════
// GRÁFICOS DE PARADAS
// ══════════════════════════════════════════

const CHART_COLORS = {
  'Manutenção / Quebra':    'rgba(248,113,113,.8)',
  'Queda de Energia':       'rgba(251,191,36,.8)',
  'Falta de Matéria Prima': 'rgba(167,139,250,.8)',
  'Outro':                  'rgba(148,163,184,.8)',
};
const CHART_COLORS_TURNO = {
  '1° Turno':    'rgba(96,165,250,.8)',
  '2° Turno':    'rgba(52,211,153,.8)',
  'Revezamento': 'rgba(251,191,36,.8)',
};

// Paleta para setores (até 10)
const SETOR_PALETTE = [
  'rgba(96,165,250,.8)', 'rgba(52,211,153,.8)', 'rgba(248,113,113,.8)',
  'rgba(251,191,36,.8)', 'rgba(167,139,250,.8)', 'rgba(34,211,238,.8)',
  'rgba(249,115,22,.8)', 'rgba(236,72,153,.8)',  'rgba(16,185,129,.8)',
  'rgba(148,163,184,.8)',
];

const CHART_OPT_BASE = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#7ca3c8', boxWidth: 12, font: { size: 11 } } } },
};
const CHART_SCALE_BASE = {
  grid: { color: 'rgba(255,255,255,.07)' }, ticks: { color: '#7ca3c8' },
};

// ── 1. Evolução Mensal de Paradas (barras empilhadas por tipo) ──
function renderChartParadasMensal() {
  const hoje = new Date();
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({
      ano: d.getFullYear(), mes: d.getMonth() + 1,
      label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    });
  }

  const tipos = ['Manutenção / Quebra', 'Queda de Energia', 'Falta de Matéria Prima', 'Outro'];
  const datasets = tipos.map(tipo => ({
    label: tipo,
    data: meses.map(m => {
      const ini = new Date(m.ano, m.mes - 1, 1);
      const fim = new Date(m.ano, m.mes, 1);
      return STATE.paradas
        .filter(p => p.tipo === tipo && new Date(p.data + 'T00:00:00') >= ini && new Date(p.data + 'T00:00:00') < fim)
        .reduce((s, p) => s + (parseFloat(p.horas) || 0), 0) || null;
    }),
    backgroundColor: CHART_COLORS[tipo],
    borderRadius: 3,
    stack: 'paradas',
  }));

  const ctx = document.getElementById('chart-paradas-mensal');
  if (!ctx) return;
  if (_chartParadasMensal) { _chartParadasMensal.destroy(); _chartParadasMensal = null; }
  _chartParadasMensal = new Chart(ctx, {
    type: 'bar',
    data: { labels: meses.map(m => m.label), datasets },
    options: {
      ...CHART_OPT_BASE,
      scales: {
        x: { stacked: true, ...CHART_SCALE_BASE },
        y: { stacked: true, ...CHART_SCALE_BASE, ticks: { color: '#7ca3c8', callback: v => v + 'h' } },
      },
    },
  });
}

// ── 2. Paradas por Tipo (rosca) ──
function renderChartParadasTipo(paradas) {
  const tipos = ['Manutenção / Quebra', 'Queda de Energia', 'Falta de Matéria Prima', 'Outro'];
  const totais = tipos.map(t => paradas.filter(p => p.tipo === t).reduce((s, p) => s + (parseFloat(p.horas) || 0), 0));

  const ctx = document.getElementById('chart-paradas-tipo');
  if (!ctx) return;
  if (_chartParadasTipo) { _chartParadasTipo.destroy(); _chartParadasTipo = null; }
  _chartParadasTipo = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: tipos,
      datasets: [{ data: totais, backgroundColor: tipos.map(t => CHART_COLORS[t]), borderWidth: 0 }],
    },
    options: {
      ...CHART_OPT_BASE,
      plugins: { legend: { position: 'bottom', labels: { color: '#7ca3c8', boxWidth: 10, font: { size: 10 } } } },
    },
  });
}

// ── 3. Paradas por Setor (barras horizontais) ──
function renderChartParadasSetor(paradas) {
  const mapa = {};
  paradas.forEach(p => {
    const k = p.equipamento || 'Não informado';
    mapa[k] = (mapa[k] || 0) + (parseFloat(p.horas) || 0);
  });
  const entries = Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const labels = entries.map(e => e[0]);
  const data   = entries.map(e => e[1]);

  const ctx = document.getElementById('chart-paradas-setor');
  if (!ctx) return;
  if (_chartParadasSetor) { _chartParadasSetor.destroy(); _chartParadasSetor = null; }
  _chartParadasSetor = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Horas paradas', data, backgroundColor: labels.map((_, i) => SETOR_PALETTE[i % SETOR_PALETTE.length]), borderRadius: 4 }],
    },
    options: {
      ...CHART_OPT_BASE,
      indexAxis: 'y',
      scales: {
        x: { ...CHART_SCALE_BASE, ticks: { color: '#7ca3c8', callback: v => v + 'h' } },
        y: { ...CHART_SCALE_BASE },
      },
      plugins: { legend: { display: false } },
    },
  });
}

// ── 4. Paradas por Turno (rosca) ──
function renderChartParadasTurno(paradas) {
  const turnos = ['1° Turno', '2° Turno', 'Revezamento'];
  const semInfo = paradas.filter(p => !p.turno).reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
  const totais  = turnos.map(t => paradas.filter(p => p.turno === t).reduce((s, p) => s + (parseFloat(p.horas) || 0), 0));

  const labels = [...turnos];
  const data   = [...totais];
  const colors = turnos.map(t => CHART_COLORS_TURNO[t]);

  if (semInfo > 0) { labels.push('Não informado'); data.push(semInfo); colors.push('rgba(148,163,184,.5)'); }

  const ctx = document.getElementById('chart-paradas-turno');
  if (!ctx) return;
  if (_chartParadasTurno) { _chartParadasTurno.destroy(); _chartParadasTurno = null; }
  _chartParadasTurno = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      ...CHART_OPT_BASE,
      plugins: { legend: { position: 'bottom', labels: { color: '#7ca3c8', boxWidth: 10, font: { size: 10 } } } },
    },
  });
}

// ── Tabela de Paradas ──
function paradaTipoCls(tipo) {
  if (tipo === 'Manutenção / Quebra')    return 'ptipo ptipo-manut';
  if (tipo === 'Queda de Energia')       return 'ptipo ptipo-energia';
  if (tipo === 'Falta de Matéria Prima') return 'ptipo ptipo-materia';
  return 'ptipo ptipo-outro';
}

function renderParadas(paradas) {
  const dEl = v => document.getElementById(v);
  const hTotal   = paradas.reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
  const hManut   = paradas.filter(p => p.tipo === 'Manutenção / Quebra')   .reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
  const hEnergia = paradas.filter(p => p.tipo === 'Queda de Energia')      .reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
  const hMateria = paradas.filter(p => p.tipo === 'Falta de Matéria Prima').reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);

  dEl('parada-total-h').textContent   = fmtH(hTotal) + 'h';
  dEl('parada-manut-h').textContent   = fmtH(hManut) + 'h';
  dEl('parada-energia-h').textContent = fmtH(hEnergia) + 'h';
  dEl('parada-materia-h').textContent = fmtH(hMateria) + 'h';
  dEl('parada-total-footer').textContent = fmtH(hTotal) + ' h';

  const tbody = dEl('parada-tbody');
  if (!tbody) return;
  if (paradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.2rem">Nenhuma parada registrada no período.</td></tr>`;
    return;
  }
  tbody.innerHTML = [...paradas].sort((a, b) => b.data.localeCompare(a.data)).map(p => `
    <tr>
      <td>${p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td><span class="${paradaTipoCls(p.tipo)}">${h(p.tipo)}</span></td>
      <td>${h(p.equipamento || '—')}</td>
      <td>${h(p.turno || '—')}</td>
      <td>${h(p.motivo || '—')}</td>
      <td class="val-col">${fmtH(parseFloat(p.horas) || 0)} h</td>
      <td style="text-align:right;">
        <button class="btn btn-secondary btn-sm" style="padding:.2rem .55rem;font-size:.7rem;margin-right:.2rem" onclick="editarParada(${p.id})">✎</button>
        <button class="btn btn-danger btn-sm" style="padding:.2rem .55rem;font-size:.7rem" onclick="excluirParada(${p.id})">✕</button>
      </td>
    </tr>`).join('');
}

// ── Abrir modal Parada (novo) ──
function abrirModalParada() {
  document.getElementById('parada-edit-id').value     = '';
  document.getElementById('parada-data').value        = new Date().toISOString().split('T')[0];
  document.getElementById('parada-tipo').value        = 'Manutenção / Quebra';
  document.getElementById('parada-hora-ini').value    = '';
  document.getElementById('parada-hora-fim').value    = '';
  document.getElementById('parada-horas').value       = '';
  document.getElementById('parada-motivo').value      = '';
  document.getElementById('parada-equipamento').value = '';
  document.getElementById('parada-turno').value       = '';
  document.getElementById('parada-os-id').value       = '';
  document.getElementById('modal-parada-title').textContent = 'Registrar Parada de Fábrica';
  openModal('modal-parada');
}

// ── Editar Parada existente ──
function editarParada(id) {
  const p = STATE.paradas.find(x => x.id === id);
  if (!p) return;
  document.getElementById('parada-edit-id').value     = id;
  document.getElementById('parada-data').value        = p.data || '';
  document.getElementById('parada-tipo').value        = p.tipo || 'Manutenção / Quebra';
  document.getElementById('parada-hora-ini').value    = p.hora_inicio || '';
  document.getElementById('parada-hora-fim').value    = p.hora_fim    || '';
  document.getElementById('parada-horas').value       = p.horas != null ? p.horas : '';
  document.getElementById('parada-motivo').value      = p.motivo       || '';
  document.getElementById('parada-equipamento').value = p.equipamento  || '';
  document.getElementById('parada-turno').value       = p.turno        || '';
  document.getElementById('parada-os-id').value       = p.os_id != null ? p.os_id : '';
  document.getElementById('modal-parada-title').textContent = 'Editar Parada';
  openModal('modal-parada');
}

// ── Calcular horas automaticamente ao preencher hora início/fim ──
function calcHorasParada() {
  const ini = document.getElementById('parada-hora-ini').value;
  const fim = document.getElementById('parada-hora-fim').value;
  if (!ini || !fim) return;
  const [hI, mI] = ini.split(':').map(Number);
  const [hF, mF] = fim.split(':').map(Number);
  let diff = (hF * 60 + mF) - (hI * 60 + mI);
  if (diff < 0) diff += 24 * 60; // passa da meia-noite
  if (diff > 0) document.getElementById('parada-horas').value = (diff / 60).toFixed(1);
}

// ── Salvar Parada ──
async function salvarParada() {
  const editId     = document.getElementById('parada-edit-id').value;
  const data       = document.getElementById('parada-data').value;
  const tipo       = document.getElementById('parada-tipo').value;
  const hora_inicio= document.getElementById('parada-hora-ini').value || null;
  const hora_fim   = document.getElementById('parada-hora-fim').value || null;
  const horasRaw   = document.getElementById('parada-horas').value;
  const horas      = parseFloat(horasRaw);
  const motivo      = document.getElementById('parada-motivo').value.trim() || null;
  const equipamento = document.getElementById('parada-equipamento').value || null;
  const turno       = document.getElementById('parada-turno').value || null;
  const osIdRaw     = document.getElementById('parada-os-id').value;
  const os_id       = osIdRaw !== '' ? parseInt(osIdRaw) : null;

  if (!data || !tipo || isNaN(horas) || horas <= 0) {
    showToast('Preencha data, tipo e duração da parada.', true); return;
  }

  const payload = { data, tipo, hora_inicio, hora_fim, horas, motivo, equipamento, turno, os_id };

  if (sb) {
    if (editId) {
      const { error } = await sb.from('paradas').update(payload).eq('id', parseInt(editId));
      if (error) { showToast('Erro: ' + error.message, true); return; }
      const idx = STATE.paradas.findIndex(p => p.id === parseInt(editId));
      if (idx !== -1) STATE.paradas[idx] = { ...STATE.paradas[idx], ...payload, horas: parseFloat(payload.horas) || 0 };
    } else {
      const { data: saved, error } = await sb.from('paradas').insert([payload]).select().single();
      if (error) { showToast('Erro: ' + error.message, true); return; }
      // saved pode vir null se RLS bloquear o select — usar payload como fallback
      const row = saved ?? payload;
      STATE.paradas.unshift({ ...row, horas: parseFloat(row.horas) || 0 });
    }
  } else {
    if (editId) {
      const idx = STATE.paradas.findIndex(p => p.id === parseInt(editId));
      if (idx !== -1) STATE.paradas[idx] = { ...STATE.paradas[idx], ...payload };
    } else {
      STATE.paradas.unshift({ id: Date.now(), ...payload });
    }
  }

  showToast(editId ? 'Parada atualizada!' : 'Parada registrada!');
  closeModal('modal-parada');
  renderIndicadores();
}

// ── Excluir Parada ──
async function excluirParada(id) {
  if (!confirm('Excluir este registro de parada?')) return;
  if (sb) {
    const { error } = await sb.from('paradas').delete().eq('id', id);
    if (error) { showToast('Erro: ' + error.message, true); return; }
  }
  STATE.paradas = STATE.paradas.filter(p => p.id !== id);
  showToast('Parada excluída.');
  renderIndicadores();
}

// ── Tabela de Horas Planejadas (Produção) ──
const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function renderProducao() {
  const tbody = document.getElementById('producao-tbody');
  if (!tbody) return;
  const sorted = [...STATE.producao].sort((a, b) =>
    b.ano !== a.ano ? b.ano - a.ano : b.mes - a.mes
  );
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1.2rem">Nenhum mês cadastrado ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = sorted.map(p => `
    <tr>
      <td>${MESES_NOME[(p.mes || 1) - 1]} / ${p.ano}</td>
      <td class="val-col">${fmtH(parseFloat(p.horas_planejadas || 0))} h</td>
      <td>${h(p.observacao || '—')}</td>
      <td style="text-align:right;">
        <button class="btn btn-secondary btn-sm" style="padding:.2rem .55rem;font-size:.7rem;margin-right:.25rem"
          onclick="editarProducao(${p.id})">✎</button>
        <button class="btn btn-danger btn-sm" style="padding:.2rem .55rem;font-size:.7rem"
          onclick="excluirProducao(${p.id})">✕</button>
      </td>
    </tr>`).join('');
}

function editarProducao(id) {
  const p = STATE.producao.find(x => x.id === id);
  if (!p) return;
  document.getElementById('prod-edit-id').value  = id;
  document.getElementById('prod-mes').value      = p.mes;
  document.getElementById('prod-ano').value      = p.ano;
  document.getElementById('prod-horas').value    = p.horas_planejadas;
  document.getElementById('prod-obs').value      = p.observacao || '';
  document.getElementById('modal-prod-title').textContent = 'Editar Horas Planejadas';
  openModal('modal-producao');
}

async function excluirProducao(id) {
  if (!confirm('Excluir este registro de horas planejadas?')) return;
  if (sb) {
    const { error } = await sb.from('producao').delete().eq('id', id);
    if (error) { showToast('Erro: ' + error.message, true); return; }
  }
  STATE.producao = STATE.producao.filter(p => p.id !== id);
  showToast('Registro excluído.');
  renderIndicadores();
}

// ── Abrir modal Produção (horas planejadas) com data dinâmica ──
function abrirModalProducao() {
  const now = new Date();
  document.getElementById('prod-edit-id').value  = '';
  document.getElementById('prod-mes').value      = now.getMonth() + 1;
  document.getElementById('prod-ano').value      = now.getFullYear();
  document.getElementById('prod-horas').value    = '';
  document.getElementById('prod-obs').value      = '';
  document.getElementById('modal-prod-title').textContent = 'Horas Planejadas';
  openModal('modal-producao');
}

// ── Salvar Produção (horas planejadas) ──
async function salvarProducao() {
  const editId = document.getElementById('prod-edit-id').value;
  const mes    = parseInt(document.getElementById('prod-mes').value);
  const ano    = parseInt(document.getElementById('prod-ano').value);
  const horas  = parseFloat(document.getElementById('prod-horas').value);
  const obs    = document.getElementById('prod-obs').value.trim() || null;

  if (!mes || !ano || isNaN(horas) || horas <= 0) {
    showToast('Preencha mês, ano e horas planejadas.', true); return;
  }

  const payload = { mes, ano, horas_planejadas: horas, observacao: obs };

  if (sb) {
    if (editId) {
      const { error } = await sb.from('producao').update(payload).eq('id', parseInt(editId));
      if (error) { showToast('Erro: ' + error.message, true); return; }
      const idx = STATE.producao.findIndex(p => p.id === parseInt(editId));
      if (idx !== -1) STATE.producao[idx] = { ...STATE.producao[idx], ...payload };
    } else {
      // upsert: se mes/ano já existe, atualiza; caso contrário, insere
      const { data: saved, error } = await sb.from('producao')
        .upsert([payload], { onConflict: 'mes,ano' })
        .select().single();
      if (error) { showToast('Erro: ' + error.message, true); return; }
      const row = saved ?? { id: Date.now(), ...payload };
      const existing = STATE.producao.findIndex(p => p.mes === mes && p.ano === ano);
      if (existing !== -1) STATE.producao[existing] = { ...STATE.producao[existing], ...row };
      else STATE.producao.push(row);
    }
  } else {
    // demo mode
    if (editId) {
      const idx = STATE.producao.findIndex(p => p.id === parseInt(editId));
      if (idx !== -1) STATE.producao[idx] = { ...STATE.producao[idx], ...payload };
    } else {
      const existing = STATE.producao.findIndex(p => p.mes === mes && p.ano === ano);
      if (existing !== -1) STATE.producao[existing] = { ...STATE.producao[existing], ...payload };
      else STATE.producao.push({ id: Date.now(), ...payload });
    }
  }

  showToast('Horas planejadas salvas!');
  closeModal('modal-producao');
  renderIndicadores();
}

// ── Abrir modal custo (novo) ──
function abrirModalCusto() {
  document.getElementById('custo-edit-id').value = '';
  document.getElementById('custo-data').value = new Date().toISOString().split('T')[0];
  document.getElementById('custo-categoria').value = 'Corretiva';
  document.getElementById('custo-descricao').value = '';
  document.getElementById('custo-valor').value = '';
  document.getElementById('custo-os-id').value = '';
  document.getElementById('modal-custo-title').textContent = 'Lançar Custo';
  openModal('modal-custo');
}

// ── Salvar Custo ──
async function salvarCusto() {
  const editId    = document.getElementById('custo-edit-id').value;
  const data      = document.getElementById('custo-data').value;
  const categoria = document.getElementById('custo-categoria').value;
  const descricao = document.getElementById('custo-descricao').value.trim() || null;
  const valorRaw  = document.getElementById('custo-valor').value;
  const valor     = parseFloat(valorRaw);
  const osIdRaw   = document.getElementById('custo-os-id').value;
  const os_id     = osIdRaw !== '' ? parseInt(osIdRaw) : null;

  if (!data || !categoria || isNaN(valor) || valor <= 0) {
    showToast('Preencha data, categoria e valor.', true); return;
  }

  const payload = { data, categoria, descricao, valor, os_id };

  if (sb) {
    if (editId) {
      const { error } = await sb.from('custos').update(payload).eq('id', parseInt(editId));
      if (error) { showToast('Erro: ' + error.message, true); return; }
      const idx = STATE.custos.findIndex(c => c.id === parseInt(editId));
      if (idx !== -1) STATE.custos[idx] = { ...STATE.custos[idx], ...payload };
    } else {
      const { data: saved, error } = await sb.from('custos').insert([payload]).select().single();
      if (error) { showToast('Erro: ' + error.message, true); return; }
      STATE.custos.unshift(saved);
    }
  } else {
    if (editId) {
      const idx = STATE.custos.findIndex(c => c.id === parseInt(editId));
      if (idx !== -1) STATE.custos[idx] = { ...STATE.custos[idx], ...payload };
    } else {
      STATE.custos.unshift({ id: Date.now(), ...payload });
    }
  }

  showToast('Custo lançado!');
  closeModal('modal-custo');
  renderIndicadores();
}

// ── Excluir Custo ──
async function excluirCusto(id) {
  if (!confirm('Excluir este lançamento de custo?')) return;
  if (sb) {
    const { error } = await sb.from('custos').delete().eq('id', id);
    if (error) { showToast('Erro: ' + error.message, true); return; }
  }
  STATE.custos = STATE.custos.filter(c => c.id !== id);
  showToast('Custo excluído.');
  renderIndicadores();
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
(async () => {
  try {
    await loadAll();
    renderDashboard();
  } catch (err) {
    console.error('Erro fatal na inicialização:', err);
    setLoadingMsg('Erro ao iniciar: ' + err.message);
    setTimeout(hideLoading, 4000);
  }
})();
