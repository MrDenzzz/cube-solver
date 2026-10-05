/** Joins the class names that are set. */
export function cx(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter((name) => typeof name === 'string' && name.length > 0).join(' ');
}
