/**
 * Who a packing or shopping item is for, any number of people (2B-0). Purely additive: one new
 * table, filled from the one-person `list_items.traveller_id` every item had until now, so each
 * existing assignment carries over exactly. That column is left as it was — never cleared, no
 * longer read — so nothing already saved is lost.
 *
 * A recipient goes when its profile is deleted (CASCADE), as `traveller_id` cleared itself
 * (SET NULL) before: deleting someone was never blocked by a list.
 */
export const sql = /* sql */ `
CREATE TABLE list_item_recipients (
  list_item_id TEXT NOT NULL REFERENCES list_items(id) ON DELETE CASCADE,
  traveller_id TEXT NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  PRIMARY KEY (list_item_id, traveller_id)
);

CREATE INDEX idx_list_item_recipients_traveller ON list_item_recipients(traveller_id);

INSERT OR IGNORE INTO list_item_recipients (list_item_id, traveller_id)
SELECT li.id, li.traveller_id
  FROM list_items li
  JOIN travellers t ON t.id = li.traveller_id
 WHERE li.traveller_id IS NOT NULL;
`;
