import { Button } from '../libs/nofbiz/nofbiz.base.js';

import { STATUS } from './status-helpers.js';
import { canAccess, canManageAccess } from './roles.js';
import {
  submitInitiative,
  resubmitInitiative,
  cancelInitiative,
  deleteInitiative,
  approveProject,
  rejectInitiative,
  requestRevision,
  startExecution,
  approveSavings,
  mentorFinalValidation,
  mentorManagerValidation,
  transferOwnership,
  manageAccessAction,
  declareSavings,
} from './workflow-actions.js';
import { openEditInitiativeModal, openReplicateInitiativeModal } from './new-initiative.js';

/**
 * Builds context-sensitive workflow action buttons for an initiative.
 *
 * @param {Object} params
 * @param {Object} params.initiative
 * @param {string} params.context - 'pessoal' | 'mentoria' | 'gestor' | 'catalogo'
 * @param {boolean} params.isOwner
 * @param {boolean} [params.hasWriteAccess] - true when caller is owner OR active collaborator. Defaults to isOwner.
 * @param {string} params.status
 * @param {{ close: () => void }} params.closable - panel/modal to close on action success
 * @param {() => void} [params.onSuccess]
 * @param {boolean} [params.canAct=true]
 * @param {string} [params.currentEmail]
 * @param {boolean} [params.excludeEdit=false] - omit Editar/Rever/Submeter/Re-submeter (caller is an edit form)
 * @param {boolean} [params.excludeShare=false] - omit Partilhar
 * @param {boolean} [params.approvalsOnly=false] - only forward workflow actions (Aprovar/Validar/Submeter/etc); drop Cancelar/Rejeitar/Solicitar Revisão/Transferir/Eliminar/Replicar
 * @param {'collaborate'|'read'|null} [params.shareType=null] - the current user's delegated share type for this initiative
 * @param {(() => Promise<boolean>) | null} [params.beforeAction=null] - optional async gate that runs before
 *   every transition/action click handler. If it resolves to false the action is aborted. When null (default)
 *   the click handlers run directly with no pre-step. Used by the approver edit modal to flush and persist
 *   form edits before advancing the workflow status.
 * @returns {Button[]}
 */
