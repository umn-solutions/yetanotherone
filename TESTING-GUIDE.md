# PLACE - Guia de Testes

Guia de testes para a plataforma PLACE de melhoria contínua (iniciativas PDCA).
Cada bloco em baixo é uma **história de utilizador** curta seguida dos **pontos a
verificar** por quem testa. Áreas em foco: emails, cálculos, fluxos de validação,
tooltips.

A interface está em português; os rótulos aparecem entre aspas em PT. A aplicação
corre em `SitePages/app.aspx`. Separadores de navegação: Início, Pessoal, Geral,
Mentoria, Gestor, Catálogo, Configuração, mais "Ajuda"/Instruções.

## Perfis e acessos

Os quatro perfis são `colaborador`, `gestor`, `mentor` e `mentor-manager`. Os perfis
vêm da importação da OrgHierarchy (ou de uma substituição manual na Configuração). Teste
cada cenário autenticado com o perfil relevante. Se a OrgHierarchy estiver vazia, pertencer
ao grupo SharePoint "PACE Owners" concede acesso bootstrap (mentor + gestor + colaborador, mas
NÃO mentor-manager -- logo "Validar Implementação" não fica disponível neste modo). É mostrado o
aviso "Modo bootstrap: acesso via grupo SharePoint. Importe a hierarquia na página Configuração."
e cada perfil na barra de navegação recebe o sufixo "(Bootstrap)".

| Área | Separador | Perfis com acesso |
|------|-----------|-------------------|
| Início | Página Inicial | todos |
| Instruções | Ajuda | todos |
| Pessoal | Pessoal | colaborador, mentor, mentor-manager (NÃO gestor) |
| Geral | Geral | colaborador, gestor, mentor, mentor-manager |
| Mentoria | Mentoria | mentor, mentor-manager |
| Gestor | Gestor | gestor |
| Catálogo | Catálogo | todos |
| Configuração | Configuração | mentor, mentor-manager |

---

# 1. Ciclo de vida e fluxos de validação

Enquanto colaborador, crio uma iniciativa através do assistente de 5 passos ("+ Partilhar uma iniciativa"), preencho Contexto -> Problema -> Tema -> Plano -> Impacto, e ou guardo um rascunho ("Gravar Rascunho") ou submeto ("Submeter").
Pontos a verificar
- Passos: 01 Contexto (Título + Equipa + Confidencial), 02 Problema (descrição), 03 Tema (Tags), 04 Plano (objectivo), 05 Impacto (métricas financeiras).
- "Continuar" e ambas as acções de guardar bloqueiam até o Título estar preenchido e a Equipa seleccionada; o campo inválido recebe foco e surge um toast vermelho ("Preencha o título e seleccione a equipa.").
- O rótulo do rascunho é "Gravar Rascunho" para novo, "Guardar" ao editar um registo já submetido (a edição NÃO deve despromover o estado de volta a Rascunho).
- Ao submeter, uma "Nova iniciativa" passa de Rascunho -> Submetido; é registado um evento de Criação e o registo aparece em Pessoal.
- A Equipa assume por omissão o OUID do próprio utilizador em novas iniciativas.

Enquanto colaborador, submeto uma nova iniciativa cuja Equipa tem um mentor atribuído (ver "Mentores por Equipa" na Configuração) e ela é encaminhada automaticamente para esse mentor.
Pontos a verificar
- Se a Equipa impactada (ImpactedTeamOUID) tiver um mentor configurado, o Mentor/MentorEmail da iniciativa são pré-preenchidos no acto da submissão (pré-encaminhamento).
- O estado NÃO muda por isso: continua a ir a Submetido ("Em Validação") e o mentor tem na mesma de "Aprovar"; o pré-encaminhamento apenas dirige o item a um mentor específico em vez do lote partilhado.
- Se a Equipa NÃO tiver mentor, o MentorEmail fica vazio e o item segue o fluxo partilhado normal (aparece a todos os mentores em Mentoria).
- A pesquisa do mentor nunca bloqueia a submissão: se falhar, a iniciativa é submetida na mesma sem mentor (fluxo partilhado), sem erro para o utilizador.
- Um item pré-encaminhado deixa de aparecer no lote "sem mentor" dos outros mentores; surge apenas na Mentoria do mentor atribuído.

