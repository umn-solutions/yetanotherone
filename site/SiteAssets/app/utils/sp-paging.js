/**
 * Standard options for full-list scans via ListApi.getItems.
 *
 * SharePoint on-prem REST CAML paging requires an explicit OrderBy on an
 * indexed field for the response to include ListItemCollectionPosition.
 * Without it, SP omits the paging cursor and getItems caps at one page
 * (500 items by default). ID is auto-indexed on every list, so it is the
 * safest, cheapest OrderBy.
 *
 * Usage:
 *   listApi.getItems(undefined, FULL_SCAN);
 *   listApi.getItems(query, { ...FULL_SCAN, viewFields: ['Foo', 'Bar'] });
 *   listApi.getItems(query, { ...FULL_SCAN, orderBy: [{ field: 'Title' }] });
 */
export const FULL_SCAN = {
  limit: Infinity,
  orderBy: [{ field: 'ID' }],
};
