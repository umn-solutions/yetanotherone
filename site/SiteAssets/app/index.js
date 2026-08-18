import {
	pageReset,
	Router,
	CurrentUser,
	ContextStore,
	SiteApi,
	StyleResource,
	Toast,
	SystemError,
} from "./libs/nofbiz/nofbiz.base.js";
import { getByEmail, getAllEmployees, deriveRoles } from "./utils/org-hierarchy-api.js";
import { canAccess, isInGroup } from "./utils/roles.js";
import { BOOTSTRAP_ADMIN_GROUP } from "./utils/constants.js";

await pageReset({
	clearConsole: false,
});

function impersonateUser(currentUserEmails = [], impersonatedUserEmail = "") {
	let targetUser = currentUserEmails.includes(_spPageContextInfo?.userEmail)
		? impersonatedUserEmail
		: "";

	return new CurrentUser().initialize([], { targetUser });
}

const appStyles = new StyleResource("@/css/styles.css");
const placeTheme = new StyleResource("@/css/place-theme.css");
const [, , user] = await Promise.all([
	appStyles.ready,
	placeTheme.ready,
	impersonateUser([""], ""),
]);

const siteApi = new SiteApi();
ContextStore.set("siteApi", siteApi);
ContextStore.set("currentUser", user);

let employee = null;
let allOrgEmployees = null;
let userRoles = ["colaborador"];
let userOUID = "";
let userDeptAncestorPath = "";

try {
	const [byEmail, allEmp] = await Promise.all([
		getByEmail(user.get("email")),
		getAllEmployees(),
	]);
	employee = byEmail[0] || null;
	allOrgEmployees = allEmp;
} catch {
	// OrgHierarchy list may not exist yet
}

if (employee) {
	userRoles = deriveRoles(employee, allOrgEmployees);
	userOUID = employee.OUID || "";
	userDeptAncestorPath = employee.DeptAncestorPath || "";
} else if (isInGroup(user, BOOTSTRAP_ADMIN_GROUP)) {
	userRoles = ["mentor", "gestor", "colaborador"];
	ContextStore.set("isBootstrapMode", true);
}

if (!employee && !ContextStore.has("isBootstrapMode")) {
	throw new SystemError(
		"UserNotFound",
		"Utilizador não encontrado na hierarquia organizacional. Contacte o administrador.",
	);
}

ContextStore.set("userRoles", userRoles);
ContextStore.set("userOUID", userOUID);
ContextStore.set("userDeptAncestorPath", userDeptAncestorPath);

const allRoutes = [
	"instrucoes",
	"pessoal",
	"geral",
	"mentoria",
	"gestor",
	"catalogo",
	"dashboard",
	"admin",
];
const routes = allRoutes.filter(canAccess);

ContextStore.set("routes", routes);

new Router(routes);

if (ContextStore.has("isBootstrapMode")) {
	Toast.warning(
		"Modo bootstrap: acesso via grupo SharePoint. Importe a hierarquia na pagina Configuracao.",
	);
}