Enquanto colaborador, a minha nova iniciativa percorre os estados Rascunho -> Submetido ("Em Validação") -> Validado Mentor -> Em Execução -> Por Validar ("Em Validação Savings") -> Validado Gestor -> Validado Final -> Implementado.
Pontos a verificar
- O rótulo do chip de estado difere do valor interno: Submetido mostra "Em Validação", Por Validar mostra "Em Validação Savings".
- Cada transição regista um evento na linha temporal, visível na secção "Progresso" do painel lateral, com nome do actor e data.
- Estados terminais (Implementado, Rejeitado, Cancelado) não mostram mais botões de fluxo.
- A linha temporal "Progresso" mostra o PRÓXIMO passo esperado como um ponto vazado.

Enquanto mentor, abro a página Mentoria, reviso uma iniciativa submetida e clico em "Aprovar", "Solicitar Revisão" ou "Rejeitar".
Pontos a verificar
- Aprovar: Submetido -> Validado Mentor; o mentor actual fica registado como Mentor/MentorEmail (auto-atribuição).
- Rejeitar e Solicitar Revisão exigem comentário obrigatório; comentário vazio mostra "O comentário é obrigatório." e a acção é cancelada.
- Solicitar Revisão define o PreviousStatus para que a re-submissão volte ao ponto de controlo correcto; o estado passa a Em Revisão.
- Itens Submetidos sem mentor aparecem a todos os mentores; após aprovação passam a pertencer a esse mentor.

Enquanto colaborador cuja iniciativa foi devolvida, vejo-a nos cartões de alerta de "revisão" em Pessoal, leio o comentário do revisor, clico em "Rever" para editar, e "Re-submeter".
Pontos a verificar
- Os cartões de revisão mostram o motivo do revisor em linha e os dias decorridos (cartões com mais de 7 dias recebem o estilo "urgente").
- Re-submeter a partir de Em Revisão volta a Submetido quando a revisão ocorreu antes da aprovação do mentor, ou a Por Validar quando ocorreu após a validação do gestor (os dados financeiros têm de ser re-validados).
- Re-submeter para Por Validar volta a correr a validação de completude do To-Be e re-atribui o gestor via regras de encaminhamento.
- Os campos base (Título, Descrição, Equipa, Tags, Confidencial, Objectivo) ficam bloqueados após Submetido, EXCEPTO em Em Revisão quando o PreviousStatus é Submetido (edição total reactivada).

Enquanto colaborador, inicio a execução de uma iniciativa aprovada ("Declarar Início Execução") e mais tarde declaro savings ("Solicitar Validação").
Pontos a verificar
- Iniciar Execução exige uma "data prevista de conclusão"; data vazia cancela com um toast. Validado Mentor -> Em Execução.
- Solicitar Validação (Em Execução -> Por Validar) impõe a validação de To-Be: cada métrica activada tem de ter todos os valores To-Be > 0, e Qualidade tem de ter texto; caso contrário surge um toast específico "Preencha todos os valores To-Be..." e a transição é bloqueada.
- Em caso de sucesso, o gestor é atribuído automaticamente pelas regras de encaminhamento (sem selecção manual).

Enquanto gestor, abro a página Gestor, reviso os cartões "Savings Por Validar" e clico em "Aprovar Savings", "Rejeitar", "Solicitar Revisão" ou "Transferir".
Pontos a verificar
- Aprovar: Por Validar -> Validado Gestor.
- Transferir reatribui a outro gestor (o estado mantém-se Por Validar); apenas utilizadores cujo perfil deriva a gestor aparecem no selector, excluindo o gestor actual.
- Rejeitar / Solicitar Revisão exigem comentário obrigatório.
- O valor do custo anual por FTE e respectivos campos são visíveis para gestor/mentor mas nunca para colaborador.

Enquanto mentor, confirmo savings ("Confirmar Savings") e enquanto mentor-manager valido a implementação ("Validar Implementação").
Pontos a verificar
- Confirmar Savings: Validado Gestor -> Validado Final (apenas mentor / mentor-manager).
- Validar Implementação: Validado Final -> Implementado, APENAS para mentor-manager; exige uma data de implementação (por omissão a data de hoje).
- Na implementação, a FinalValidationLabel é calculada e mostrada como um segundo chip (ver secção de cálculos).
- Um mentor-manager vê uma coluna/KPI extra "Confirmação de Implementação" na página Mentoria.

