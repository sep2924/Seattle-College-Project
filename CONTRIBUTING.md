# Working on Seattle Central Community

Thanks for helping! This is an anonymous community site for Seattle Central College students (seattletigers.com).
Please read this once before you start.

## 1. Run the site on your computer

You need **Git** and **Python 3**.

```
git clone https://github.com/sep2924/Seattle-College-Project.git
cd "Seattle-College-Project/Seattle central Project/seattle-central-community"
python3 -m http.server 8000
```

Open **http://localhost:8000** in your browser.

### Demo mode (important)

On your own computer the site automatically uses **fake demo data** and shows a yellow
"Demo mode" note at the top. Nothing you post, like or delete reaches the real site,
so feel free to test anything.

- Demo data lives in your browser. To start fresh, clear the site data for localhost.
- Only the project owner should ever add `?live=1` to the address (it uses the real database).
  Add `?live=0` to go back to demo mode.

## 2. How we work together

`main` is what's live on seattletigers.com. **Never push straight to `main`.**

1. Get the latest code first:
   ```
   git checkout main
   git pull
   ```
2. Make a branch for your task (use the issue number):
   ```
   git checkout -b 12-dark-mode
   ```
3. Make your changes, then save them:
   ```
   git add .
   git commit -m "Short description of what changed"
   git push -u origin 12-dark-mode
   ```
4. On GitHub, open a **Pull Request** into `main` and link the issue (write `Closes #12`).
5. Enoch reviews it. Once it's merged, the live site updates automatically in a few minutes.

## 3. Picking a task

- Tasks are in the **Issues** tab. Assign yourself before you start so we don't do the same thing twice.
- If something is unclear, ask in the issue's comments.
- Small, focused Pull Requests are easier to review than big ones.

## 4. How the code is organized

```
seattle-central-community/
  index.html       the page structure (all pages live in one file)
  script.js        what the site does (pages, clicks, rendering)
  style.css        how it looks
  js/store.js      saving and loading data (demo data or Supabase)
  js/config.js     site settings and the public Supabase key
  sw.js            offline cache; bump CACHE_NAME when you change files
  supabase-*.sql   database changes, run by Enoch in Supabase
```

- Plain HTML, CSS and JavaScript. No frameworks or build step.
- Pages switch with the address hash, like `#home`, `#board`, `#tools`.

## 5. Before you open a Pull Request

- Test on a **phone-sized** window and a **computer-sized** one. Nothing should scroll sideways.
- Check the browser Console has no red errors.
- If you changed `index.html`, `script.js`, `style.css` or `js/store.js`, bump `CACHE_NAME` in `sw.js`
  (for example `scc-shell-v15` → `scc-shell-v16`) so people get the new version.
- If your change needs a database change, add a new `supabase-<name>.sql` file and say so in the Pull Request.
  Enoch runs it in Supabase after merging.

## 6. Privacy rules (always)

This site promises students anonymity. Please:

- Never show, log or try to find out who wrote a post or comment.
- Never put real student data in screenshots, issues or Pull Requests. Use demo data.
- Never add the Supabase **secret / service_role** key anywhere in the code.
  (The key in `js/config.js` is the public "anon" key and is safe to be in the code.)

## 7. Credit

Everyone who contributes is credited on the project. Thank you!