export function buildWorkflowButtons({
  initiative,
  context,
  isOwner,
  hasWriteAccess,
  status,
  closable,
  onSuccess,
  canAct = true,
  currentEmail,
  excludeEdit = false,
  excludeShare = false,
  approvalsOnly = false,
  shareType = null,
  beforeAction = null,
}) {
  const buttons = [];
  const writeAccess = hasWriteAccess ?? isOwner;
  const TERMINAL_STATUSES = [STATUS.IMPLEMENTADO, STATUS.REJEITADO, STATUS.CANCELADO];

  const handleSuccess = () => {
    if (closable && typeof closable.close === 'function') closable.close();
    if (onSuccess) onSuccess();
  };

  // Wraps a workflow-action function with the optional beforeAction gate.
  // When beforeAction is null this is a transparent pass-through.
  // When beforeAction is provided, it is awaited first; a false return value aborts the action.
  const runAction = (fn) => beforeAction
    ? async (...args) => { if (!(await beforeAction())) return; return fn(...args); }
    : fn;

  if (context === 'pessoal' && writeAccess) {
    if (status === STATUS.RASCUNHO) {
      if (!excludeEdit && canAccess('submeter')) {
        const submitBtn = new Button('Submeter', {
          variant: 'primary',
          onClickHandler: runAction(() => submitInitiative(initiative, submitBtn, handleSuccess)),
        });
        buttons.push(submitBtn);
      }
      if (!excludeEdit && canAccess('editar')) {
        const editBtn = new Button('Editar', {
          variant: 'secondary',
          onClickHandler: () => {
            closable.close();
            openEditInitiativeModal(initiative, onSuccess, { context, currentEmail, hasWriteAccess: writeAccess });
          },
        });
        buttons.push(editBtn);
      }
      if (!approvalsOnly && canAccess('eliminar_proprio')) {
        const deleteBtn = new Button('Eliminar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => deleteInitiative(initiative, deleteBtn, handleSuccess)),
        });
        buttons.push(deleteBtn);
      }
    } else if (status === STATUS.SUBMETIDO) {
      if (!excludeEdit && canAccess('editar')) {
        const editBtn = new Button('Editar', {
          variant: 'secondary',
          onClickHandler: () => {
            closable.close();
            openEditInitiativeModal(initiative, onSuccess, { context, currentEmail, hasWriteAccess: writeAccess });
          },
        });
        buttons.push(editBtn);
      }
      if (!approvalsOnly && canAccess('cancelar_proprio')) {
        const cancelBtn = new Button('Cancelar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => cancelInitiative(initiative, cancelBtn, handleSuccess)),
        });
        buttons.push(cancelBtn);
      }
    } else if (status === STATUS.VALIDADO_MENTOR) {
      const startBtn = new Button('Declarar Início Execução', {
        variant: 'primary',
        onClickHandler: runAction(() => startExecution(initiative, startBtn, handleSuccess)),
      });
      buttons.push(startBtn);
      if (!approvalsOnly && canAccess('cancelar_proprio')) {
        const cancelBtn = new Button('Cancelar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => cancelInitiative(initiative, cancelBtn, handleSuccess)),
        });
        buttons.push(cancelBtn);
      }
    } else if (status === STATUS.EM_EXECUCAO) {
      const savingsBtn = new Button('Solicitar Validação', {
        variant: 'primary',
        onClickHandler: runAction(() => declareSavings(initiative, savingsBtn, handleSuccess)),
      });
      buttons.push(savingsBtn);
      if (!excludeEdit && canAccess('editar')) {
        const editBtn = new Button('Editar', {
          variant: 'secondary',
          onClickHandler: () => {
            closable.close();
            openEditInitiativeModal(initiative, handleSuccess, { context, currentEmail, hasWriteAccess: writeAccess });
          },
        });
        buttons.push(editBtn);
      }
      if (!approvalsOnly && canAccess('cancelar_proprio')) {
        const cancelBtn = new Button('Cancelar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => cancelInitiative(initiative, cancelBtn, handleSuccess)),
        });
        buttons.push(cancelBtn);
      }
    } else if (status === STATUS.EM_REVISAO) {
      const reviewBtn = (!excludeEdit && canAccess('editar')) ? new Button('Rever', {
        variant: 'secondary',
        onClickHandler: () => {
          closable.close();
          openEditInitiativeModal(initiative, handleSuccess, { context, currentEmail, hasWriteAccess: writeAccess });
        },
      }) : null;
      const resubmitBtn = (!excludeEdit && canAccess('editar')) ? new Button('Re-submeter', {
        variant: 'primary',
        onClickHandler: runAction(() => resubmitInitiative(initiative, resubmitBtn, handleSuccess)),
      }) : null;
      const cancelBtn = (!approvalsOnly && canAccess('cancelar_proprio')) ? new Button('Cancelar', {
        variant: 'danger',
        isOutlined: true,
        onClickHandler: runAction(() => cancelInitiative(initiative, cancelBtn, handleSuccess)),
      }) : null;
      if (reviewBtn) buttons.push(reviewBtn);
      if (resubmitBtn) buttons.push(resubmitBtn);
      if (cancelBtn) buttons.push(cancelBtn);
    } else if (status === STATUS.POR_VALIDAR || status === STATUS.VALIDADO_GESTOR) {
      if (!approvalsOnly && canAccess('cancelar_proprio')) {
        const cancelBtn = new Button('Cancelar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => cancelInitiative(initiative, cancelBtn, handleSuccess)),
        });
        buttons.push(cancelBtn);
      }
    } else if (status === STATUS.VALIDADO_FINAL) {
      if (!approvalsOnly && canAccess('cancelar_proprio')) {
        const cancelBtn = new Button('Cancelar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => cancelInitiative(initiative, cancelBtn, handleSuccess)),
        });
        buttons.push(cancelBtn);
      }
    }

    // Transfer ownership: available at any non-terminal status for any user with write access.
    if (!approvalsOnly && !TERMINAL_STATUSES.includes(status)) {
      const transferBtn = new Button('Transferir', {
        variant: 'secondary',
        onClickHandler: runAction(() => transferOwnership(initiative, transferBtn, handleSuccess)),
      });
      buttons.push(transferBtn);
    }
  }

  if (context === 'mentoria' && canAct) {
    if (status === STATUS.SUBMETIDO) {
      if (canAccess('aprovar_projecto')) {
        const approveBtn = new Button('Aprovar', {
          variant: 'primary',
          onClickHandler: runAction(() => approveProject(initiative, approveBtn, handleSuccess)),
        });
        buttons.push(approveBtn);
      }
      if (!excludeEdit && canAccess('editar')) {
        const editBtn = new Button('Editar', {
          variant: 'secondary',
          onClickHandler: () => {
            closable.close();
            openEditInitiativeModal(initiative, onSuccess, { asApprover: true, context, currentEmail });
          },
        });
        buttons.push(editBtn);
      }
      if (!approvalsOnly && canAccess('rejeitar')) {
        const rejectBtn = new Button('Rejeitar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => rejectInitiative(initiative, rejectBtn, handleSuccess)),
        });
        buttons.push(rejectBtn);
      }
      if (!approvalsOnly && canAccess('solicitar_revisao')) {
        const revisionBtn = new Button('Solicitar Revisão', {
          variant: 'secondary',
          onClickHandler: runAction(() => requestRevision(initiative, revisionBtn, handleSuccess)),
        });
        buttons.push(revisionBtn);
      }
    } else if (status === STATUS.VALIDADO_GESTOR) {
      if (canAccess('validar_savings_final')) {
        const confirmBtn = new Button('Confirmar Savings', {
          variant: 'primary',
          onClickHandler: runAction(() => mentorFinalValidation(initiative, confirmBtn, handleSuccess)),
        });
        buttons.push(confirmBtn);
      }
      if (!excludeEdit && canAccess('editar')) {
        const editBtn = new Button('Editar', {
          variant: 'secondary',
          onClickHandler: () => {
            closable.close();
            openEditInitiativeModal(initiative, onSuccess, { asApprover: true, context, currentEmail });
          },
        });
        buttons.push(editBtn);
      }
      if (!approvalsOnly && canAccess('rejeitar')) {
        const rejectBtn = new Button('Rejeitar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => rejectInitiative(initiative, rejectBtn, handleSuccess)),
        });
        buttons.push(rejectBtn);
      }
      if (!approvalsOnly && canAccess('solicitar_revisao')) {
        const revisionBtn = new Button('Solicitar Revisão', {
          variant: 'secondary',
          onClickHandler: runAction(() => requestRevision(initiative, revisionBtn, handleSuccess)),
        });
        buttons.push(revisionBtn);
      }
    } else if (status === STATUS.VALIDADO_FINAL) {
      if (canAccess('validar_implementacao_final')) {
        const implConfirmBtn = new Button('Validar Implementação', {
          variant: 'primary',
          onClickHandler: runAction(() => mentorManagerValidation(initiative, implConfirmBtn, handleSuccess)),
        });
        buttons.push(implConfirmBtn);
      }
      if (!approvalsOnly && canAccess('rejeitar')) {
        const rejectBtn = new Button('Rejeitar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => rejectInitiative(initiative, rejectBtn, handleSuccess)),
        });
        buttons.push(rejectBtn);
      }
      if (!approvalsOnly && canAccess('solicitar_revisao')) {
        const revisionBtn = new Button('Solicitar Revisão', {
          variant: 'secondary',
          onClickHandler: runAction(() => requestRevision(initiative, revisionBtn, handleSuccess)),
        });
        buttons.push(revisionBtn);
      }
    }
  }

  if (context === 'gestor' && canAct) {
    if (status === STATUS.POR_VALIDAR) {
      if (canAccess('validar_savings_auto')) {
        const approveBtn = new Button('Aprovar Savings', {
          variant: 'primary',
          onClickHandler: runAction(() => approveSavings(initiative, approveBtn, handleSuccess)),
        });
        buttons.push(approveBtn);
      }
      if (!excludeEdit && canAccess('editar')) {
        const editBtn = new Button('Editar', {
          variant: 'secondary',
          onClickHandler: () => {
            closable.close();
            openEditInitiativeModal(initiative, onSuccess, { asApprover: true, context, currentEmail });
          },
        });
        buttons.push(editBtn);
      }
      if (!approvalsOnly && canAccess('rejeitar')) {
        const rejectBtn = new Button('Rejeitar', {
          variant: 'danger',
          isOutlined: true,
          onClickHandler: runAction(() => rejectInitiative(initiative, rejectBtn, handleSuccess)),
        });
        buttons.push(rejectBtn);
      }
      if (!approvalsOnly && canAccess('solicitar_revisao')) {
        const revisionBtn = new Button('Solicitar Revisão', {
          variant: 'secondary',
          onClickHandler: runAction(() => requestRevision(initiative, revisionBtn, handleSuccess)),
        });
        buttons.push(revisionBtn);
      }
    }
  }

  if (context === 'catalogo' && !approvalsOnly) {
    const replicateBtn = new Button('Replicar', {
      variant: 'secondary',
      onClickHandler: () => {
        closable.close();
        openReplicateInitiativeModal(initiative, onSuccess);
      },
    });
    buttons.push(replicateBtn);

    const isAssignedMentor = currentEmail && currentEmail === initiative.MentorEmail;
    if ((isOwner || isAssignedMentor) && canAccess('eliminar_proprio')) {
      const deleteBtn = new Button('Eliminar', {
        variant: 'danger',
        isOutlined: true,
        onClickHandler: runAction(() => deleteInitiative(initiative, deleteBtn, handleSuccess)),
      });
      buttons.push(deleteBtn);
    }
  }

  // Only authorized users may manage access: the owner, collaborate-access holders,
  // and privileged roles (mentor, mentor-manager, gestor). Read-only shared users
  // are excluded.
  if (!excludeShare && !approvalsOnly && context !== 'catalogo' && canManageAccess(currentEmail, initiative, shareType)) {
    const manageBtn = new Button('Gerir Acesso', {
      variant: 'secondary',
      isOutlined: true,
      onClickHandler: () => manageAccessAction(initiative, manageBtn, handleSuccess),
    });
    buttons.push(manageBtn);
  }

  return buttons;
}