Enquanto proprietário, cancelo ("Cancelar"), elimino ("Eliminar") ou transfiro ("Transferir") a minha própria iniciativa.
Pontos a verificar
- Cancelar está disponível em qualquer estado não terminal e é irreversível; é exigido um diálogo de confirmação.
- Eliminar só é oferecido para Rascunho (em Pessoal) ou pelo proprietário/mentor atribuído (em Catálogo); elimina em cascata os financeiros, eventos, comentários, notificações e partilhas, e depois a iniciativa.
- Transferir (propriedade) entrega o registo a outro colaborador; deixa então de aparecer na lista Pessoal do utilizador actual.
- Falhas parciais da cascata mostram "Eliminação parcial: N registo(s)..." e o registo principal NÃO é eliminado, para que re-execuções convirjam.

Enquanto interveniente, concedo ou revogo acesso ("Gerir Acesso") e adiciono permissões de leitura ou colaboração.
Pontos a verificar
- O diálogo lista apenas partilhas delegadas (proprietário/mentor/gestor têm acesso implícito e não são mostrados).
- O tipo de acesso é "Leitura" (read) ou "Colaboração" (collaborate); colaboradores ganham acesso de escrita, leitores não.
- Um gestor só consegue conceder "Leitura"; a opção "Colaboração" está reservada a colaborador/mentor/mentor-manager (o selector de tipo esconde "Colaboração" quando o utilizador é gestor).
- Adicionar/remover uma pessoa dispara os emails ACCESS_GRANTED / ACCESS_REVOKED.

Enquanto utilizador a editar um registo que outra pessoa alterou, deparo-me com um conflito de ETag.
Pontos a verificar
- Um conflito de edição concorrente (HTTP 412), nas acções de fluxo, mostra "A iniciativa foi modificada por outro utilizador. Recarregue a página e tente novamente."; no assistente de edição a mensagem é "Outra pessoa editou esta iniciativa. Feche e reabra para recarregar." Em ambos os casos NÃO sobrescreve.
- Os campos de texto sincronizam num debounce de 300ms; o assistente descarrega as edições pendentes (blur) antes de cada gravação, para não perder a última tecla.

---

# 2. Emails e notificações

Cada acção de fluxo envia um email HTML (assunto com prefixo "PLACE —") E, apenas quando
o envio tem sucesso, escreve um registo de notificação (sino) mostrado na página Início em
"Notificações (últimas 2 semanas)". Verifique AMBOS: a caixa de entrada e a lista do Início
do destinatário após cada acção. Os emails nunca lançam erro: um destinatário falhado é
registado em log e ignorado, e o actor é sempre excluído da auto-notificação onde indicado.
Se a mesma pessoa acumular papéis (ex.: o mentor é também o proprietário), os destinatários são
deduplicados: recebe apenas UM email e UM registo de sino, não um por papel.

Enquanto mentor, recebo um email quando uma iniciativa é submetida ou re-submetida para mim.
Pontos a verificar
- Submeter -> "Nova iniciativa submetida para validação" para MentorEmail. Distinguir dois casos: (a) Equipa COM mentor configurado (Mentores por Equipa) -> o MentorEmail é pré-preenchido na submissão e o email vai IMEDIATAMENTE para esse mentor; (b) Equipa SEM mentor -> o MentorEmail está vazio, nenhum email é enviado até um mentor ser atribuído, e o item submetido continua a surgir em Mentoria para todos os mentores.
- Re-submeter -> "Iniciativa re-submetida" para MentorEmail; se voltar a entrar em Por Validar, um "Validação de savings pendente" também vai para o gestor.

Enquanto colaborador, recebo um email em cada decisão sobre a minha iniciativa.
Pontos a verificar
- Aprovar (mentor) -> "Iniciativa aprovada pelo mentor" para o proprietário.
- Rejeitar -> "Iniciativa rejeitada" para o proprietário, incluindo o motivo da rejeição.
- Solicitar Revisão -> "Pedido de revisão" para o proprietário, incluindo o motivo.
- Confirmar Savings (mentor) -> "Savings confirmados" para o proprietário + gestor (actor excluído).
- Validar Implementação -> "Iniciativa implementada" para o proprietário + mentor + gestor (actor excluído).

Enquanto gestor, recebo um email quando savings precisam da minha validação.
Pontos a verificar
- Declarar Início Execução -> "Execução iniciada" para MentorEmail.
- Solicitar Validação (declarar savings) -> "Validação de savings pendente" para o gestor atribuído automaticamente.
- Aprovar Savings -> "Savings aprovados" para MentorEmail.

