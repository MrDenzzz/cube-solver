export type Page = 'solver' | 'bench';

/** Pages are chosen by the URL hash, so the static host needs no routes of its own. */
export const PAGE_HASH: Readonly<Record<Page, string>> = { solver: '#/', bench: '#/bench' };
