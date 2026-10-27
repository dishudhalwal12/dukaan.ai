/**
 * Title and description for a public page.
 *
 * The app is a single page bundle, so every route ships the same <title>. Search
 * engines and link previews read the title of whatever page they land on, which
 * is why the public pages set their own. Guarded for the node test runs.
 */
export function setPageMeta({ title, description }: { title: string; description?: string }): void {
  if (typeof document === 'undefined') return;
  if (title) document.title = title;
  if (!description) return;

  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'description');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', description);
}
