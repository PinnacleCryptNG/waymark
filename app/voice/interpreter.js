// The slot where "understanding what was said" plugs in.
// Today: the rule-based reader in intent.js, which runs on the phone with no network.
// Next: a Claude-backed reader on a small server, returning the same intent shapes.
// Either way the result is only a request; dialog.js and the bank boundary decide what happens.

import { parseIntent } from './intent.js';

/** interpret(text, { beneficiaries, banks }) -> Promise<intent> */
export function createRuleInterpreter() {
  return {
    name: 'rules',
    interpret: async (text, ctx) => parseIntent(text, ctx),
  };
}
