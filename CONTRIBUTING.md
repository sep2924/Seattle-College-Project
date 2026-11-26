# How to work on Seattle Central Community

Welcome! 👋 This guide assumes you've **never used Git or GitHub before**. Follow it from top to bottom
the first time. After that, you'll only need [Part 3: Every time you work](#part-3-every-time-you-work).

The website is **seattletigers.com**, an anonymous community site for Seattle Central College students.

---

## Words you'll see (read this first)

| Word | What it means |
|---|---|
| **Repository (repo)** | The project folder on GitHub, with all the code and its history. |
| **Clone** | Download the repo to your computer, once. |
| **Branch** | Your own copy of the code to try changes in, without touching the live website. |
| **Commit** | A saved checkpoint of your changes, with a short message saying what you did. |
| **Push** | Upload your commits from your computer to GitHub. |
| **Pull** | Download the newest changes from GitHub to your computer. |
| **Pull Request (PR)** | Asking "please add my changes to the website." Enoch reviews it first. |
| **Merge** | Accepting a Pull Request. The changes go live a few minutes later. |
| **`main`** | The branch that **is** the live website. You never change it directly. |
| **Terminal** | The app where you type commands. Mac: **Terminal**. Windows: **Git Bash** (comes with Git). |

---

## Part 1: One-time setup (about 20 minutes)

### Step 1. Make a GitHub account
1. Go to **github.com** and sign up (free).
2. Send your **GitHub username** to Enoch.
3. Watch your email for an invite to **Seattle-College-Project** and click **Accept invitation**.

### Step 2. Install the tools
You need three things. Install them in this order.

**a) Git** (saves and uploads your work)
- **Mac:** open **Terminal** and type `git --version`, then press Enter. If Git isn't installed, a window pops up asking to install "command line developer tools". Click **Install** and wait.
- **Windows:** download from **git-scm.com**, run the installer, and click **Next** on every screen (the default options are fine).

✅ **Check:** in Terminal (Mac) or Git Bash (Windows), type `git --version`. You should see something like `git version 2.x.x`.

**b) VS Code** (the code editor)
- Download from **code.visualstudio.com** and install it.

**c) Live Server** (shows the website on your computer)
1. Open VS Code.
2. Click the **Extensions** icon on the left (four little squares), or press `Cmd+Shift+X` (Mac) / `Ctrl+Shift+X` (Windows).
3. Search **Live Server** (by Ritwick Dey) and click **Install**.

### Step 3. Tell Git who you are
In Terminal / Git Bash, type these two lines, using your own name and the email of your GitHub account:
```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```
Nothing appears after you press Enter. That's normal, and it means it worked.

### Step 4. Download (clone) the project
1. In Terminal / Git Bash, go to your Desktop:
   ```
   cd ~/Desktop
   ```
2. Download the project:
   ```
   git clone https://github.com/sep2924/Seattle-College-Project.git
   ```
3. If a GitHub sign-in window pops up, sign in. You'll now have a folder called **Seattle-College-Project** on your Desktop.

✅ **Check:** the folder exists on your Desktop.