Enquanto interveniente, recebo um email em transferências, cancelamento, eliminação, alterações de acesso e comentários.
Pontos a verificar
- Cancelar -> "Iniciativa cancelada" para MentorEmail.
- Eliminar -> "Iniciativa eliminada" para todos os intervenientes (proprietário, mentor, gestor, colaboradores activos), com quem elimina excluído; enviado DEPOIS da cascata, para sobreviver a esta.
- Transferir (gestor) -> "transferida para validação" para o novo gestor + "Gestor alterado" para o proprietário.
- Transferir (propriedade) -> "Iniciativa transferida" para o novo proprietário + "Proprietário alterado" para o mentor.
- Gerir Acesso -> "Acesso concedido" / "Acesso removido" para a pessoa afectada.
- Comentar -> "Novo comentário" para o mentor + proprietário (o autor do comentário é excluído).
- Cada envio bem-sucedido acrescenta um registo de sino; confirme que as notificações do Início do destinatário se actualizam dentro da janela de 2 semanas.

Nota sobre "intervenientes": não é um termo da interface. Refere-se a todos os que têm
interesse na iniciativa - proprietário (colaborador), mentor, gestor validador e
colaboradores com acesso activo.

---

# 3. Cálculos financeiros

As métricas são adicionadas no passo 05 (Impacto) do assistente como separadores. Cada
métrica tem uma fase As-Is e uma fase To-Be (excepto Qualidade, que é só texto). Verifique
os totais por período, os totais anualizados, o saving realizado e as pílulas de impacto
projectado. Use os valores de exemplo abaixo para conferir a aritmética à mão.

Enquanto utilizador, adiciono métricas e a plataforma deriva automaticamente a categoria de saving e a classificação Hard/Soft.
Pontos a verificar
- Inferência: Produção -> "Aumento de Produção (PNB)" (Hard); Gastos -> "Gastos Gerais" (Hard); Redução de Custo de Risco -> "Redução do Custo do Risco" (Hard); Eficiência -> "Eficiência Operacional" (Soft); Custo/Risco Evitado -> "Custo ou Risco Evitado" (Soft); Qualidade -> "Melhoria de Qualidade" (Soft).
- Prioridade do tipo global: Hard > Soft > Outros Benefícios Qualitativos. Adicionar qualquer métrica Hard torna toda a iniciativa Hard.
- A secção só de leitura "Classificação do Saving" actualiza em tempo real à medida que se adicionam/removem métricas.

Enquanto utilizador, introduzo valores As-Is / To-Be e o total por período é calculado por métrica.
Pontos a verificar
- Total Eficiência = Volume x Tempo unitário (minutos). Exemplo: 1000 x 3 = 3000 min.
- Total Produção = Volume x Valor unitário x (Taxa% / 100). Exemplo: 200 x 50 x 0.10 = 1000 €.
- Total Gastos = Volume x Custo unitário. Exemplo: 100 x 5 = 500 €.
- Total Redução de Risco = Exposição x (Taxa% / 100). Exemplo: 100000 x 0.02 = 2000 €.
- Total Custo/Risco Evitado = Custos operacionais. Exemplo: 3000 -> 3000 €.
- Qualidade não tem números; exige apenas uma descrição não vazia.

Enquanto utilizador, defino o período de medição e vejo os valores anualizados.
Pontos a verificar
- Factor de anualização: Diário x252, Mensal x12. Exemplo: Gastos 500 €/mês -> 6000 €/ano.
- O callout "Período de Medição" deve explicar "Diário x252, Mensal x12".
- O painel de totais mostra dois blocos lado a lado: por período e "Totais Anuais".

Enquanto mentor/gestor, defino o custo anual por FTE e os minutos de Eficiência convertem-se em euros.
Pontos a verificar
- FTE-ano = 120960 minutos (252 dias x 8h x 60min). Equivalente FTE = minutos anuais / 120960.
- Eficiência € = (minutos anuais / 120960) x FTEAnnualCost. Exemplo: 3000 min/mês -> 36000 min/ano -> 0.2976 FTE -> a 40000 €/FTE -> 11904.76 €.
- O campo de custo FTE e a linha de total "Eficiência (Custo FTE)" ficam totalmente ocultos para colaborador.

