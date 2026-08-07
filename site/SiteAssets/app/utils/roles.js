import { ContextStore } from '../libs/nofbiz/nofbiz.base.js';
import { getCachedTeamOptions } from './org-hierarchy-api.js';
import { emailEquals } from './email-helpers.js';

export const ROLES = {
  COLABORADOR: 'colaborador',
  GESTOR: 'gestor',
  MENTOR: 'mentor',
  MENTOR_MANAGER: 'mentor-manager',
};

export const PERMISSION_MAP = {
  inicio: ['*'],
  instrucoes: ['*'],
  pessoal: ['colaborador', 'mentor', 'mentor-manager'],
  geral: ['colaborador', 'gestor', 'mentor', 'mentor-manager'],
  mentoria: ['mentor', 'mentor-manager'],
  gestor: ['gestor'],
  catalogo: ['*'],
  dashboard: ['mentor', 'mentor-manager'],
  admin: ['mentor', 'mentor-manager'],
  submeter: ['colaborador', 'mentor', 'mentor-manager'],
  aprovar_projecto: ['mentor', 'mentor-manager'],
  validar_savings_auto: ['gestor'],
  validar_savings_final: ['mentor', 'mentor-manager'],
  validar_implementacao_final: ['mentor-manager'],
  solicitar_revisao: ['gestor', 'mentor', 'mentor-manager'],
  rejeitar: ['gestor', 'mentor', 'mentor-manager'],
  cancelar_proprio: ['colaborador', 'gestor', 'mentor', 'mentor-manager'],
  eliminar_proprio: ['colaborador', 'gestor', 'mentor', 'mentor-manager'],
  editar: ['colaborador', 'gestor', 'mentor', 'mentor-manager'],
  administracao: ['mentor', 'mentor-manager'],
  // Sharing an initiative with collaborate (write) access. Gestores are excluded --
  // they may only grant read access.
  partilhar_colaborar: ['colaborador', 'mentor', 'mentor-manager'],
};

/**
 * Returns the current user's OUID from ContextStore (set during app init).
 * @returns {string}
 */
export function getUserOUID() {
  return ContextStore.get('userOUID') || '';
}

/**
 * Returns the current user's DeptAncestorPath from ContextStore (set during app init).
 * @returns {string}
 */
export function getUserDeptAncestorPath() {
  return ContextStore.get('userDeptAncestorPath') || '';
}

/**
 * Checks if the current user has a specific role.
 * @param {string} role
 * @returns {boolean}
 */
export function hasProfile(role) {
  const roles = ContextStore.get('userRoles') || [];
  return roles.includes(role);
}

/**
 * Checks if the current user has at least one of the given roles.
 * @param {string[]} roles
 * @returns {boolean}
 */
export function hasAnyProfile(roles) {
  const userRoles = ContextStore.get('userRoles') || [];
  return roles.some(r => userRoles.includes(r));
}

/**
 * Checks if the current user can access a given area based on PERMISSION_MAP.
 * @param {string} area
 * @returns {boolean}
 */
export function canAccess(area) {
  const perms = PERMISSION_MAP[area];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  const userRoles = ContextStore.get('userRoles') || [];
  return userRoles.some(r => perms.includes(r));
}

/**
 * Returns the current user's roles array.
 * @returns {string[]}
 */
export function getUserRoles() {
  return ContextStore.get('userRoles') || [];
}

/**
 * Checks if a user belongs to a specific SharePoint group.
 * @param {CurrentUser} user
 * @param {string} groupTitle
 * @returns {boolean}
 */
export function isInGroup(user, groupTitle) {
  const groups = user.get('groups') || [];
  return groups.some(g => g.Title === groupTitle);
}

/**
 * Returns the full team label for an OUID code, or the code itself as fallback.
 * @param {string} ouid
 * @returns {string}
 */
export function getTeamLabel(ouid) {
  const opts = getCachedTeamOptions();
  return opts?.find(t => t.value === ouid)?.label || ouid;
}

export function getTeamName(ouid) {
  const label = getTeamLabel(ouid);
  return label?.split(' - ')[1] ?? label;
}

/**
 * Returns true if the current user has the mentor or mentor-manager role.
 * Mentors have total cross-team visibility (all initiatives, including confidential ones).
 * @returns {boolean}
 */
export function isMentorUser() {
  return hasAnyProfile([ROLES.MENTOR, ROLES.MENTOR_MANAGER]);
}

/**
 * Returns true when the current user is authorized to manage (share/revoke) access
 * to the given initiative. Authorized if any of the following:
 *  - They are the initiative owner (SubmittedByEmail == currentEmail)
 *  - They have 'collaborate' delegated access (passed as shareType)
 *  - They hold a privileged role (mentor, mentor-manager) per PERMISSION_MAP
 * @param {string} currentEmail
 * @param {Object} initiative
 * @param {string|null} shareType - 'collaborate', 'read', or null
 * @returns {boolean}
 */
export function canManageAccess(currentEmail, initiative, shareType) {
  if (emailEquals(initiative.SubmittedByEmail, currentEmail)) return true;
  if (shareType === 'collaborate') return true;
  if (hasAnyProfile([ROLES.MENTOR, ROLES.MENTOR_MANAGER, ROLES.GESTOR])) return true;
  return false;
}
