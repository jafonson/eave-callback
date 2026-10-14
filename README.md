# Eave bank callback page

The static page Enable Banking sends a person back to after they approve at their bank. It bounces `code` and `state` into
the app (`eave://bank/callback`). If the app doesn't take over (another browser), after 2 s it completes the link itself
through the `bank-link-complete` Edge Function and shows the result. It hides `code` and `state` from the address bar at
once, loads nothing from third parties, and never shows a balance, an account number or a name.

- `index.html`: the page. `callback.js`: its logic (pure functions plus the page wiring). `privacy/`, `terms/`: placeholders.
- Tests: `pnpm callback:test` (`node --test`, part of `pnpm test`).

## Publishing

GitHub Pages can't serve a subfolder of the private `jafonson/eave` repository, so this folder is **copied** to the public
repository `jafonson/eave-callback`, whose Pages setting serves the `main` branch root at
<https://jafonson.github.io/eave-callback/>. Copy the folder's contents (not the folder, not this README's tests) to that
repository's root, commit and push; Pages redeploys in a minute. That URL (with a trailing slash) is `EB_REDIRECT_URL`.

The page calls `bank-link-complete` from the origin `https://jafonson.github.io`, which the function's CORS allows. The
publishable key in `callback.js` is public by design. If the project ref or key changes, update `callback.js` and the
`connect-src` in `index.html`.

`pnpm callback:test` passes `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`: `callback.js` is an ES module, but the folder has
no `package.json` (it would become a pnpm workspace package and need a lockfile entry), and the page itself doesn't care.