Enquanto utilizador, vejo o saving realizado e o impacto projectado por métrica e no total.
Pontos a verificar
- Direcção do saving realizado: métricas de "decréscimo" (Eficiência, Gastos) = As-Is - To-Be; métricas de "acréscimo" (Produção, Redução de Risco, Custo Evitado) = To-Be - As-Is.
- As pílulas "Impacto Financeiro Projectado" mostram a diferença To-Be menos As-Is por período e anual; uma alteração benéfica aparece a verde mesmo quando a diferença bruta é negativa (ex.: uma redução de custos).
- Redução de Custo tem um toggle de modo "Custo evitado" / "Risco evitado".

Enquanto mentor-manager, implemento uma iniciativa e o rótulo de validação final é atribuído automaticamente.
Pontos a verificar
- Regra do rótulo: se TODAS as categorias de saving forem Soft E o total To-Be anualizado for inferior a 10000 €, o rótulo é "Validado pela equipa PLACE"; caso contrário "Validado pela área financeira".
- O rótulo persiste na iniciativa e aparece como um segundo chip de estado nas tabelas e no painel de detalhe.

Enquanto colaborador a declarar savings, o gestor é encaminhado automaticamente por valor e tipo.
Pontos a verificar
- Escalão de encaminhamento: Hard Cost OU valor anualizado >= 10000 € sobe um nível na hierarquia organizacional; abaixo disso fica no responsável da equipa / gestor directo.
- Sem selecção manual de gestor na declaração; o gestor resolvido recebe o email de validação.
- 10000 € é o mesmo limiar usado no rótulo PLACE-vs-financeira, mas são verificações independentes (o rótulo exige também que seja TUDO soft).

Enquanto mentor/gestor, exporto a vista actual para CSV ("Exportar").
Pontos a verificar
- A exportação reflecte os filtros actuais e o separador activo; vista vazia avisa "Sem iniciativas para exportar."
- O CSV inclui savings anualizados por métrica, estado, proprietário/mentor/gestor, comentários e histórico de eventos; a coluna FTEAnnualCost aparece apenas para mentor/gestor.
- Os números no CSV têm de reconciliar com os totais anualizados por métrica mostrados na interface.

---

# 4. Tooltips, chips e texto

Enquanto utilizador, passo o rato sobre os botões de adicionar métrica e leio uma descrição de cada métrica.
Pontos a verificar
- Cada botão "+ <métrica>" tem um tooltip nativo (atributo title) vindo de METRIC_DESCRIPTIONS, ex.: Gastos = "Redução de FTEs, ... material de escritório ou correio".
- Confirme que todas as seis métricas mostram um tooltip; Qualidade = "Aumento da taxa de satisfação do cliente...".

Enquanto utilizador, leio os callouts em linha e as descrições de estado.
Pontos a verificar
- O callout "Período de Medição" explica os factores de anualização.
- A introdução do passo 05 explica que o As-Is é a linha de base para medir o impacto ao longo do ciclo PDCA.
- Os chips de estado usam cores distintas: concluído (Implementado), pendente (Submetido/Por Validar/Validado Final), revisão (Em Revisão/Rejeitado), inactivo (Cancelado/Rascunho), activo (restantes).
- Iniciativas confidenciais mostram um ícone de cadeado e um chip "Confidencial"; a caixa de verificação alterna ao clicar em qualquer ponto da sua linha.

Enquanto utilizador, abro a página Instruções (Ajuda).
Pontos a verificar
- Os cartões de perfil (Colaborador/Mentor/Gestor) listam responsabilidades.
- O acordeão "Guia de Acções" cobre submeter, editar rascunho, validar, aprovar savings, cancelar, comentar, transferir, solicitar revisão, re-submeter.
- "Fluxo do Processo" mostra Submissão -> Validação -> Execução -> Savings -> Implementado.
- As FAQ mencionam a regra de encaminhamento de 10000 € / Hard Cost.

---

# 5. Verificações ao nível da página

Enquanto colaborador, abro o Início e vejo um hero personalizado e as minhas notificações recentes.
Pontos a verificar
- O hero saúda pelo primeiro nome; "+ Partilhar uma iniciativa" e "Ver as minhas iniciativas" aparecem para utilizadores não-gestor (o CTA fica oculto para gestor).
- "Notificações (últimas 2 semanas)" lista os registos de sino do mais recente para o mais antigo, com tempo relativo ("hoje", "há N dias", "há N semanas"); vazio mostra "Sem notificações recentes."