### Step 5. Open the website on your computer
1. Open VS Code → **File → Open Folder…**
2. Open this folder (it's inside the one you downloaded):
   **Seattle-College-Project → Seattle central Project → seattle-central-community**
3. Click **Go Live** in the bottom-right corner of VS Code.
4. Your browser opens the site, at an address like `http://127.0.0.1:5500`.

✅ **Check:** you see a **yellow note at the top**: *"Demo mode on your computer: fake data, nothing reaches the real site."*

> **What is demo mode?** On your computer, the site uses **fake practice data** that lives only in your browser.
> Sign up with any made-up email, post, like, and delete as much as you want. **Nothing reaches the real website.**
> If you don't see the yellow note, stop and message Enoch before doing anything else.

*(Don't want VS Code's Live Server? In Terminal, go into the `seattle-central-community` folder and run
`python3 -m http.server 8000` (Mac) or `py -m http.server 8000` (Windows), then open http://localhost:8000.)*

🎉 Setup done!

---

## Part 2: Pick a task

1. Go to the repo on GitHub → **Issues** tab.
2. Choose an issue. Good first ones have the `setup` or `design` label.
3. On the right side of the issue, click **Assignees → assign yourself**, so nobody else starts the same thing.
4. Remember the **issue number** (like **#4**). You'll use it below.

Not sure what an issue means? Ask in the issue's comments. Asking is always better than guessing.

---

## Part 3: Every time you work

Do these steps **every time**, in this order. The example uses issue **#4**. Swap in your own number and a few words about it.

### ① Get the newest code
In Terminal / Git Bash:
```
cd ~/Desktop/Seattle-College-Project
git checkout main
git pull
```
This makes sure you start from the latest version of the website.

### ② Make your own branch
```
git checkout -b 4-welcome-page
```
Name it **issue number + a few words**, with dashes instead of spaces.

✅ **Check:** Terminal says `Switched to a new branch '4-welcome-page'`.

### ③ Make your changes
- Edit the files in VS Code and **save** (`Cmd+S` / `Ctrl+S`).
- The browser tab from **Go Live** refreshes by itself, so you can see your change right away.
- Test the page **two ways**:
  1. **Phone size:** in the browser press `Cmd+Option+I` (Mac) / `F12` (Windows) → click the **phone icon** at the top of the panel.
  2. **Computer size:** the normal window.
- Look at the **Console** tab in that same panel. **Red errors** mean something broke.

### ④ Save a checkpoint (commit)
```
git add .
git commit -m "Match welcome page to new Home"
```
Write the message as **what you did**, in a few words. You can commit several times while you work.

### ⑤ Upload your branch (push)
```
git push -u origin 4-welcome-page
```
The first push of a branch needs `-u origin <branch name>`. After that, plain `git push` is enough.

### ⑥ Open a Pull Request on GitHub
1. Go to the repo on GitHub. A yellow box says **"4-welcome-page had recent pushes"**. Click **Compare & pull request**.
2. **Title:** what you did, e.g. *Match welcome page to new Home*.
3. **Description:** fill in this template:
   ```
   Closes #4

   What I changed:
   - ...

   How I tested:
   - Phone size: ✅
   - Computer size: ✅
   - No red errors in Console: ✅

   Screenshot:
   (drag a screenshot here)
   ```
   `Closes #4` makes GitHub close the issue automatically when it's merged.
4. Click **Create pull request**.

### ⑦ Wait for review
- Enoch looks at it and either **merges** it or leaves comments.
- **If there are comments:** make the changes on the **same branch**, then:
  ```
  git add .
  git commit -m "Fix review comments"
  git push
  ```
  The Pull Request updates by itself. No need to open a new one.
- **After it's merged:** the live website updates in a few minutes. 🎉
  Go back to `main` and start your next task from ① again:
  ```
  git checkout main
  git pull
  ```

---

## Where things are in the code

All website files are in **`Seattle central Project/seattle-central-community/`**.

| File | What it does | Change it when you want to… |
|---|---|---|
| `index.html` | The structure of every page | add a button, a box, or a new section |
| `style.css` | How everything looks | change colors, fonts, spacing, sizes |
| `script.js` | What happens when you click, and how pages are built | change behavior or the content of a page |
| `js/store.js` | Saving and loading data | ask Enoch first |
| `js/config.js` | Site settings and the public database key | don't change it |
| `sw.js` | Lets the site load offline | update it every time (see below) |
| `supabase-*.sql` | Database changes | add a new file only if your task needs one |

**Tips**
- **Colors and fonts** are at the very top of `style.css`, in the `:root { ... }` block. Change one there and it changes across the whole site.
- **Pages** switch with the end of the address: `#home`, `#board`, `#tools`, `#my`. Type one into the address bar to jump straight to it.
- **Find something fast:** in VS Code press `Cmd+Shift+F` / `Ctrl+Shift+F` and search for text you see on the page (like `Plan your classes`). It shows you exactly which file and line it's in.
- **No frameworks.** It's plain HTML, CSS, and JavaScript, so there's nothing to install or build.

### ⚠️ Always update `sw.js` before opening a Pull Request
If you changed `index.html`, `style.css`, `script.js`, or `js/store.js`, open `sw.js` and find this line near the top:
```js
const CACHE_NAME = 'scc-shell-v15';
```
Add **1** to the number (`v15` → `v16`). Without this, people's phones might keep showing the old version.

---

## Before you open a Pull Request: checklist

- [ ] It works at **phone size** and **computer size**.
- [ ] Nothing scrolls **sideways** on a phone.
- [ ] **No red errors** in the Console.
- [ ] Text is **easy to read** (dark enough on its background).
- [ ] I updated **`CACHE_NAME`** in `sw.js`.
- [ ] Screenshots use **demo data only**, never real student posts.
- [ ] If my task needed a database change, I added a `supabase-<name>.sql` file and said so in the Pull Request. (Enoch runs it on the real database.)

---

## Privacy rules (always, no exceptions)

This site promises students they're **anonymous**. So:

1. **Never** try to find out, show, or save who wrote a post or comment.
2. **Never** put real student posts in screenshots, issues, or Pull Requests. Use demo data.
3. **Never** add a Supabase **secret** or **service_role** key to the code. (The key already in `js/config.js` is the public one, and that's fine.)
4. **Never** use `?live=1` in the address. It switches your computer to the **real** database. Only Enoch uses it.

---

## Something went wrong? (common problems)

**"I don't see the yellow Demo mode note."**
Make sure the address starts with `http://localhost` or `http://127.0.0.1`. If it does and there's still no note, add `?live=0` to the end of the address and press Enter. Still nothing? Message Enoch.

**"Go Live doesn't appear in VS Code."**
Check Live Server is installed (Part 1, Step 2c), then make sure you opened the **`seattle-central-community`** folder, not the outer one.

**"I want to start over with fresh demo data."**
Open the browser panel (`Cmd+Option+I` / `F12`) → **Application** tab → **Local storage** → right-click the site → **Clear**. Then refresh.

**`git push` says permission denied / 403.**
You haven't accepted the GitHub invite yet (check your email), or you're signed in as a different GitHub account.

**GitHub says "changes must be made through a pull request" / branch is protected.**
You tried to push to `main`. That's blocked on purpose. Make a branch (Part 3, step ②) and push that instead.
If you already made commits on `main` by accident:
```
git checkout -b my-fix
git push -u origin my-fix
```
Then open a Pull Request from `my-fix`.

**`git pull` or the Pull Request says there's a "conflict".**
That means you and someone else changed the same lines. Don't panic and don't delete anything. Comment on your Pull Request or message Enoch, and you'll fix it together.

**"I messed up my changes and want to undo them."**
To throw away **all changes since your last commit** (this can't be undone):
```
git checkout .
```

**The site looks old after a change.**
Hard-refresh the browser: `Cmd+Shift+R` (Mac) / `Ctrl+Shift+R` (Windows).

**Stuck for more than 15 minutes?** Ask! Comment on the issue or message Enoch. Everyone gets stuck, and asking early saves time.

---

## Credit

Everyone who contributes is credited on the project. Thank you for helping Seattle Central students! 🐯
