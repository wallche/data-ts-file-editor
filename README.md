# Data.TS Content Editor

A small Next.js app that turns a `data.ts` (or `.tsx`/`.js`/`.jsx`) file exporting an array of objects into an editable form UI — so non-developers (or anyone who'd rather not hand-edit TypeScript) can update content and export a file that still looks like it was written by hand.

Upload a file, edit the generated fields, and download the result with the rest of the file — formatting, imports, comments, everything outside the array — left untouched.

**Live demo:** [v0-data-ts.vercel.app](https://v0-data-ts.vercel.app/)

## How it works

1. **Upload** a file that has a top-level exported array, e.g.:
   ```ts
   export default [
     { title: "Hello", published: true, views: 42 },
     { title: "World", published: false, views: 7 },
   ]
   ```
   or `export const data = [ ... ]`.
2. The file is parsed with `@babel/parser` (TypeScript-aware) to locate the exported array's exact source range, then the array contents are parsed with `JSON5` (falling back to a sandboxed `Function` eval for anything JSON5 can't handle, e.g. unquoted keys with trailing logic).
3. Each item becomes a card with a field per property:
   - Strings → text input (or textarea for longer values)
   - Numbers → numeric input
   - Booleans → toggle switch
   - Arrays/objects → collapsible, recursively editable sections
   - Image-looking string values (URLs ending in common image extensions, or containing `image`/`img`) get a live preview
4. You can add or delete items, and add entries to nested arrays.
5. **Download** splices your edited array back into the *original* source text at the exact character range it came from, so everything else in the file (imports, other exports, comments, formatting) is preserved byte-for-byte.

## Features

- AST-based parsing — works with real TypeScript syntax, not just JSON
- Round-trips key quoting style (quoted vs. unquoted object keys) to match the original file
- Non-destructive: only the array contents change, the rest of the file is untouched
- Inline image previews, toggleable
- No backend, no database — everything happens client-side in the browser

## Getting started

```bash
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

Other scripts: `pnpm build`, `pnpm start`, `pnpm lint`.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + React 19 + TypeScript
- [@babel/parser](https://babeljs.io/docs/babel-parser) for AST parsing, [JSON5](https://json5.org/) for lenient value parsing
- Tailwind CSS + [shadcn/ui](https://ui.shadcn.com/)-style components (Radix UI primitives)
- Originally scaffolded with [v0](https://v0.dev)

## Limitations

- Only the **first** top-level exported array in the file is detected and made editable (`export default [...]` or `export const x = [...]`).
- Works best when array items share a similar shape; adding a new item copies the keys from the first item.
- This is a personal side project / experiment, not a hardened tool — expect rough edges.

## Contributing

Suggestions and bug reports are welcome — open an issue or a PR.
