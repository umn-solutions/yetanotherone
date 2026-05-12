import {
  Text,
  Container,
  Button,
  AccordionGroup,
  AccordionItem,
  defineRoute,
  Router,
} from '../../libs/nofbiz/nofbiz.base.js';

import { openNewInitiativeModal } from '../../utils/new-initiative.js';
import { createPageLayout } from '../../utils/navbar.js';

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

  // -- CTA Banner --
  const ctaBanner = new Container([
    new Container([
      new Text('Como funciona o Place', { type: 'h2' }),
      new Text('Conhece os perfis, as acções disponíveis e o fluxo completo das iniciativas PDCA.', { type: 'p' }),
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

  // -- Profile cards --
  const profileCards = new Container([
    new Text('Perfis e Responsabilidades', { type: 'h2', class: 'pace-sec-title' }),
    new Container([
      buildProfileCard('C', 'Colaborador', 'Quem submete e acompanha', [
        'Submeter iniciativas PDCA',
        'Acompanhar o estado da iniciativa',
        'Editar rascunhos e re-submeter',
        'Declarar implementação',
        'Cancelar iniciativas próprias',
      ], 'pace-profile--green'),
      buildProfileCard('M', 'Mentor', 'Quem valida e acompanha', [
        'Validar projectos submetidos',
        'Solicitar revisão ao colaborador',
        'Confirmar savings declarados',
        'Rejeitar iniciativas inadequadas',
        'Pedir parecer a outros mentores',
      ], 'pace-profile--dark-green'),
      buildProfileCard('G', 'Gestor', 'Quem aprova savings', [
        'Aprovar savings declarados',
        'Solicitar revisão quando necessário',
        'Rejeitar savings incorrectos',
        'Pedir parecer adicional',
        'Validar valores financeiros',
      ], 'pace-profile--darker-green'),
    ], { class: 'pace-profile-grid' }),
  ]);

  // -- Action guide data --
  const guides = [
    {
      title: '1. Submeter uma iniciativa',
      who: 'Colaborador',
      colorClass: 'pace-guide--green',
      steps: [
        'Clicar em "+ Nova Iniciativa" no ecrã Início ou Pessoal.',
        'Preencher o título, equipa e descrição da iniciativa.',
        'Seleccionar o tipo de saving (se aplicável) e o valor estimado.',
        'Clicar em "Submeter" para enviar para validação do mentor.',
        'Também pode guardar como rascunho para completar mais tarde.',
      ],
      tip: 'Pode guardar como rascunho e voltar a editar antes de submeter.',
    },
    {
      title: '2. Editar um rascunho',
      who: 'Colaborador',
      colorClass: 'pace-guide--green',
      steps: [
        'Aceder ao ecrã "Pessoal" e localizar o rascunho na secção Rascunhos.',
        'Clicar em "Editar" no rascunho pretendido.',
        'Actualizar os campos necessários.',
        'Guardar novamente como rascunho ou submeter directamente.',
      ],
      tip: 'Rascunhos não são visíveis para mentores ou gestores até serem submetidos.',
    },
    {
      title: '3. Validar um projecto',
      who: 'Mentor',
      colorClass: 'pace-guide--dark-green',
      steps: [
        'Aceder ao ecrã "Mentoria" para ver iniciativas pendentes.',
        'Clicar numa iniciativa para ver os detalhes completos.',
        'Avaliar se o projecto está correctamente formulado e alinhado.',
        'Clicar em "Aprovar" para validar ou "Solicitar Revisão" para pedir alterações.',
        'Em caso de rejeição, clicar em "Rejeitar" e indicar o motivo.',
      ],
      tip: 'Pode solicitar revisão com comentários específicos para ajudar o colaborador.',
    },
    {
      title: '4. Aprovar savings',
      who: 'Gestor',
      colorClass: 'pace-guide--darker-green',
      steps: [
        'Aceder ao ecrã "Gestor" para ver savings pendentes de validação.',
        'Verificar o tipo de saving e o valor estimado.',
        'Confirmar se os valores estão correctos e devidamente justificados.',
        'Clicar em "Aprovar Savings" para validar.',
        'Se necessário, solicitar revisão ao colaborador.',
      ],
      tip: 'Savings >= 10.000 EUR ou Hard Cost são encaminhados para o Gestor RF.',
    },
    {
      title: '5. Cancelar uma iniciativa',
      who: 'Colaborador',
      colorClass: 'pace-guide--green',
      steps: [
        'Aceder ao ecrã "Pessoal" e localizar a iniciativa.',
        'Abrir o detalhe da iniciativa.',
        'Clicar em "Cancelar" nas acções disponíveis.',
        'Confirmar o cancelamento na janela de diálogo.',
      ],
      tip: 'Iniciativas implementadas, rejeitadas ou já canceladas não podem ser canceladas novamente.',
    },
    {
      title: '6. Comentar uma iniciativa',
      who: 'Todos os perfis',
      colorClass: 'pace-guide--gray',
      steps: [
        'Abrir o detalhe de qualquer iniciativa.',
        'Navegar até à secção de comentários.',
        'Escrever o comentário e clicar em enviar.',
        'O autor da iniciativa será notificado.',
      ],
      tip: 'Comentários são visíveis para todos os participantes da iniciativa.',
    },
    {
      title: '7. Pedir colaboração',
      who: 'Colaborador / RE / Mentor / Gestor',
      colorClass: 'pace-guide--green',
      steps: [
        'Abrir o detalhe da iniciativa.',
        'Clicar em "Pedir Colaboração" no menu de acções.',
        'Seleccionar o destinatário e escrever a mensagem.',
        'O destinatário receberá uma notificação.',
      ],
      tip: 'Útil para envolver colegas de outras equipas na resolução do problema.',
    },
    {
      title: '8. Pedir parecer',
      who: 'Mentor / Gestor',
      colorClass: 'pace-guide--dark-green',
      steps: [
        'Abrir o detalhe da iniciativa em validação.',
        'Clicar em "Pedir Parecer" no menu de acções.',
        'Seleccionar outro mentor ou gestor para consulta.',
        'Aguardar a resposta antes de tomar a decisão final.',
      ],
      tip: 'O parecer é consultivo e não altera o estado da iniciativa.',
    },
    {
      title: '9. Transferir uma iniciativa',
      who: 'Colaborador / Owner',
      colorClass: 'pace-guide--green',
      steps: [
        'Abrir o detalhe da iniciativa própria.',
        'Clicar em "Transferir" no menu de acções.',
        'Seleccionar o novo responsável usando o seleccionador de pessoas.',
        'Confirmar a transferência.',
        'A iniciativa passa para o ecrã Pessoal do novo responsável.',
      ],
      tip: 'Apenas o autor actual pode transferir a iniciativa.',
    },
    {
      title: '10. Solicitar revisão',
      who: 'Mentor / Gestor',
      colorClass: 'pace-guide--dark-green',
      steps: [
        'Abrir o detalhe da iniciativa pendente.',
        'Clicar em "Solicitar Revisão".',
        'Adicionar comentários com as alterações necessárias.',
        'A iniciativa volta para o estado "Em Revisão".',
        'O colaborador receberá uma notificação para rever e re-submeter.',
      ],
      tip: 'Inclua indicações claras para facilitar a revisão do colaborador.',
    },
    {
      title: '11. Rever e re-submeter',
      who: 'Colaborador',
      colorClass: 'pace-guide--red',
      steps: [
        'Verificar as notificações de revisão no ecrã Pessoal.',
        'Ler os comentários do mentor/gestor na secção de revisão.',
        'Clicar em "Editar" para actualizar a iniciativa.',
        'Fazer as alterações solicitadas.',
        'Clicar em "Re-submeter" para enviar novamente para validação.',
      ],
      tip: 'A justificação da revisão é visível no detalhe da iniciativa para referência.',
    },
  ];

  const guideAccordionItems = guides.map((guide) =>
    new AccordionItem(guide.title, [
      new Container([
        new Text(guide.who, { type: 'span', class: 'pace-guide-who' }),
        buildNumberedSteps(guide.steps),
        guide.tip
          ? new Container([
              new Text('Dica: ' + guide.tip, { type: 'p', class: 'pace-guide-tip' }),
            ], { class: 'pace-guide-tip-box' })
          : new Text('', { type: 'span' }),
      ], { class: 'pace-guide-body' }),
    ], { class: `pace-action-card ${guide.colorClass}` })
  );

  const actionGuides = new Container([
    new Text('Guia de Acções', { type: 'h2', class: 'pace-sec-title' }),
    new AccordionGroup(guideAccordionItems, { allowMultipleOpen: true }),
  ]);

  // -- Process flow --
  const flowSteps = [
    { num: '1', label: 'Submissão' },
    { num: '2', label: 'Validação' },
    { num: '3', label: 'Execução' },
    { num: '4', label: 'Savings' },
    { num: '5', label: 'Implementado' },
  ];

  const flowElements = [];
  flowSteps.forEach((step, i) => {
    flowElements.push(new Container([
      new Container([new Text(step.num, { type: 'span' })], { class: 'pace-flow-dot pace-flow-dot--active' }),
      new Text(step.label, { type: 'span', class: 'pace-flow-label' }),
    ], { class: 'pace-flow-step' }));

    if (i < flowSteps.length - 1) {
      flowElements.push(new Container([], { class: 'pace-flow-connector pace-flow-connector--done' }));
    }
  });

  const processFlow = new Container([
    new Text('Fluxo do Processo', { type: 'h2', class: 'pace-sec-title' }),
    new Container(flowElements, { class: 'pace-flow' }),
  ]);

  // -- FAQ accordion --
  const faqData = [
    {
      question: 'O que é uma iniciativa PDCA?',
      answer: 'Uma iniciativa PDCA é uma proposta de melhoria contínua baseada no ciclo Plan-Do-Check-Act. Qualquer colaborador pode submeter uma iniciativa para melhorar processos, reduzir custos ou aumentar a eficiência.',
    },
    {
      question: 'Quem pode submeter iniciativas?',
      answer: 'Todos os colaboradores com acesso ao Place podem submeter iniciativas. Não é necessário ter um perfil especial -- basta estar autenticado na plataforma.',
    },
    {
      question: 'O que acontece depois de submeter?',
      answer: 'A iniciativa é encaminhada automaticamente para o mentor responsável da sua equipa. O mentor analisa e decide se aprova, solicita revisão ou rejeita o projecto.',
    },
    {
      question: 'Como funcionam os savings?',
      answer: 'Existem dois tipos: Hard Cost (redução directa de custos comprovável) e Soft Cost (ganhos de eficiência ou produtividade). Savings acima de 10.000 EUR ou Hard Cost são encaminhados para o Gestor RF.',
    },
    {
      question: 'Posso editar uma iniciativa após submissão?',
      answer: 'Não directamente. Uma vez submetida, a iniciativa segue o fluxo de validação. Se o mentor solicitar revisão, a iniciativa volta ao estado "Em Revisão" e pode ser editada e re-submetida.',
    },
    {
      question: 'Como cancelo uma iniciativa?',
      answer: 'Pode cancelar qualquer iniciativa própria que não esteja num estado terminal (Implementado, Rejeitado ou Cancelado). Aceda ao detalhe da iniciativa e clique em "Cancelar".',
    },
    {
      question: 'O que é o routing automático?',
      answer: 'O Place encaminha automaticamente cada iniciativa para o mentor e gestor correctos com base na equipa, tipo de saving e valor estimado. Não precisa de seleccionar manualmente os validadores.',
    },
    {
      question: 'Onde vejo o estado das minhas iniciativas?',
      answer: 'No ecrã "Pessoal" encontra todas as suas iniciativas organizadas por estado: rascunhos, pendentes de validação, em execução e histórico completo.',
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

  return createPageLayout([ctaBanner, profileCards, actionGuides, processFlow, faqSection]);
});
