// Schema definitions for the Place app's SharePoint lists.
//
// Field shape (matches ListApi.createField + setup/scan.js consumers):
//   { title, multiline?, indexed?, builtIn? }
//
// - title:     SharePoint InternalName
// - multiline: true => Note (multi-line text), default Text
// - indexed:   request CAML index on this column
// - builtIn:   skip field creation (SP auto-provisions Title); index still verified

export const APP_URL = 'SitePages/app.aspx';

export const SCHEMA = {
  Initiatives: [
    { title: 'Title', indexed: true, builtIn: true },
    { title: 'UUID', indexed: true },
    { title: 'Description', multiline: true },
    { title: 'Objective', multiline: true },
    { title: 'Status', indexed: true },
    { title: 'PreviousStatus' },
    { title: 'ImpactedTeamOUID', indexed: true },
    { title: 'IsConfidential' },
    { title: 'SubmittedBy', multiline: true },
    { title: 'SubmittedByEmail', indexed: true },
    { title: 'Mentor', multiline: true },
    { title: 'MentorEmail', indexed: true },
    { title: 'GestorValidator', multiline: true },
    { title: 'GestorValidatorEmail', indexed: true },
    { title: 'Tags', multiline: true },
    { title: 'SubmittedDate' },
    { title: 'ImplementedDate' },
    { title: 'ExpectedEndDate' },
    { title: 'FinalValidationLabel' },
  ],

  InitiativesFinancials: [
    { title: 'Title', indexed: true, builtIn: true },
    { title: 'UUID', indexed: true },
    { title: 'InitiativeUUID', indexed: true },
    { title: 'TimePeriod' },
    { title: 'SavingType' },
    { title: 'SavingCategory', multiline: true },
    { title: 'EnabledCategories', multiline: true },
    { title: 'EficienciaData', multiline: true },
    { title: 'ProducaoData', multiline: true },
    { title: 'GastosGeraisData', multiline: true },
    { title: 'ReducaoRiscoData', multiline: true },
    { title: 'ReducaoCustoData', multiline: true },
    { title: 'QualidadeData', multiline: true },
    { title: 'FTEAnnualCost' },
    { title: 'LastModifiedBy', multiline: true },
    { title: 'LastModifiedByEmail' },
    { title: 'LastModifiedDate' },
  ],

  Comments: [
    { title: 'Title', indexed: true, builtIn: true },
    { title: 'UUID' },
    { title: 'InitiativeUUID', indexed: true },
    { title: 'CommentAuthor', multiline: true },
    { title: 'Body', multiline: true },
    { title: 'CommentDate' },
  ],

  InitiativeEvents: [
    { title: 'Title', indexed: true, builtIn: true },
    { title: 'UUID', indexed: true },
    { title: 'InitiativeUUID', indexed: true },
    { title: 'EventType', indexed: true },
    { title: 'FromStatus' },
    { title: 'ToStatus' },
    { title: 'Comment', multiline: true },
    { title: 'Actor', multiline: true },
    { title: 'ActorEmail', indexed: true },
    { title: 'Date' },
    { title: 'ValidationLabel' },
  ],

  Notifications: [
    { title: 'Title', indexed: true, builtIn: true },
    { title: 'UUID' },
    { title: 'InitiativeUUID', indexed: true },
    { title: 'Recipient', indexed: true },
    { title: 'Type' },
    { title: 'IsRead', indexed: true },
    { title: 'CreatedDate', indexed: true },
  ],

  OrgHierarchy: [
    { title: 'Title', indexed: true, builtIn: true },
    { title: 'ShortName' },
    { title: 'ManagerId', indexed: true },
    { title: 'Email', indexed: true },
    { title: 'Category' },
    { title: 'Direcao' },
    { title: 'Departamento' },
    { title: 'OUID', indexed: true },
    { title: 'OUDesc' },
    { title: 'AncestorPath', multiline: true },
    { title: 'DeptAncestorPath', multiline: true },
    { title: 'Depth' },
    { title: 'AppRole' },
  ],

  SavingsTargets: [
    { title: 'Title', indexed: true, builtIn: true },
    { title: 'FTETarget' },
    { title: 'CategoryTargets', multiline: true },
    { title: 'LastModifiedBy', multiline: true },
    { title: 'LastModifiedByEmail' },
    { title: 'LastModifiedDate' },
  ],

  MentorTeams: [
    { title: 'Title', indexed: true, builtIn: true },       // stores MentorEmail (one record per mentor)
    { title: 'MentorEmail', indexed: true },
    { title: 'Mentor', multiline: true },                   // JSON UserIdentity {email, displayName}
    { title: 'Teams', multiline: true },                    // JSON array of team OUID strings
    { title: 'LastModifiedBy', multiline: true },
    { title: 'LastModifiedByEmail' },
    { title: 'LastModifiedDate' },
  ],

  InitiativesSharedAccess: [
    { title: 'Title', indexed: true, builtIn: true },
    { title: 'UUID' },
    { title: 'InitiativeUUID', indexed: true },
    { title: 'SharedWith', multiline: true },
    { title: 'SharedWithEmail', indexed: true },
    { title: 'SharedBy', multiline: true },
    { title: 'SharedByEmail' },
    { title: 'Type' },
    { title: 'Status', indexed: true },
    { title: 'SharedDate' },
  ],
};

// SP-system fields scan should ignore as EXTRA. Title is per-list builtIn in
// SCHEMA so its index state remains verifiable -- intentionally not in this set.
export const BUILTIN_FIELDS = new Set([
  'ID',
  'ContentType', 'ContentTypeId',
  'Created', 'Modified', 'Author', 'Editor',
  '_UIVersionString',
  'FileLeafRef', 'FileRef', 'FileDirRef', 'FileSystemObjectType',
  'GUID', 'UniqueId',
  'Attachments', 'Edit',
  'LinkTitle', 'LinkTitleNoMenu', 'LinkTitle2',
  'DocIcon', 'Order',
  'AppAuthor', 'AppEditor', 'WorkflowVersion',
  '_ModerationStatus', '_ModerationComments', '_Level', '_IsCurrentVersion',
  'ItemChildCount', 'FolderChildCount', 'owshiddenversion', 'ScopeId',
  'PermMask', 'InstanceID',
  'ServerUrl', 'EncodedAbsUrl', 'BaseName',
  'MetaInfo', 'Restricted', 'OriginatorId', 'NoExecute', 'ContentVersion',
  'ParentVersionString', 'ParentLeafName', 'SortBehavior',
  'SMTotalSize', 'SMLastModifiedDate', 'SMTotalFileStreamSize', 'SMTotalFileCount',
]);