Enquanto colaborador, abro o Pessoal e giro as minhas iniciativas.
Pontos a verificar
- KPIs: Submetidas, Em Curso, Implementadas (totais sem filtro).
- Separadores: Em Curso, Colaborações Recebidas, Rascunhos, Finalizadas.
- Filtros: título (texto), Equipa (combo), Tags (múltiplo); "Limpar" repõe tudo.
- Os cartões de alerta de revisão aparecem acima dos separadores quando algum item está Em Revisão.
- Clicar numa linha abre o painel lateral de detalhe; o botão de exportar fica junto ao toggle dos separadores.

Enquanto utilizador, abro o Geral e navego iniciativas por âmbito de equipa.
Pontos a verificar
- "Para a minha equipa" é limitado pelo DeptAncestorPath do utilizador; "Outras equipas" carrega de forma diferida e EXCLUI iniciativas confidenciais.
- KPIs: Iniciativas, Equipas impactadas, Colaboradores Responsáveis (recalculados ao filtrar).

Enquanto mentor, abro a Mentoria e ajo sobre itens pendentes.
Pontos a verificar
- Colunas da grelha de validação: "Validação de Projecto", "Confirmação Final", mais "Confirmação de Implementação" apenas para mentor-manager.
- Os KPIs espelham as colunas; cartões pendentes com mais de 5 dias recebem o estilo "urgente".
- Separadores: Minhas Iniciativas, Colaborações Recebidas (as colaborações abrem só de leitura, canAct=false).

Enquanto gestor, abro o Gestor e valido savings.
Pontos a verificar
- Cartões "Savings Por Validar" com acção por cartão "Aprovar"; KPIs: Por Validar, Implementadas, Em Acompanhamento.
- Itens de colaboração atribuídos a mim como gestor são de-duplicados do separador "Colaborações".

Enquanto utilizador, abro o Catálogo e navego o trabalho concluído.
Pontos a verificar
- O separador "Implementados" mostra a data de implementação e KPIs (Iniciativas Implementadas, Equipas Impactadas, Utilizadores Envolvidos).
- O separador "Arquivo" mostra Cancelado + Rejeitado com uma coluna de estado.
- O painel de detalhe a partir do Catálogo oculta a linha temporal de progresso e a caixa de comentários (vista de arquivo); "Replicar" (só disponível no Catálogo) abre o assistente com os campos de CONTEÚDO copiados (Título, Descrição, Tema/Tags, Plano, Impacto/financeiros) num novo Rascunho do utilizador actual -- os metadados de propriedade e de fluxo (estado, mentor, gestor, eventos, comentários) NÃO são copiados.

Enquanto mentor/mentor-manager, abro a Configuração e administro a plataforma.
Pontos a verificar
- Separadores: Importar (CSV da hierarquia organizacional, substitui todos os dados), Dados (lista de colaboradores + substituição manual de perfil), Hierarquia (vista em árvore), Configurações (objectivos anuais de poupança por categoria em € MAIS a secção "Mentores por Equipa"), Exportação (exportar todas as iniciativas).
- A importação CSV aceita .csv (windows-1252) e .xlsx; verifique a confirmação antes de sobrescrever a hierarquia existente.
- Opções de substituição de perfil: Automático, Colaborador, Gestor, Mentor, Mentor Manager.

Enquanto mentor/mentor-manager, na Configuração > Configurações administro a secção "Mentores por Equipa" (atribuir mentores a equipas para pré-encaminhamento).
Pontos a verificar
- A secção mostra uma lista com colunas "Mentor" e "Equipas" e um botão "Adicionar Mentor"; vazia mostra "Nenhum mentor configurado. Clique em 'Adicionar Mentor' para começar."
- Adicionar: o diálogo tem um selector de mentor (único) e um selector de equipas (múltiplo); guardar sem mentor mostra "Seleccione um mentor."
- Unicidade: uma equipa só pode pertencer a UM mentor. Tentar atribuir uma equipa já usada por outro mentor bloqueia a gravação com o toast "Equipas já atribuídas a outro mentor: ..." (lista as equipas em conflito).
- Criar uma segunda configuração para um mentor que já existe é bloqueado com "Já existe uma configuração de equipas para o mentor ...".
- Editar: clicar numa linha reabre o diálogo com o mentor bloqueado (não editável) e as equipas pré-preenchidas; só as equipas podem mudar.
- Eliminar: o diálogo de edição oferece "Eliminar" com confirmação; após eliminar, a equipa volta a ficar livre e novas submissões dessa equipa seguem o fluxo partilhado.
- Após qualquer gravação/edição/eliminação, a lista actualiza e o pré-encaminhamento reflecte a nova configuração na submissão seguinte.
