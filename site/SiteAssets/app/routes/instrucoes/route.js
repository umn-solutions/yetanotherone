import {
  Text,
  Container,
  Button,
  AccordionGroup,
  AccordionItem,
  TabGroup,
  View,
  TextInput,
  FormField,
  defineRoute,
  Router,
} from '../../libs/nofbiz/nofbiz.base.js';

import { openNewInitiativeModal } from '../../utils/new-initiative.js';
import { createPageLayout } from '../../utils/navbar.js';
import { STATUS, statusLabel, chipClass } from '../../utils/status-helpers.js';

export default defineRoute((config) => {
  config.setRouteTitle('Instruções');

  // -- Helpers (scoped inside defineRoute) --

  const buildProfileCard = (initial, title, subtitle, responsibilities, colorClass) => {
    const respItems = responsibilities.map((r) =>
      new Text(r, { type: 'p', class: 'pace-profile-resp' })
    );
    return new Container([
      new Container([new Text(initial, { type: 'span' })], { class: `pace-profile-avatar ${colorClass}` }),
      new Text(title, { type: 'h3', class: 'pace-profile-name' }),
      new Text(subtitle, { type: 'p', class: 'pace-profile-role' }),
      new Container(respItems, { class: 'pace-profile-resp-list' }),
    ], { class: 'pace-profile-card' });
  };

  const buildNumberedSteps = (steps) => {
    const items = steps.map((step, i) =>
      new Container([
        new Text(String(i + 1), { type: 'span', class: 'pace-step-num' }),
        new Text(step, { type: 'span', class: 'pace-step-text' }),
      ], { class: 'pace-step-item' })
    );
    return new Container(items, { class: 'pace-steps-list' });
  };

  const buildLegendRow = (statusValue, description) =>
    new Container([
      new Text(statusLabel(statusValue), { type: 'span', class: `pace-chip ${chipClass(statusValue)}` }),
      new Text(description, { type: 'span', class: 'pace-step-text' }),
    ], { class: 'pace-step-item' });

  // -- SECTION 1: CTA Banner --
  const ctaBanner = new Container([
    new Container([
      new Text('Como funciona o Place', { type: 'h2' }),
      new Text('Conheça os perfis, as acções disponíveis e o ciclo de vida completo de uma iniciativa PDCA — do rascunho à implementação validada.', { type: 'p' }),
    ]),
    new Button('Submeter Agora', {
      variant: 'primary',
      onClickHandler: () => {
        openNewInitiativeModal(() => {
          Router.navigateTo('pessoal');
        });
      },
    }),
  ], { class: 'pace-cta' });

  // -- SECTION 2: Perfis e Responsabilidades --
  const profileCards = new Container([
    new Text('Perfis e Responsabilidades', { type: 'h2', class: 'pace-sec-title' }),
    new Text('Os perfis são atribuídos automaticamente com base na posição de cada pessoa na organização. Não é preciso pedir acesso.', { type: 'p' }),
    new Container([
      buildProfileCard('C', 'Colaborador', 'Quem cria e conduz a iniciativa', [
        'Cria e submete iniciativas de melhoria',
        'Guarda rascunhos e edita antes de submeter',
        'Declara o início da execução e os savings obtidos',
        'Cancela ou transfere as suas iniciativas',
        'Partilha acesso e comenta com colegas',
      ], 'pace-profile--green'),
      buildProfileCard('M', 'Mentor', 'Quem valida o projecto e os savings', [
        'Valida os projectos submetidos',
        'Confirma os savings declarados e encaminha ao gestor',
        'Solicita revisão ou rejeita quando necessário',
        'Acompanha todas as iniciativas da organização',
        'A equipa de mentoria faz a validação final da implementação',
      ], 'pace-profile--dark-green'),
      buildProfileCard('G', 'Gestor', 'Quem aprova os savings declarados', [
        'Aprova os savings validados pelo mentor',
        'Solicita revisão ou rejeita savings incorrectos',
        'Pode transferir a validação para outro gestor',
        'Acompanha as iniciativas da sua área',
        'Iniciativas de maior valor seguem para um gestor executivo',
      ], 'pace-profile--darker-green'),
    ], { class: 'pace-profile-grid' }),
  ]);

  // -- SECTION 3: Guia de Acções --

  // DRY actions dictionary — each action defined exactly once
  const actions = {
    submeter: {
      title: 'Submeter uma iniciativa',
      steps: [
        'Clicar em "+ Partilhar uma iniciativa" no topo da página (ou "Submeter Agora" aqui nas Instruções).',
        'Descrever o problema identificado e a iniciativa de melhoria.',
        'Seleccionar a equipa impactada e as etiquetas (tags).',
        'Escolher as categorias de savings e preencher os dados financeiros (valores actuais e previstos).',
        'Rever e clicar em "Submeter" para enviar para validação do mentor.',
      ],
      tip: 'Pode guardar como rascunho e voltar a completar mais tarde. Marque como confidencial se a iniciativa for sensível.',
    },
    rascunho: {
      title: 'Guardar e editar um rascunho',
      steps: [
        'Aceder ao ecrã "Pessoal" e abrir o separador "Rascunhos".',
        'Clicar no rascunho pretendido para o editar.',
        'Actualizar os campos necessários.',
        'Guardar novamente como rascunho ou submeter directamente.',
      ],
      tip: 'Os rascunhos só são visíveis para si — mentores e gestores só os vêem depois de submetidos.',
    },
    execucao: {
      title: 'Declarar o início da execução',
      steps: [
        'Depois de o mentor validar o projecto (estado "Validado Mentor"), abrir o detalhe da iniciativa.',
        'Clicar em "Declarar Início Execução".',
        'Indicar a data prevista de conclusão.',
        'A iniciativa passa ao estado "Em Execução".',
      ],
      tip: 'A partir desta etapa os campos base (título, descrição, equipa) ficam bloqueados.',
    },
    solicitarValidacao: {
      title: 'Solicitar validação dos savings',
      steps: [
        'Quando a execução estiver concluída, abrir o detalhe da iniciativa "Em Execução".',
        'Confirmar que os dados financeiros estão completos e correctos.',
        'Clicar em "Solicitar Validação".',
        'A iniciativa segue para a validação de savings pelo mentor.',
      ],
      tip: 'Garanta que todos os campos de cada categoria de savings estão preenchidos antes de enviar.',
    },
    rever: {
      title: 'Rever e re-submeter',
      steps: [
        'Se um validador solicitar revisão, a iniciativa fica "Em Revisão" e recebe uma notificação.',
        'Ler os comentários da revisão no detalhe da iniciativa.',
        'Clicar em "Rever" para editar e fazer as alterações pedidas.',
        'Clicar em "Re-submeter" para enviar novamente para validação.',
      ],
      tip: 'A justificação da revisão fica registada no histórico da iniciativa para referência.',
    },
    cancelar: {
      title: 'Cancelar uma iniciativa',
      steps: [
        'Abrir o detalhe de uma iniciativa própria que não esteja num estado final.',
        'Clicar em "Cancelar" nas acções disponíveis.',
        'Confirmar o cancelamento na janela de diálogo.',
      ],
      tip: 'Iniciativas implementadas, rejeitadas ou já canceladas não podem ser canceladas.',
    },
    transferir: {
      title: 'Transferir uma iniciativa',
      steps: [
        'Abrir o detalhe da iniciativa própria.',
        'Clicar em "Transferir" no menu de acções.',
        'Seleccionar o novo responsável com o seleccionador de pessoas.',
        'Confirmar a transferência.',
        'A iniciativa passa a aparecer no ecrã "Pessoal" do novo responsável.',
      ],
      tip: 'O estado da iniciativa mantém-se; apenas muda o responsável.',
    },
    gerirAcesso: {
      title: 'Partilhar acesso (Gerir Acesso)',
      steps: [
        'Abrir o detalhe da iniciativa.',
        'Clicar em "Gerir Acesso".',
        'Adicionar pessoas com acesso de Leitura ou de Colaboração.',
        'Remover acessos quando deixarem de ser necessários.',
      ],
      tip: 'Colaboração permite ver, comentar e editar; Leitura permite apenas consultar. As iniciativas partilhadas aparecem no separador "Colaborações Recebidas".',
    },
    comentar: {
      title: 'Comentar uma iniciativa',
      steps: [
        'Abrir o detalhe de qualquer iniciativa a que tenha acesso.',
        'Ir até à secção "Comentários".',
        'Escrever o comentário e clicar em "Comentar".',
        'O responsável e o mentor da iniciativa são notificados.',
      ],
      tip: 'Os comentários ficam visíveis para todas as pessoas com acesso à iniciativa.',
    },
    validarProjecto: {
      title: 'Validar um projecto',
      steps: [
        'No ecrã "Mentoria", ver a coluna "Validação de Projecto".',
        'Abrir a iniciativa submetida para consultar os detalhes.',
        'Avaliar se o projecto está bem formulado e alinhado.',
        'Clicar em "Aprovar", "Solicitar Revisão" ou "Rejeitar".',
      ],
      tip: 'Solicitar revisão e rejeitar exigem sempre um comentário a justificar.',
    },
    validarSavings: {
      title: 'Validar savings',
      steps: [
        'No ecrã "Mentoria", ver a coluna "Validação de Savings".',
        'Abrir a iniciativa em "Em Validação pelo Mentor".',
        'Confirmar que os dados financeiros de cada categoria estão completos.',
        'Clicar em "Validar Savings".',
        'A iniciativa é encaminhada automaticamente para o gestor certo.',
      ],
      tip: 'Iniciativas de maior valor ou de tipo Hard Cost seguem para um gestor executivo.',
    },
    confirmarImplementacao: {
      title: 'Confirmar a implementação',
      steps: [
        'A validação final é feita pela equipa de mentoria (Mentor Manager).',
        'No ecrã "Mentoria", ver a coluna "Confirmação de Implementação".',
        'Abrir a iniciativa em "Em Validação pelo Mentor Manager".',
        'Confirmar a data de implementação e clicar em "Validar Implementação".',
        'A iniciativa passa ao estado "Implementado".',
      ],
      tip: 'Esta é a última etapa. A iniciativa recebe um selo de validação (equipa de mentoria ou área financeira).',
    },
    aprovarSavings: {
      title: 'Aprovar savings',
      steps: [
        'No ecrã "Gestor", ver a secção "Savings Por Validar".',
        'Abrir a iniciativa em "Em Validação pelo Gestor".',
        'Confirmar se os valores declarados estão correctos e justificados.',
        'Clicar em "Aprovar Savings".',
        'Segue para a validação final da equipa de mentoria.',
      ],
      tip: 'Se os valores não estiverem correctos, pode solicitar revisão ou rejeitar.',
    },
    transferirGestor: {
      title: 'Transferir para outro gestor',
      steps: [
        'Na iniciativa "Em Validação pelo Gestor", clicar em "Transferir".',
        'Seleccionar outro gestor.',
        'Confirmar. O novo gestor é notificado.',
      ],
      tip: 'O estado mantém-se; apenas muda quem valida os savings.',
    },
    solicitarRevisao: {
      title: 'Solicitar revisão',
      steps: [
        'Em qualquer etapa de validação, abrir a iniciativa.',
        'Clicar em "Solicitar Revisão".',
        'Escrever com clareza as alterações necessárias.',
        'A iniciativa volta a "Em Revisão" e o responsável é notificado.',
      ],
      tip: 'Seja específico para facilitar a correcção por parte do colaborador.',
    },
    rejeitar: {
      title: 'Rejeitar uma iniciativa',
      steps: [
        'Abrir a iniciativa em validação.',
        'Clicar em "Rejeitar".',
        'Indicar o motivo da rejeição.',
        'A iniciativa fica no estado final "Rejeitado".',
      ],
      tip: 'A rejeição é definitiva. Se a iniciativa for recuperável, use antes "Solicitar Revisão".',
    },
    replicar: {
      title: 'Replicar uma iniciativa',
      steps: [
        'No "Catálogo", abrir uma iniciativa implementada.',
        'Clicar em "Replicar".',
        'Os dados são pré-preenchidos numa nova iniciativa.',
        'Ajustar o necessário e submeter.',
      ],
      tip: 'Útil para aplicar uma melhoria bem-sucedida a outra equipa.',
    },
  };

  const buildActionCard = (action) =>
    new Container([
      new Text(action.title, { type: 'h3', class: 'pace-action-card-title' }),
      buildNumberedSteps(action.steps),
      new Container([
        new Text('Dica: ' + action.tip, { type: 'p', class: 'pace-guide-tip' }),
      ], { class: 'pace-guide-tip-box' }),
    ], { class: 'pace-action-card' });

  const buildTabView = (ids) =>
    new View(ids.map((id) => buildActionCard(actions[id])), { showOnRender: true });

  const colaboradorView = buildTabView(['submeter', 'rascunho', 'execucao', 'solicitarValidacao', 'rever', 'cancelar', 'transferir']);
  const mentorView = buildTabView(['validarProjecto', 'validarSavings', 'confirmarImplementacao', 'solicitarRevisao', 'rejeitar']);
  const gestorView = buildTabView(['aprovarSavings', 'transferirGestor', 'solicitarRevisao', 'rejeitar']);
  const todosView = buildTabView(['gerirAcesso', 'comentar', 'replicar']);

  const actionGuides = new Container([
    new Text('Guia de Acções', { type: 'h2', class: 'pace-sec-title' }),
    new Text('Escolha o seu perfil para ver as acções disponíveis.', { type: 'p' }),
    new TabGroup([
      { key: 'colaborador', label: 'Colaborador', view: colaboradorView },
      { key: 'mentor', label: 'Mentor', view: mentorView },
      { key: 'gestor', label: 'Gestor', view: gestorView },
      { key: 'todos', label: 'Todos os perfis', view: todosView },
    ], {
      selectedTabKey: 'colaborador',
      // Re-run the page search after a tab swap so matches in the newly
      // visible view get highlighted (hidden views are skipped, like browser find).
      onTabChangeHandler: () => requestAnimationFrame(reHighlight),
    }),
  ]);

  // -- SECTION 4: Fluxo do Processo --
  const flowSteps = [
    { num: '1', label: 'Rascunho', desc: 'O colaborador cria e prepara a iniciativa.' },
    { num: '2', label: 'Em Validação', desc: 'Submetida; o mentor valida o projecto.' },
    { num: '3', label: 'Validado Mentor', desc: 'Projecto aprovado; pronto para arrancar.' },
    { num: '4', label: 'Em Execução', desc: 'A iniciativa está a ser implementada.' },
    { num: '5', label: 'Em Validação pelo Mentor', desc: 'Savings declarados; o mentor confirma e encaminha.' },
    { num: '6', label: 'Em Validação pelo Gestor', desc: 'O gestor aprova os savings declarados.' },
    { num: '7', label: 'Em Validação pelo Mentor Manager', desc: 'A equipa de mentoria faz a validação final.' },
    { num: '8', label: 'Implementado', desc: 'Concluída e validada. Fica registada no Catálogo.' },
  ];

  const flowElements = [];
  flowSteps.forEach((step, i) => {
    flowElements.push(new Container([
      new Container([new Text(step.num, { type: 'span' })], { class: 'pace-flow-dot pace-flow-dot--active' }),
      new Text(step.label, { type: 'span', class: 'pace-flow-label' }),
      new Text(step.desc, { type: 'span', class: 'pace-flow-comment' }),
    ], { class: 'pace-flow-step' }));

    if (i < flowSteps.length - 1) {
      flowElements.push(new Container([], { class: 'pace-flow-connector pace-flow-connector--done' }));
    }
  });

  const processFlow = new Container([
    new Text('Fluxo do Processo', { type: 'h2', class: 'pace-sec-title' }),
    new Text('O ciclo segue as fases PDCA: Planear (do rascunho ao projecto validado), Executar (implementação), Verificar (as três validações de savings) e Actuar (implementação concluída).', { type: 'p' }),
    new Container(flowElements, { class: 'pace-flow' }),
  ]);

  // -- SECTION 5: Estados de uma Iniciativa --
  const legendRows = [
    [STATUS.RASCUNHO, 'Em preparação. Só o autor a vê.'],
    [STATUS.SUBMETIDO, 'Submetida, à espera da validação do projecto pelo mentor.'],
    [STATUS.VALIDADO_MENTOR, 'Projecto aprovado; o autor pode iniciar a execução.'],
    [STATUS.EM_EXECUCAO, 'Implementação em curso.'],
    [STATUS.EM_VALIDACAO_MENTOR, 'Savings declarados, à espera da confirmação do mentor.'],
    [STATUS.EM_VALIDACAO_GESTOR, 'À espera da aprovação dos savings pelo gestor.'],
    [STATUS.EM_VALIDACAO_MM, 'À espera da validação final da equipa de mentoria.'],
    [STATUS.IMPLEMENTADO, 'Concluída e validada. Estado final.'],
    [STATUS.EM_REVISAO, 'Devolvida ao autor para alterações.'],
    [STATUS.REJEITADO, 'Recusada numa das validações. Estado final.'],
    [STATUS.CANCELADO, 'Cancelada pelo autor. Estado final.'],
  ];

  const statusLegend = new Container([
    new Text('Estados de uma Iniciativa', { type: 'h2', class: 'pace-sec-title' }),
    new Text('Cada iniciativa mostra um estado. Eis o que cada um significa:', { type: 'p' }),
    new Container(legendRows.map(([statusValue, description]) => buildLegendRow(statusValue, description)), { class: 'pace-steps-list' }),
  ]);

  // -- SECTION 6: Savings e Impacto Financeiro --
  const savingsData = [
    {
      question: 'O que são savings?',
      answer: 'Cada iniciativa quantifica o ganho que gera. Ao submeter, escolhe uma ou mais categorias de savings e preenche os valores actuais e os valores previstos. A plataforma calcula automaticamente o ganho anual.',
    },
    {
      question: 'Hard Cost e Soft Cost',
      answer: 'Hard Cost é uma poupança financeira directa e comprovável (redução de custos, aumento de produção ou de vendas, redução do custo do risco). Soft Cost são ganhos indirectos (eficiência e tempo, custos ou riscos evitados). Existem ainda benefícios qualitativos, sem valor financeiro directo.',
    },
    {
      question: 'Como são calculados os ganhos?',
      answer: 'Indica um período de medição (diário ou mensal) e, por categoria, os valores actuais e previstos. A plataforma anualiza e soma tudo para obter o ganho anual total. Os ganhos de tempo são convertidos no custo equivalente de um colaborador (FTE).',
    },
    {
      question: 'O que é o Simulador Financeiro?',
      answer: 'Na categoria de Produção pode introduzir manualmente um valor anual no Simulador Financeiro quando o cálculo automático não reflecte o ganho real esperado. Esse valor passa a ser usado nos totais, no encaminhamento e nos relatórios.',
    },
    {
      question: 'O que significa o selo de validação final?',
      answer: 'No fim, a iniciativa recebe um selo: "Validado pela equipa de mentoria" (iniciativas Soft Cost abaixo de 10.000 euros) ou "Validado pela área financeira" (Hard Cost ou valores iguais ou superiores a 10.000 euros). O selo não altera o percurso de validação — todas as iniciativas passam pelas mesmas etapas.',
    },
    {
      question: 'O que são os objectivos de poupança?',
      answer: 'A organização define metas anuais de savings (hard e soft) e de iniciativas implementadas. O progresso em relação a essas metas é acompanhado nos dashboards.',
    },
  ];

  const savingsItems = savingsData.map((item) =>
    new AccordionItem(item.question, [
      new Text(item.answer, { type: 'p', class: 'pace-faq-answer' }),
    ], { class: 'pace-faq-item' })
  );

  const savingsSection = new Container([
    new Text('Savings e Impacto Financeiro', { type: 'h2', class: 'pace-sec-title' }),
    new AccordionGroup(savingsItems),
  ], { class: 'pace-faq' });

  // -- SECTION 7: Perguntas Frequentes --
  const faqData = [
    {
      question: 'O que é uma iniciativa PDCA?',
      answer: 'É uma proposta de melhoria contínua baseada no ciclo Plan-Do-Check-Act (Planear, Executar, Verificar, Actuar). Serve para melhorar processos, reduzir custos ou aumentar a eficiência.',
    },
    {
      question: 'Quem pode submeter iniciativas?',
      answer: 'Todos os colaboradores com acesso ao Place. Não é preciso um perfil especial — basta estar autenticado na plataforma.',
    },
    {
      question: 'Como submeto uma iniciativa?',
      answer: 'Clique em "+ Partilhar uma iniciativa" no topo da página. Descreva o problema e a melhoria, escolha a equipa e as categorias de savings, preencha os dados financeiros e submeta. Pode também guardar como rascunho.',
    },
    {
      question: 'O que acontece depois de submeter?',
      answer: 'A iniciativa segue para o mentor da equipa, que valida o projecto. Depois passa por execução, validação dos savings e implementação final.',
    },
    {
      question: 'Quais são as etapas de validação?',
      answer: 'São três: o mentor valida o projecto e, mais tarde, os savings; o gestor aprova os savings; e a equipa de mentoria confirma a implementação final.',
    },
    {
      question: 'Os perfis são atribuídos como?',
      answer: 'Automaticamente, com base na posição de cada pessoa na organização. Não é preciso pedir acesso a nenhum perfil.',
    },
    {
      question: 'Posso editar uma iniciativa depois de submeter?',
      answer: 'Antes da aprovação do mentor ainda pode editar. Depois de o projecto ser validado, os campos base ficam bloqueados. Se lhe for pedida uma revisão, a iniciativa volta a "Em Revisão" e pode editar e re-submeter.',
    },
    {
      question: 'Como cancelo uma iniciativa?',
      answer: 'No detalhe da iniciativa, clique em "Cancelar". Só é possível se a iniciativa não estiver num estado final (Implementado, Rejeitado ou Cancelado).',
    },
    {
      question: 'Como partilho uma iniciativa com colegas?',
      answer: 'No detalhe, use "Gerir Acesso" para conceder acesso de Leitura ou de Colaboração. A iniciativa passa a aparecer no separador "Colaborações Recebidas" de quem a recebe.',
    },
    {
      question: 'Como sou notificado?',
      answer: 'Por email e pelo sino de notificações — submissões, aprovações, revisões, comentários, transferências e implementações. O ecrã inicial mostra as notificações das últimas duas semanas.',
    },
    {
      question: 'Onde vejo as minhas iniciativas?',
      answer: 'No ecrã "Pessoal", organizadas por separadores: Em Curso, Colaborações Recebidas, Rascunhos e Finalizadas.',
    },
    {
      question: 'O que é o encaminhamento automático?',
      answer: 'A plataforma escolhe automaticamente o mentor e o gestor certos com base na equipa, no tipo e no valor da iniciativa. As de maior valor (Hard Cost ou iguais ou superiores a 10.000 euros) seguem para um gestor executivo.',
    },
    {
      question: 'O que são iniciativas confidenciais?',
      answer: 'Pode marcar uma iniciativa como confidencial na submissão. Fica oculta para quem não tem acesso, excepto o responsável, o gestor atribuído, a cadeia de gestão e a equipa de mentoria.',
    },
    {
      question: 'Onde ficam as iniciativas concluídas?',
      answer: 'No "Catálogo": as implementadas e um arquivo das canceladas e rejeitadas. Pode "Replicar" uma iniciativa implementada para reaproveitar a ideia.',
    },
    {
      question: 'Que ecrãs existem?',
      answer: 'Página Inicial, Pessoal, Geral, Mentoria (mentores), Gestor (gestores), Catálogo, Configuração (mentores) e Instruções. Cada perfil vê apenas os ecrãs a que tem acesso.',
    },
  ];

  const faqItems = faqData.map((faq) =>
    new AccordionItem(faq.question, [
      new Text(faq.answer, { type: 'p', class: 'pace-faq-answer' }),
    ], { class: 'pace-faq-item' })
  );

  const faqSection = new Container([
    new Text('Perguntas Frequentes', { type: 'h2', class: 'pace-sec-title' }),
    new AccordionGroup(faqItems),
  ], { class: 'pace-faq' });

  // -- Find-on-page (browser-find style search across the visible content) --
  // Highlights matches in the rendered page text, jumps between them, and shows
  // a match counter. Operates on the currently-visible content only (hidden tabs
  // and collapsed accordions are skipped), matching native browser find.
  let matches = [];
  let currentIdx = -1;
  let activeQuery = '';

  const MIN_QUERY = 2;
  const contentRoot = () => document.querySelector('.pace-content');
  const isShown = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));

  function clearMarks() {
    const root = contentRoot();
    if (root) {
      root.querySelectorAll('mark.pace-find-hl').forEach((m) => {
        const parent = m.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      });
    }
    matches = [];
    currentIdx = -1;
  }

  function wrapMatches(textNode, needle) {
    const text = textNode.nodeValue;
    const lower = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let from = 0;
    let at = lower.indexOf(needle, from);
    while (at !== -1) {
      if (at > from) frag.appendChild(document.createTextNode(text.slice(from, at)));
      const mark = document.createElement('mark');
      mark.className = 'pace-find-hl';
      mark.textContent = text.slice(at, at + needle.length);
      frag.appendChild(mark);
      from = at + needle.length;
      at = lower.indexOf(needle, from);
    }
    if (from < text.length) frag.appendChild(document.createTextNode(text.slice(from)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function updateCounter() {
    const q = activeQuery.trim();
    if (q.length < MIN_QUERY) counter.children = '';
    else if (!matches.length) counter.children = 'Sem resultados';
    else counter.children = `${currentIdx + 1} / ${matches.length}`;
  }

  function markCurrent() {
    matches.forEach((m, i) => m.classList.toggle('pace-find-hl--current', i === currentIdx));
    const el = matches[currentIdx];
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function go(step) {
    if (!matches.length) return;
    currentIdx = (currentIdx + step + matches.length) % matches.length;
    markCurrent();
    updateCounter();
  }

  function runSearch(query) {
    activeQuery = query || '';
    clearMarks();
    const needle = activeQuery.trim().toLowerCase();
    const root = contentRoot();
    if (!root || needle.length < MIN_QUERY) {
      updateCounter();
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(needle)) {
          return NodeFilter.FILTER_REJECT;
        }
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('.pace-find-bar')) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
        if (!isShown(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    nodes.forEach((n) => wrapMatches(n, needle));
    matches = Array.prototype.slice.call(root.querySelectorAll('mark.pace-find-hl'));
    if (matches.length) {
      currentIdx = 0;
      markCurrent();
    }
    updateCounter();
  }

  // Re-highlight the current query (used after a tab swap changes what is visible).
  function reHighlight() {
    if (activeQuery.trim().length >= MIN_QUERY) runSearch(activeQuery);
  }

  const searchField = new FormField({ value: '' });
  const searchInput = new TextInput(searchField, {
    placeholder: 'Procurar nesta página...',
    class: 'pace-find-input',
  });
  const counter = new Text('', { type: 'span', class: 'pace-find-count' });
  const prevBtn = new Button('Anterior', {
    variant: 'secondary',
    class: 'pace-find-nav',
    onClickHandler: () => go(-1),
  });
  const nextBtn = new Button('Seguinte', {
    variant: 'secondary',
    class: 'pace-find-nav',
    onClickHandler: () => go(1),
  });
  const clearBtn = new Button('Limpar', {
    variant: 'secondary',
    class: 'pace-find-clear',
    onClickHandler: () => {
      searchField.value = '';
      runSearch('');
    },
  });

  searchField.subscribe(() => runSearch(searchField.value || ''));

  const findBar = new Container([searchInput, counter, prevBtn, nextBtn, clearBtn], {
    class: 'pace-find-bar',
  });

  // Enter jumps to the next match (Shift+Enter to the previous). No HTMD keydown
  // hook exists, so bind on the rendered input; it is removed with the route.
  requestAnimationFrame(() => {
    const el = searchInput.instance;
    if (!el || !el.on) return;
    el.on('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const live = (e.target && e.target.value) || '';
      if (live.trim().toLowerCase() !== activeQuery.trim().toLowerCase()) runSearch(live);
      else go(e.shiftKey ? -1 : 1);
    });
  });

  return createPageLayout([
    findBar,
    ctaBanner,
    profileCards,
    actionGuides,
    processFlow,
    statusLegend,
    savingsSection,
    faqSection,
  ], { contentClass: 'pt-v2' });
});
