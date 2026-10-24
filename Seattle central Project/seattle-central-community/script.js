(function () {
  const Store = window.SCCStore;
  const CONFIG = window.SCC_CONFIG;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const boardNames = Store.boardNames;
  let posts = [];
  let stories = [];
  let profReviews = [];
  let activeBoard = 'all';
  let lastPage = 'home';
  let lastHash = '#home';
  let openPostId = null;
  let editingCommentIndex = null;
  let editingPostId = null;
  let reportTarget = null;
  let tSession = 0;
  let tInterval = null;
  let pulseIndex = 0;
  let onboardStep = 0;
  let cache = { posts: [], stories: [], reviews: [] };

  const pulseFeed = [
    'Welcome to Seattle Central Community',
    'Posts are nicknamed, not legal names — be kind',
    'Sample cards are labeled until classmates start posting'
  ];

  function account() { return Store.getPrivate(); }

  // Close every open popup (used when the page changes or Escape is pressed).
  function closeOverlays() {
    document.querySelectorAll('.modal-overlay.show').forEach(function (o) {
      if (o.classList.contains('cw-overlay')) o.remove(); else o.classList.remove('show');
    });
    editingPostId = null;
  }
  // Stop double taps from sending the same thing twice.
  async function busy(btn, fn) {
    if (!btn || btn.dataset.busy === '1') return;
    btn.dataset.busy = '1'; btn.disabled = true;
    try { await fn(); } finally { btn.dataset.busy = ''; btn.disabled = false; }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('.modal-overlay.show');
    if (!open.length) return;
    const top = open[open.length - 1];
    if (top.classList.contains('cw-overlay')) top.remove(); else top.classList.remove('show');
  });
  function saveAccount() { Store.savePrivate(); }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  function sampleBadge(item) {
    return item && item.isSample ? '<span class="sample-badge">Sample</span>' : '';
  }

  function likeBtnHTML(p) {
    return '<button type="button" class="like-btn' + (p.liked ? ' on' : '') + '" data-like="' + escapeHtml(p.id) + '" aria-pressed="' + (p.liked ? 'true' : 'false') + '" aria-label="Like">' + (p.liked ? '♥ ' : '♡ ') + (p.likes || 0) + '</button>';
  }
  function setLikeUI(id, liked, n) {
    document.querySelectorAll('[data-like]').forEach(function (b) {
      if (String(b.dataset.like) !== String(id)) return;
      b.classList.toggle('on', liked);
      b.setAttribute('aria-pressed', liked ? 'true' : 'false');
      b.textContent = (liked ? '♥ ' : '♡ ') + n;
    });
  }
  async function toggleLike(id) {
    if (Store.guest) { showGuestPrompt(); return; }
    const p = posts.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    const was = !!p.liked, before = p.likes || 0;
    p.liked = !was; p.likes = Math.max(0, before + (was ? -1 : 1));
    setLikeUI(id, p.liked, p.likes);
    const r = await Store.toggleLike(id, was);
    if (r && r.ok === false) {
      p.liked = was; p.likes = before; setLikeUI(id, was, before);
      alert('Could not save your like: ' + r.error);
    }
  }
  // Hot posts: most likes in the last 7 days (at least 1 like).
  function hotPosts() {
    const since = Date.now() - 7 * 86400000;
    return posts.filter(function (p) { return p.ts >= since && (p.likes || 0) >= 1; })
      .sort(function (a, b) { return (b.likes - a.likes) || (b.ts - a.ts); }).slice(0, 3);
  }
  function hotHTML() {
    const list = hotPosts();
    if (!list.length) return '';
    const top = list[0];
    return '<div class="hot-wrap"><div class="hot-head"><h2>Hot posts</h2><span class="hot-flame">THIS WEEK</span></div>' +
      '<div class="hot-main hot-item" data-post-id="' + escapeHtml(top.id) + '" role="button" tabindex="0"><div class="tag">' + escapeHtml(boardNames[top.board] || top.board) + '</div>' +
      '<h3>' + escapeHtml(top.title) + '</h3><p>' + escapeHtml((top.body || '').slice(0, 110)) + ((top.body || '').length > 110 ? '…' : '') + '</p>' +
      '<div class="f">' + likeBtnHTML(top) + '<span>' + commentsLabel(top) + '</span></div></div>' +
      list.slice(1).map(function (p, i) {
        return '<div class="hot-row hot-item" data-post-id="' + escapeHtml(p.id) + '" role="button" tabindex="0"><span class="n">' + (i + 2) + '</span><span class="t">' + escapeHtml(p.title) + '</span><span class="l">♥ ' + (p.likes || 0) + '</span></div>';
      }).join('') + '</div>';
  }

  function commentsLabel(p) {
    const n = p.commentCount != null ? p.commentCount : (p.comments || []).length;
    return n === 1 ? '1 comment' : n + ' comments';
  }
  function postHTML(p) {
    return `<article class="post" data-post-id="${escapeHtml(p.id)}">
      <div class="post-meta"><span class="post-tag">${escapeHtml(boardNames[p.board] || p.board)}</span><span>·</span><span>Seattle Central</span><span>·</span><span>${escapeHtml(timeAgo(p.ts))}</span>${sampleBadge(p)}</div>
      <h3 class="post-title">${escapeHtml(p.title)}</h3>
      <p class="post-body">${escapeHtml(p.body)}</p>
      <div class="post-foot">${likeBtnHTML(p)}<span>${commentsLabel(p)}</span></div>
    </article>`;
  }

  function storyCardHTML(s) {
    return `<article class="story-card">
      <div class="story-route">${escapeHtml(s.from)}<span class="arrow">→</span>${escapeHtml(s.to)}</div>
      <h3>${escapeHtml(s.major)}</h3>
      <div class="story-stat">GPA ${escapeHtml(s.gpa)}</div>
      ${sampleBadge(s)}
      <p>${escapeHtml((s.text || '').slice(0, 80))}${(s.text || '').length > 80 ? '…' : ''}</p>
    </article>`;
  }

  function storyFullHTML(s) {
    const saved = account().savedStoryIds.indexOf(s.id) >= 0;
    const mine = Store.currentUser() && s.authorId === Store.currentUser().userId;
    return `<article class="story-full">
      <div class="story-route">${escapeHtml(s.from)}<span class="arrow">→</span>${escapeHtml(s.to)}</div>
      <h3>${escapeHtml(s.major)}</h3>
      <div class="stats-row"><div class="story-stat">GPA ${escapeHtml(s.gpa)}</div><span class="story-time">${escapeHtml(timeAgo(s.ts))}</span>${sampleBadge(s)}</div>
      <p>${escapeHtml(s.text)}</p>
      ${Store.guest ? '' : `<div class="safety-row">
        <button class="story-save-btn ${saved ? 'saved' : ''}" type="button" data-story-id="${escapeHtml(s.id)}">${saved ? '★ Saved' : '☆ Save'}</button>
        ${mine ? '' : `<button class="text-action" type="button" data-report="story" data-id="${escapeHtml(s.id)}">Report</button>
        <button class="text-action danger" type="button" data-block="story" data-id="${escapeHtml(s.id)}">Block</button>`}
      </div>`}
    </article>`;
  }

  function starString(rating) {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function profCardHTML(r) {
    return `<article class="prof-card">
      <div class="rating-row"><span class="rating-score">${Number(r.rating).toFixed(1)}</span><span class="rating-stars">${starString(r.rating)}</span></div>
      <h3>${escapeHtml(r.prof)}</h3>
      <div class="dept">${escapeHtml(r.course)} · ${escapeHtml(r.quarter)}</div>
      ${sampleBadge(r)}
      <p>${escapeHtml((r.text || '').slice(0, 70))}${(r.text || '').length > 70 ? '…' : ''}</p>
    </article>`;
  }

  function profFullHTML(r) {
    const mine = Store.currentUser() && r.authorId === Store.currentUser().userId;
    return `<article class="prof-full">
      <div class="head-row">
        <div>
          <h3>${escapeHtml(r.prof)}</h3>
          <div class="dept">${escapeHtml(r.course)}</div>
        </div>
        <div class="rating-row"><span class="rating-score">${Number(r.rating).toFixed(1)}</span></div>
      </div>
      <div class="review-meta"><span>${escapeHtml(r.quarter)}</span><span>·</span><span>${escapeHtml(timeAgo(r.ts))}</span>${sampleBadge(r)}</div>
      <p>${escapeHtml(r.text)}</p>
      ${(mine || Store.guest) ? '' : `<div class="safety-row">
        <button class="text-action" type="button" data-report="review" data-id="${escapeHtml(r.id)}">Report</button>
        <button class="text-action danger" type="button" data-block="review" data-id="${escapeHtml(r.id)}">Block</button>
      </div>`}
    </article>`;
  }

  function emptyHTML(title, body, actionLabel, actionPage) {
    return `<div class="empty">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(body)}</p>
      ${actionLabel ? `<button class="btn btn-primary empty-action" type="button" data-empty-action="${escapeHtml(actionPage || '')}">${escapeHtml(actionLabel)}</button>` : ''}
    </div>`;
  }

  function feedItemHTML(item) {
    if (item.kind === 'post') return postHTML(item.data);
    if (item.kind === 'story') {
      return `<article class="feed-card" data-go="stories">${storyCardHTML(item.data)}</article>`;
    }
    return `<article class="feed-card" data-go="professors">${profCardHTML(item.data)}</article>`;
  }

  async function refreshCache() {
    cache.posts = posts = await Store.listPosts();
    cache.stories = stories = await Store.listStories();
    cache.reviews = profReviews = await Store.listReviews();
    try { plans = await Store.listPlans(); } catch (e) { plans = []; }
  }

  function mixedFeed() {
    const items = [];
    posts.forEach(function (p) { items.push({ kind: 'post', ts: p.ts, data: p }); });
    stories.forEach(function (s) { items.push({ kind: 'story', ts: s.ts, data: s }); });
    profReviews.forEach(function (r) { items.push({ kind: 'review', ts: r.ts, data: r }); });
    items.sort(function (a, b) { return b.ts - a.ts; });
    return items;
  }

  function renderHome() {
    const el = document.getElementById('page-home');
    const feed = mixedFeed().slice(0, 12);
    el.innerHTML = `
      ${hotHTML()}
      <div class="section-head"><h2>Boards</h2><a href="#board">See all</a></div>
      <div class="board-grid">
        ${Object.keys(boardNames).map(function (k) {
          return `<button class="board-cat" type="button" data-board="${k}"><span>${escapeHtml(boardNames[k])}</span></button>`;
        }).join('')}
        <button class="board-cat" type="button" data-board="coursework"><span>Course work</span></button>
      </div>
      <div class="section-head"><h2>Campus feed</h2></div>
      <div id="homeFeed">
        ${feed.length ? feed.map(feedItemHTML).join('') : emptyHTML('Nothing in the feed yet', 'Write the first post for your classmates.', 'Write a post', 'compose')}
      </div>${guestFoot()}`;
  }

  function renderBoard() {
    const el = document.getElementById('page-board');
    const all = [{ key: 'all', label: 'All' }].concat(Object.keys(boardNames).map(function (key) {
      return { key: key, label: boardNames[key] };
    }));
    all.splice(1, 0, { key: 'coursework', label: 'Course work' });
    document.getElementById('fab').hidden = (activeBoard === 'coursework');
    if (activeBoard === 'coursework' && openPlanId) { renderPlans(el); return; }
    if (activeBoard !== 'coursework') openPlanId = null;
    const filtered = posts.filter(function (p) { return activeBoard === 'all' || p.board === activeBoard; });
    el.innerHTML = `
      <div class="filter-row" id="filterRow">
        ${all.map(function (b) {
          return `<button class="pill ${activeBoard === b.key ? 'active' : ''}" type="button" data-board-filter="${b.key}">${escapeHtml(b.label)}</button>`;
        }).join('')}
      </div>
      <div id="boardPosts">
        ${activeBoard === 'coursework' ? '' : (filtered.map(postHTML).join('') || emptyHTML('Nothing here yet', 'Be the first to write in this board.', 'Write a post', 'compose'))}
      </div>${activeBoard === 'coursework' ? '' : guestFoot()}`;
    if (activeBoard === 'coursework') renderPlans(document.getElementById('boardPosts'));
  }

  // ================= Course work plans =================
  let plans = [];
  let openPlanId = null;
  const CW_QUARTERS = ['Winter', 'Spring', 'Summer', 'Fall'];
  const CW_STATUS = { done: 'Done', now: 'In progress', planned: 'Planned' };
  const CW_SCHOOLS = ['University of Washington', 'UW Bothell', 'UW Tacoma', 'Seattle University',
    'Seattle Pacific University', 'Washington State University', 'Western Washington University',
    'Central Washington University', 'Eastern Washington University', 'Gonzaga University',
    'Oregon State University', 'University of Oregon', 'UC Berkeley', 'UCLA', 'UC San Diego',
    'Stanford University', 'Cal Poly SLO', 'Arizona State University', 'Purdue University'];
  const GRADE_MAP = { 'A': 4, 'A-': 3.7, 'B+': 3.3, 'B': 3, 'B-': 2.7, 'C+': 2.3, 'C': 2, 'C-': 1.7, 'D+': 1.3, 'D': 1, 'F': 0 };

  function termKey(t) {
    const m = String(t || '').split(' ');
    const qi = CW_QUARTERS.indexOf(m[0]);
    return (parseInt(m[1], 10) || 0) * 4 + (qi < 0 ? 0 : qi);
  }
  function sortedQuarters(plan) {
    return (plan.quarters || []).slice().sort(function (a, b) { return termKey(a.term) - termKey(b.term); });
  }
  function gradePoints(g) {
    g = String(g == null ? '' : g).trim().toUpperCase();
    if (!g) return null;
    if (GRADE_MAP.hasOwnProperty(g)) return GRADE_MAP[g];
    const n = parseFloat(g);
    return (isFinite(n) && n >= 0 && n <= 4) ? n : null;
  }
  function quarterCredits(q) {
    return (q.classes || []).reduce(function (s, c) { return s + (parseFloat(c.credits) || 0); }, 0);
  }
  function planStats(plan) {
    let credits = 0, pts = 0, w = 0;
    (plan.quarters || []).forEach(function (q) {
      if (q.status === 'done') credits += quarterCredits(q);
      (q.classes || []).forEach(function (c) {
        const g = gradePoints(c.grade), cr = parseFloat(c.credits) || 0;
        if (g !== null && cr > 0) { pts += g * cr; w += cr; }
      });
    });
    return { credits: credits, gpa: w ? (pts / w).toFixed(2) : '--' };
  }
  function num(n) { return String(Math.round(n * 10) / 10); }
  function chipsHTML(list, cls) {
    return '<div class="cw-chips">' + list.map(function (x) {
      return '<span class="cw-c ' + (cls || '') + '">' + escapeHtml(x) + '</span>';
    }).join('') + '</div>';
  }
  function goalsHTML(p) {
    return (p.otherMajors.length ? '<div class="cw-lbl">Also considering</div>' + chipsHTML(p.otherMajors) : '') +
      (p.dreamSchools.length ? '<div class="cw-lbl">Dream schools</div>' + chipsHTML(p.dreamSchools, 's') : '');
  }
  function statsHTML(p) {
    const st = planStats(p);
    return '<div class="cw-stats"><div class="cw-stat"><b>' + num(st.credits) + '</b><span>credits done</span></div>' +
      '<div class="cw-stat"><b>' + st.gpa + '</b><span>GPA so far</span></div></div>';
  }
  function planSpan(p) {
    const qs = sortedQuarters(p);
    if (!qs.length) return 'No quarters yet';
    return (qs.length === 1 ? qs[0].term : qs[0].term + ' to ' + qs[qs.length - 1].term) + ' · ' + qs.length + (qs.length === 1 ? ' quarter' : ' quarters');
  }
  function myPlanId() { const u = Store.currentUser(); return u && !Store.guest ? u.userId : null; }

  function planCardHTML(p) {
    const now = sortedQuarters(p).filter(function (q) { return q.status === 'now'; })[0];
    return '<div class="cw-card" data-cw="open" data-id="' + escapeHtml(p.id) + '" role="button" tabindex="0">' +
      '<div class="cw-top"><div><p class="cw-title">' + escapeHtml(p.major || 'Untitled plan') + '</p><div class="cw-sub">' + escapeHtml(planSpan(p)) + '</div></div>' +
      (p.id === myPlanId() ? '<span class="cw-mine">Your plan</span>' : '') + '</div>' +
      goalsHTML(p) + statsHTML(p) +
      '<div class="cw-live"><i></i>Updated ' + escapeHtml(timeAgo(p.ts)) + (now ? ' · ' + escapeHtml(now.term) + ' in progress' : '') + '</div></div>';
  }

  function classRowHTML(c) {
    c = c || {};
    return '<div class="cw-row"><button type="button" class="cw-x" data-cwm="rmrow" aria-label="Remove class">×</button>' +
      '<div class="cw-row-grid"><input class="f-code" type="text" maxlength="14" placeholder="Course code" value="' + escapeHtml(c.code || '') + '">' +
      '<input class="f-name" type="text" maxlength="60" placeholder="Course name" value="' + escapeHtml(c.name || '') + '"></div>' +
      '<input class="f-prof" type="text" maxlength="60" list="profNameList" placeholder="Professor name" value="' + escapeHtml(c.prof || '') + '">' +
      '<div class="cw-row-grid"><input class="f-cr" type="number" min="0" max="30" step="0.5" inputmode="decimal" placeholder="Credits" value="' + escapeHtml(c.credits == null ? '' : c.credits) + '">' +
      '<input class="f-gr" type="text" maxlength="4" placeholder="Grade (4.0 or A-)" value="' + escapeHtml(c.grade || '') + '"></div></div>';
  }

  function planDetailHTML(p) {
    const mine = p.id === myPlanId();
    const qs = sortedQuarters(p);
    return '<div class="cw-back"><button class="btn btn-ghost" type="button" data-cw="back">← All plans</button></div>' +
      '<div style="padding:4px 18px 6px"><div class="cw-top"><div><p class="cw-title" style="font-size:19px">' + escapeHtml(p.major || 'Untitled plan') + '</p><div class="cw-sub">' + escapeHtml(planSpan(p)) + '</div></div>' +
      (mine ? '<span class="cw-mine">Your plan</span>' : '') + '</div>' + goalsHTML(p) + statsHTML(p) +
      '<div class="cw-live"><i></i>Updated ' + escapeHtml(timeAgo(p.ts)) + '</div></div>' +
      (mine ? '<div class="cw-edit"><button class="btn btn-ghost" style="flex:1" type="button" data-cw="goals">Edit plan</button><button class="btn btn-ghost" style="flex:1" type="button" data-cw="addq">Add quarter</button></div>' : '<div style="height:12px"></div>') +
      (qs.length ? qs.map(function (q) {
        return '<div class="cw-q"><div class="cw-qh"><span><b>' + escapeHtml(q.term) + '</b><span class="cw-chip cw-' + escapeHtml(q.status) + '">' + escapeHtml(CW_STATUS[q.status] || 'Planned') + '</span></span>' +
          '<span class="cw-cr">' + num(quarterCredits(q)) + ' credits' + (mine ? ' <button type="button" class="cw-edit-q" data-cw="editq" data-id="' + escapeHtml(q.id) + '">Edit</button>' : '') + '</span></div>' +
          ((q.classes || []).length ? q.classes.map(function (c) {
            const g = String(c.grade || '').trim();
            return '<div class="cw-cl"><div><div class="cw-a">' + escapeHtml(c.code) + '</div>' + (c.name ? '<div class="cw-b">' + escapeHtml(c.name) + '</div>' : '') +
              (c.prof ? '<div class="cw-p">Prof. ' + escapeHtml(c.prof) + '</div>' : '') + '</div>' +
              '<div class="cw-r"><div class="k">' + escapeHtml(c.credits == null || c.credits === '' ? '?' : c.credits) + ' cr</div><div class="g' + (g ? '' : ' na') + '">' + (g ? escapeHtml(g) : '--') + '</div></div></div>';
          }).join('') : '<div class="cw-cl"><div class="cw-b">No classes yet</div></div>') + '</div>';
      }).join('') : '<div class="cw-empty">' + (mine ? 'Tap "Add quarter" to add your first quarter.' : 'No quarters yet.') + '</div>') +
      '<div class="cw-comments"><h4>Comments</h4><div id="cwComments"></div>' +
      '<div class="cw-cm-form"><input type="text" id="cwCmInput" maxlength="1000" placeholder="Write a comment (anonymous)"><button class="btn btn-primary" type="button" data-cw="cm-send">Send</button></div></div>';
  }

  async function loadPlanComments(planId) {
    const box = document.getElementById('cwComments');
    if (!box) return;
    const list = await Store.listPlanComments(planId);
    const me = myPlanId();
    const order = {}; let n = 0;
    box.innerHTML = list.length ? list.map(function (c) {
      let label;
      if (c.authorId === planId) label = 'Owner';
      else { if (!order[c.authorId]) order[c.authorId] = ++n; label = 'Anonymous ' + order[c.authorId]; }
      const own = me && c.authorId === me;
      return '<div class="cw-cm"><div class="cw-cm-h"><b>' + escapeHtml(label) + (own ? ' (you)' : '') + '</b><span>' + escapeHtml(timeAgo(c.ts)) + '</span>' +
        (own ? '<button type="button" class="cw-edit-q" data-cw="cm-del" data-id="' + escapeHtml(c.id) + '">Delete</button>' : '') + '</div>' +
        '<div>' + escapeHtml(c.text) + '</div></div>';
    }).join('') : '<div class="cw-b" style="padding:4px 0 10px">No comments yet.</div>';
  }

  function renderPlans(el) {
    const mine = plans.find(function (p) { return p.id === myPlanId(); });
    const open = openPlanId && plans.find(function (p) { return p.id === openPlanId; });
    if (open) {
      el.innerHTML = '<div id="cwWrap">' + planDetailHTML(open) + '</div>';
      loadPlanComments(open.id);
      return;
    }
    openPlanId = null;
    el.innerHTML = '<div class="cw-intro">Share your quarter-by-quarter plan and keep it updated. Everyone can follow along.</div>' +
      '<button class="btn btn-primary cw-btn" type="button" data-cw="share">' + (mine ? 'Open my plan' : 'Share your course work') + '</button>' +
      (plans.length ? plans.map(planCardHTML).join('') :
        '<div class="cw-empty">' + (Store.guest ? 'Sign up to see what other students are planning.' : 'No plans yet. Be the first to share yours.') + '</div>') +
      guestFoot();
  }

  function cwModal(html) {
    const o = document.createElement('div');
    o.className = 'modal-overlay show cw-overlay';
    o.innerHTML = '<div class="modal" role="dialog" aria-modal="true" style="max-height:92vh;overflow:auto">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    return o;
  }

  function openGoalsModal() {
    const existing = plans.find(function (p) { return p.id === myPlanId(); });
    const other = existing ? existing.otherMajors.slice() : [];
    const dream = existing ? existing.dreamSchools.slice() : [];
    const o = cwModal(
      '<h3>' + (existing ? 'Edit your plan' : 'Your goals') + '</h3>' +
      '<label>Main major</label><input type="text" id="cwMajor" maxlength="60" placeholder="Example: Computer Science" value="' + escapeHtml(existing ? existing.major : '') + '">' +
      '<label>Other majors you are considering</label><div id="cwOtherChips"></div>' +
      '<div class="cw-addrow"><input type="text" id="cwOtherIn" maxlength="60" placeholder="Add another major"><button type="button" class="btn btn-ghost" id="cwOtherAdd">Add</button></div>' +
      '<label>Dream schools</label><div id="cwDreamChips"></div>' +
      '<div class="cw-addrow"><input type="text" id="cwDreamIn" maxlength="60" list="cwSchoolList" placeholder="Add a school"><button type="button" class="btn btn-ghost" id="cwDreamAdd">Add</button></div>' +
      '<datalist id="cwSchoolList">' + CW_SCHOOLS.map(function (s) { return '<option value="' + escapeHtml(s) + '"></option>'; }).join('') + '</datalist>' +
      '<div class="modal-actions" style="margin-top:14px"><button class="btn btn-ghost" type="button" id="cwCancel">Cancel</button><button class="btn btn-primary" type="button" id="cwSave">Save</button></div>' +
      (existing ? '<button type="button" class="cw-danger" id="cwDelPlan">Delete my whole plan</button>' : ''));
    function chips(id, arr) {
      o.querySelector(id).innerHTML = arr.length ? '<div class="cw-chips" style="margin-bottom:8px">' + arr.map(function (x, i) {
        return '<span class="cw-c ' + (arr === dream ? 's' : '') + '">' + escapeHtml(x) + ' <button type="button" class="cw-cx" data-i="' + i + '" aria-label="Remove">×</button></span>';
      }).join('') + '</div>' : '';
    }
    function paint() { chips('#cwOtherChips', other); chips('#cwDreamChips', dream); }
    function addTo(arr, inputId) {
      const inp = o.querySelector(inputId); const v = inp.value.trim();
      if (v && arr.length < 12 && !arr.some(function (x) { return x.toLowerCase() === v.toLowerCase(); })) arr.push(v);
      inp.value = ''; paint();
    }
    paint();
    o.querySelector('#cwOtherAdd').onclick = function () { addTo(other, '#cwOtherIn'); };
    o.querySelector('#cwDreamAdd').onclick = function () { addTo(dream, '#cwDreamIn'); };
    o.querySelector('#cwOtherIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addTo(other, '#cwOtherIn'); } };
    o.querySelector('#cwDreamIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addTo(dream, '#cwDreamIn'); } };
    o.addEventListener('click', function (e) {
      const x = e.target.closest('.cw-cx');
      if (!x) return;
      const arr = x.closest('#cwDreamChips') ? dream : other;
      arr.splice(parseInt(x.dataset.i, 10), 1); paint();
    });
    o.querySelector('#cwCancel').onclick = function () { o.remove(); };
    o.querySelector('#cwSave').onclick = function () { busy(this, saveGoals); };
    async function saveGoals() {
      addTo(other, '#cwOtherIn'); addTo(dream, '#cwDreamIn');
      const major = o.querySelector('#cwMajor').value.trim();
      if (!major) { alert('Please write your main major.'); return; }
      const r = await Store.savePlan({ major: major, otherMajors: other, dreamSchools: dream, quarters: existing ? existing.quarters : [] });
      if (r && r.ok === false) { alert('Could not save: ' + r.error); return; }
      o.remove(); openPlanId = myPlanId(); await refreshCache(); renderBoard();
    }
    const del = o.querySelector('#cwDelPlan');
    if (del) del.onclick = async function () {
      if (!window.confirm('Delete your whole plan? This cannot be undone.')) return;
      const r = await Store.deletePlan();
      if (r && r.ok === false) { alert('Could not delete: ' + r.error); return; }
      o.remove(); openPlanId = null; await refreshCache(); renderBoard();
    };
  }

  function openQuarterModal(qid) {
    const plan = plans.find(function (p) { return p.id === myPlanId(); });
    if (!plan) return;
    const existing = qid ? plan.quarters.find(function (q) { return q.id === qid; }) : null;
    const yearNow = new Date().getFullYear();
    let qName, year, status = existing ? existing.status : 'planned';
    if (existing) { const m = existing.term.split(' '); qName = m[0]; year = parseInt(m[1], 10); }
    else {
      const last = sortedQuarters(plan).pop();
      if (last) {
        const m = last.term.split(' '); let i = CW_QUARTERS.indexOf(m[0]) + 1; year = parseInt(m[1], 10);
        if (i > 3) { i = 0; year += 1; } qName = CW_QUARTERS[i];
      } else {
        const mo = new Date().getMonth();
        qName = mo <= 2 ? 'Winter' : mo <= 5 ? 'Spring' : mo <= 7 ? 'Summer' : 'Fall'; year = yearNow; status = 'now';
      }
    }
    let yOpts = '';
    for (let y = 2020; y <= Math.max(yearNow + 4, year); y++) yOpts += '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>';
    fillProfNameList();
    const o = cwModal(
      '<h3>' + (existing ? 'Edit quarter' : 'Add quarter') + '</h3>' +
      '<label>Quarter</label><div class="q-pills" id="cwQPills">' + CW_QUARTERS.map(function (n) {
        return '<button type="button" class="q-pill' + (n === qName ? ' on' : '') + '" data-q="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
      '<label>Year</label><select id="cwYear">' + yOpts + '</select>' +
      '<label>Status</label><div class="q-pills cw-three" id="cwSPills">' + Object.keys(CW_STATUS).map(function (k) {
        return '<button type="button" class="q-pill' + (k === status ? ' on' : '') + '" data-s="' + k + '">' + CW_STATUS[k] + '</button>'; }).join('') + '</div>' +
      '<label>Classes</label><div id="cwRows">' + ((existing && existing.classes.length) ? existing.classes.map(classRowHTML).join('') : classRowHTML()) + '</div>' +
      '<button type="button" class="btn btn-ghost" id="cwAddRow" style="width:100%;margin-top:8px">+ Add class</button>' +
      '<div class="modal-actions" style="margin-top:14px"><button class="btn btn-ghost" type="button" id="cwCancel">Cancel</button><button class="btn btn-primary" type="button" id="cwSaveQ">Save quarter</button></div>' +
      (existing ? '<button type="button" class="cw-danger" id="cwDelQ">Delete this quarter</button>' : ''));
    o.querySelector('#cwQPills').onclick = function (e) {
      const b = e.target.closest('.q-pill'); if (!b) return; qName = b.dataset.q;
      o.querySelectorAll('#cwQPills .q-pill').forEach(function (x) { x.classList.toggle('on', x === b); });
    };
    o.querySelector('#cwSPills').onclick = function (e) {
      const b = e.target.closest('.q-pill'); if (!b) return; status = b.dataset.s;
      o.querySelectorAll('#cwSPills .q-pill').forEach(function (x) { x.classList.toggle('on', x === b); });
    };
    o.querySelector('#cwAddRow').onclick = function () {
      o.querySelector('#cwRows').insertAdjacentHTML('beforeend', classRowHTML());
      const rows = o.querySelectorAll('.cw-row'); rows[rows.length - 1].querySelector('.f-code').focus();
    };
    o.addEventListener('click', function (e) {
      const x = e.target.closest('[data-cwm="rmrow"]');
      if (x) x.closest('.cw-row').remove();
    });
    o.querySelector('#cwCancel').onclick = function () { o.remove(); };
    o.querySelector('#cwSaveQ').onclick = function () { busy(this, saveQuarter); };
    async function saveQuarter() {
      const y = o.querySelector('#cwYear').value;
      const term = qName + ' ' + y;
      if (plan.quarters.some(function (q) { return q.term === term && (!existing || q.id !== existing.id); })) {
        alert('You already have ' + term + '. Please edit that quarter instead.'); return;
      }
      const classes = [];
      let bad = '';
      o.querySelectorAll('.cw-row').forEach(function (r) {
        const code = r.querySelector('.f-code').value.trim();
        const name = r.querySelector('.f-name').value.trim();
        const prof = r.querySelector('.f-prof').value.trim();
        const crRaw = r.querySelector('.f-cr').value.trim();
        const grade = r.querySelector('.f-gr').value.trim();
        if (!code && !name && !prof && !crRaw && !grade) return;
        if (!code) { bad = 'Each class needs a course code.'; return; }
        if (grade && gradePoints(grade) === null) { bad = 'Grade for ' + code + ': use a number from 0 to 4 (like 3.6) or a letter (like A-).'; return; }
        const cr = parseFloat(crRaw);
        classes.push({ code: code, name: name, prof: canonicalProfName(prof), credits: isFinite(cr) ? Math.min(30, Math.max(0, cr)) : 0, grade: grade });
      });
      if (bad) { alert(bad); return; }
      const q = { id: existing ? existing.id : 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), term: term, status: status, classes: classes };
      const quarters = plan.quarters.filter(function (x) { return !existing || x.id !== existing.id; }).concat([q]);
      const r = await Store.savePlan({ major: plan.major, otherMajors: plan.otherMajors, dreamSchools: plan.dreamSchools, quarters: quarters });
      if (r && r.ok === false) { alert('Could not save: ' + r.error); return; }
      o.remove(); await refreshCache(); renderBoard();
    }
    const dq = o.querySelector('#cwDelQ');
    if (dq) dq.onclick = async function () {
      if (!window.confirm('Delete ' + existing.term + '?')) return;
      const quarters = plan.quarters.filter(function (x) { return x.id !== existing.id; });
      const r = await Store.savePlan({ major: plan.major, otherMajors: plan.otherMajors, dreamSchools: plan.dreamSchools, quarters: quarters });
      if (r && r.ok === false) { alert('Could not delete: ' + r.error); return; }
      o.remove(); await refreshCache(); renderBoard();
    };
  }

  document.getElementById('page-board').addEventListener('click', async function (e) {
    const t = e.target.closest('[data-cw]');
    if (!t) return;
    const a = t.dataset.cw;
    if (Store.guest) { showGuestPrompt(); return; }
    if (a === 'share') {
      if (plans.some(function (p) { return p.id === myPlanId(); })) { openPlanId = myPlanId(); renderBoard(); window.scrollTo(0, 0); }
      else openGoalsModal();
    } else if (a === 'open') { openPlanId = t.dataset.id; renderBoard(); window.scrollTo(0, 0); }
    else if (a === 'back') { openPlanId = null; renderBoard(); window.scrollTo(0, 0); }
    else if (a === 'goals') openGoalsModal();
    else if (a === 'addq') openQuarterModal();
    else if (a === 'editq') openQuarterModal(t.dataset.id);
    else if (a === 'cm-send') {
      busy(t, async function () {
        const inp = document.getElementById('cwCmInput');
        const text = inp.value.trim();
        if (!text) return;
        const r = await Store.addPlanComment(openPlanId, text);
        if (r && r.ok === false) { alert('Could not send: ' + r.error); return; }
        inp.value = ''; loadPlanComments(openPlanId);
      });
    } else if (a === 'cm-del') {
      await Store.deletePlanComment(t.dataset.id); loadPlanComments(openPlanId);
    }
  });
  document.getElementById('page-board').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'cwCmInput') {
      const b = document.querySelector('[data-cw="cm-send"]'); if (b) b.click();
    }
  });

  function renderStories() {
    document.getElementById('page-stories').innerHTML = `
      <div class="section-head" style="padding-top:16px;"><h2>Transfer Stories</h2></div>
      <button class="composer-box" id="storyComposer" type="button">
        <div class="composer-row"><div class="composer-text">Share your transfer story…</div></div>
        <div class="composer-prompts"><span>From and to school</span><span>Major</span><span>GPA</span><span>Your story</span></div>
        <span class="composer-btn">Write your story</span>
      </button>
      <div class="stories-list" id="storiesList">
        ${stories.map(storyFullHTML).join('') || emptyHTML('No stories yet', 'Share your transfer journey to help others.', 'Write a story', 'story')}
      </div>${guestFoot()}`;
  }

  // ================= Course names + professor / class search =================
  function normCode(raw) {
    const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const m = s.match(/^([A-Z]{2,6})\s*(&)?\s*(\d{2,3}[A-Z]?)$/);
    return m ? m[1] + (m[2] || '') + ' ' + m[3] : s;
  }
  function codeKey(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function parseCourse(c) {
    const s = String(c || '');
    const i = s.indexOf(' · ');
    return i < 0 ? { code: s.trim(), name: '' } : { code: s.slice(0, i).trim(), name: s.slice(i + 3).trim() };
  }
  function topKey(obj, pref) {
    let best = null, bn = -1;
    Object.keys(obj).forEach(function (k) {
      const n = typeof obj[k] === 'number' ? obj[k] : obj[k].n;
      if (n > bn || (n === bn && pref && pref(k) && !pref(best))) { best = k; bn = n; }
    });
    return best;
  }
  // Every course seen in reviews, grouped by code (MATH 151 and MATH& 151 are the same class).
  function courseIndex() {
    const m = {};
    profReviews.forEach(function (r) {
      const pc = parseCourse(r.course);
      const k = codeKey(pc.code);
      if (!k || k === 'COURSE') return;
      const e = m[k] = m[k] || { key: k, codes: {}, names: {}, reviews: [] };
      e.codes[pc.code] = (e.codes[pc.code] || 0) + 1;
      if (pc.name) {
        const nk = pc.name.toLowerCase();
        (e.names[nk] = e.names[nk] || { name: pc.name, n: 0 }).n++;
      }
      e.reviews.push(r);
    });
    Object.keys(m).forEach(function (k) {
      const e = m[k];
      e.code = topKey(e.codes, function (c) { return c && c.indexOf('&') >= 0; });
      const nk = topKey(e.names);
      e.name = nk ? e.names[nk].name : '';
    });
    // Official class list (js/courses.js): its code and name win, and classes with no reviews yet are listed too.
    const cat = window.SCC_COURSES || {};
    Object.keys(cat).forEach(function (sj) {
      (cat[sj] || []).forEach(function (c) {
        const k = codeKey(c[0]);
        if (!k) return;
        const e = m[k] = m[k] || { key: k, codes: {}, names: {}, reviews: [] };
        e.code = c[0]; e.name = c[1] || e.name || '';
      });
    });
    return m;
  }
  function fillCourseList() {
    const idx = courseIndex();
    document.getElementById('courseCodeList').innerHTML = Object.keys(idx).sort().map(function (k) {
      const e = idx[k];
      return '<option value="' + escapeHtml(e.code) + '" label="' + escapeHtml(e.name) + '"></option>';
    }).join('');
  }
  function syncCourseName() {
    const codeEl = document.getElementById('profRevCourse');
    const nameEl = document.getElementById('profRevCourseName');
    const hint = document.getElementById('profCourseHint');
    const e = courseIndex()[codeKey(codeEl.value)];
    if (e && e.name) {
      nameEl.value = e.name; nameEl.readOnly = true;
      hint.textContent = 'Everyone uses this name, so reviews stay together.';
    } else {
      if (nameEl.readOnly) nameEl.value = '';
      nameEl.readOnly = false;
      hint.textContent = '';
    }
  }
  document.getElementById('profRevCourse').addEventListener('input', syncCourseName);
  document.getElementById('profRevCourse').addEventListener('change', syncCourseName);

  // ---- Class picker in the review form (type to search, or browse by subject) ----
  let pkQ = '', pkSubj = null, pkPicked = false;
  const pkMore = { matches: false, subjects: false, classes: false };
  function pkEntries() { const idx = courseIndex(); return Object.keys(idx).map(function (k) { return idx[k]; }); }
  function pkClassLabel(e) { return '<b>' + escapeHtml(e.code) + '</b>' + escapeHtml(e.name || ''); }
  function pkList(items, kind, limit) {
    const shown = pkMore[kind] ? items : items.slice(0, limit);
    return '<div class="pk-list">' + shown.map(function (e) {
      return '<div role="button" tabindex="0" data-pkpick="' + escapeHtml(e.key) + '">' + pkClassLabel(e) + '</div>';
    }).join('') + (items.length > shown.length ? '<div class="more" role="button" tabindex="0" data-pkmore="' + kind + '">Show more ' + (kind === 'matches' ? 'matches' : 'classes') + ' (' + (items.length - shown.length) + ')</div>' : '') + '</div>';
  }
  function renderClassPicker() {
    const picked = document.getElementById('profClassPicked');
    const find = document.getElementById('profClassFind');
    if (!picked || !find) return;
    const adding = !document.getElementById('profClassManual').hidden;
    picked.hidden = !pkPicked; find.hidden = pkPicked || adding;
    if (pkPicked) {
      const code = document.getElementById('profRevCourse').value, name = document.getElementById('profRevCourseName').value;
      document.getElementById('profClassPickedText').textContent = code + (name ? ' · ' + name : '');
      return;
    }
    const q = pkQ.trim().toLowerCase(), qk = codeKey(pkQ);
    const entries = pkEntries();
    // matches from typing
    let html = '';
    if (q) {
      const hits = entries.filter(function (e) {
        return (qk && e.key.indexOf(qk) >= 0) || (e.name && e.name.toLowerCase().indexOf(q) >= 0) || subjName(subjOf(e.code)).toLowerCase().indexOf(q) >= 0;
      }).sort(function (a, b) { return (b.reviews.length - a.reviews.length) || a.key.localeCompare(b.key); });
      const typed = normCode(pkQ);
      html = hits.length ? pkList(hits, 'matches', 3)
        : '<div class="pk-none">No class found for "' + escapeHtml(pkQ.trim()) + '".</div><button type="button" class="pk-add" data-pkadd="' + escapeHtml(/\d/.test(typed) ? typed : '') + '">+ Add ' + (/\d/.test(typed) ? '"' + escapeHtml(typed) + '" as ' : '') + 'a new class</button>';
    }
    document.getElementById('profClassMatches').innerHTML = html;
    // browse by subject
    const box = document.getElementById('profClassSubj');
    if (q) { box.innerHTML = ''; document.getElementById('profClassBrowse').hidden = true; return; }
    document.getElementById('profClassBrowse').hidden = false;
    if (pkSubj) {
      const items = entries.filter(function (e) { return subjOf(e.code) === pkSubj; }).sort(function (a, b) { return a.key.localeCompare(b.key); });
      box.innerHTML = '<div class="pk-chips"><span class="pk-chip on">' + escapeHtml(pkSubj) + (subjName(pkSubj) ? ' ' + escapeHtml(subjName(pkSubj)) : '') + '</span>' +
        '<button type="button" class="pk-chip" data-pksubj="">Change</button></div>' +
        (items.length ? pkList(items, 'classes', 4) : '<div class="pk-none">No classes listed here yet. Use "Add a new class" below.</div>');
      return;
    }
    const subs = {};
    Object.keys(window.SCC_SUBJECTS || {}).forEach(function (sj) { subs[sj] = 0; });
    entries.forEach(function (e) { const sj = subjOf(e.code); subs[sj] = (subs[sj] || 0) + 1; });
    const names = Object.keys(subs).sort(function (a, b) { return (subs[b] - subs[a]) || a.localeCompare(b); });
    const shown = pkMore.subjects ? names : names.slice(0, 6);
    box.innerHTML = '<div class="pk-chips">' + shown.map(function (n) {
      return '<button type="button" class="pk-chip" data-pksubj="' + escapeHtml(n) + '"><b>' + escapeHtml(n) + '</b>' + (subjName(n) && subjName(n) !== n ? ' ' + escapeHtml(subjName(n)) : '') + '</button>';
    }).join('') + (names.length > shown.length ? '<button type="button" class="pk-chip more" data-pkmore="subjects">Show more (' + (names.length - shown.length) + ')</button>' : '') + '</div>';
  }
  function pkPick(key) {
    const e = courseIndex()[key];
    if (!e) return;
    if (!e.name) { openAddClass(e.code, true); return; }
    const codeEl = document.getElementById('profRevCourse'), nameEl = document.getElementById('profRevCourseName');
    codeEl.value = e.code; nameEl.value = e.name || '';
    nameEl.readOnly = !!e.name;
    document.getElementById('profCourseHint').textContent = e.name ? 'Everyone uses this name, so reviews stay together.' : '';
    pkPicked = true;
    showClassErr('');
    renderClassPicker();
  }
  function showClassErr(msg) {
    const el = document.getElementById('profClassErr');
    el.textContent = msg; el.hidden = !msg;
  }
  function openAddClass(code, lockCode) {
    const codeEl = document.getElementById('profRevCourse'), nameEl = document.getElementById('profRevCourseName');
    codeEl.value = normCode(code || ''); codeEl.readOnly = !!lockCode;
    nameEl.value = ''; nameEl.readOnly = false;
    document.getElementById('profCourseHint').textContent = '';
    document.getElementById('profAddTitle').textContent = lockCode ? 'Add the class name' : 'Add a new class';
    showClassErr('');
    document.getElementById('profClassManual').hidden = false;
    renderClassPicker();
    (lockCode || codeEl.value ? nameEl : codeEl).focus();
  }
  function saveAddClass() {
    const codeEl = document.getElementById('profRevCourse'), nameEl = document.getElementById('profRevCourseName');
    const hint = document.getElementById('profCourseHint');
    let code = normCode(codeEl.value);
    let name = nameEl.value.trim().replace(/\s+/g, ' ');
    if (!code || !/\d/.test(code)) { hint.textContent = 'Please write the course code, like ART 100.'; codeEl.focus(); return; }
    if (!name) { hint.textContent = 'Please write the class name.'; nameEl.focus(); return; }
    const known = courseIndex()[codeKey(code)];
    if (known && known.name) { code = known.code; name = known.name; }
    codeEl.value = code; nameEl.value = name; codeEl.readOnly = false; nameEl.readOnly = !!(known && known.name);
    hint.textContent = '';
    document.getElementById('profClassManual').hidden = true;
    pkPicked = true; showClassErr('');
    renderClassPicker();
  }
  function resetClassPicker() {
    pkQ = ''; pkSubj = null; pkPicked = false; pkMore.matches = pkMore.subjects = pkMore.classes = false;
    document.getElementById('profClassSearch').value = '';
    document.getElementById('profClassManual').hidden = true;
    document.getElementById('profRevCourse').readOnly = false;
    showClassErr('');
    renderClassPicker();
  }
  (function bindClassPicker() {
    const ov = document.getElementById('profModalOverlay');
    ov.addEventListener('input', function (e) {
      if (e.target.id !== 'profClassSearch') return;
      pkQ = e.target.value; pkMore.matches = false; renderClassPicker();
    });
    ov.addEventListener('click', function (e) {
      const pick = e.target.closest('[data-pkpick]');
      if (pick) { pkPick(pick.dataset.pkpick); return; }
      const sj = e.target.closest('[data-pksubj]');
      if (sj) { pkSubj = sj.dataset.pksubj || null; pkMore.classes = false; renderClassPicker(); return; }
      const more = e.target.closest('[data-pkmore]');
      if (more) { pkMore[more.dataset.pkmore] = true; renderClassPicker(); return; }
      if (e.target.closest('#profClassChange')) {
        document.getElementById('profRevCourse').value = ''; document.getElementById('profRevCourseName').value = '';
        document.getElementById('profRevCourse').readOnly = false;
        document.getElementById('profRevCourseName').readOnly = false; document.getElementById('profCourseHint').textContent = '';
        pkPicked = false; document.getElementById('profClassManual').hidden = true; renderClassPicker(); return;
      }
      const add = e.target.closest('[data-pkadd]');
      if (add) { openAddClass(add.dataset.pkadd, false); return; }
      if (e.target.closest('#profClassAddBtn')) { openAddClass(pkQ.trim() && /\d/.test(normCode(pkQ)) ? pkQ : '', false); return; }
      if (e.target.closest('#profClassAddCancel')) {
        document.getElementById('profClassManual').hidden = true;
        document.getElementById('profRevCourse').value = ''; document.getElementById('profRevCourseName').value = '';
        document.getElementById('profRevCourse').readOnly = false; document.getElementById('profRevCourseName').readOnly = false;
        pkPicked = false; renderClassPicker(); return;
      }
      if (e.target.closest('#profClassAddSave')) saveAddClass();
    });
  })();

  let psMode = 'prof', psQ = '', psSel = null, psSubj = null, psAllSubj = false;
  function subjName(sj) { return (window.SCC_SUBJECTS || {})[sj] || ''; }
  function subjOf(code) { const m = String(code || '').toUpperCase().match(/^[A-Z]+/); return m ? m[0] : '#'; }
  const psExp = {};
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function avgOf(list) { return list.reduce(function (s, r) { return s + Number(r.rating || 0); }, 0) / (list.length || 1); }
  function recent(list) {
    return list.slice().sort(function (a, b) { return (termKey(b.quarter) - termKey(a.quarter)) || (b.ts - a.ts); });
  }
  function psProfs() {
    const m = {};
    profReviews.forEach(function (r) {
      const n = canonicalProfName(r.prof);
      const k = n.toLowerCase();
      (m[k] = m[k] || { key: k, name: n, reviews: [] }).reviews.push(r);
    });
    return m;
  }
  function psReviewRow(r, showCourse) {
    const pc = parseCourse(r.course);
    const mine = Store.currentUser() && r.authorId === Store.currentUser().userId;
    return '<div class="ps-row"><div class="t"><div><h4>' + escapeHtml(showCourse ? (pc.code + (pc.name ? ' · ' + pc.name : '')) : r.quarter) + '</h4>' +
      '<div class="m">' + escapeHtml(showCourse ? r.quarter : '') + (showCourse ? ' · ' : '') + escapeHtml(timeAgo(r.ts)) + '</div></div>' +
      '<span class="ps-sc">' + Number(r.rating).toFixed(1) + '</span></div><p>' + escapeHtml(r.text) + '</p>' +
      ((mine || Store.guest) ? '' : '<div class="safety-row"><button class="text-action" type="button" data-report="review" data-id="' + escapeHtml(r.id) + '">Report</button></div>') + '</div>';
  }
  function psSuggestions() {
    const q = psQ.trim().toLowerCase(), qk = codeKey(psQ);
    if (psMode === 'prof') {
      const profs = psProfs();
      return Object.keys(profs).map(function (k) { return profs[k]; })
        .filter(function (p) { return p.name.toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return b.reviews.length - a.reviews.length; }).slice(0, 6)
        .map(function (p) { return { key: p.key, label: p.name + ' · ' + plural(p.reviews.length, 'review') }; });
    }
    const idx = courseIndex();
    if (psSubj && !q) {
      return Object.keys(idx).map(function (k) { return idx[k]; })
        .filter(function (e) { return subjOf(e.code) === psSubj; })
        .sort(function (a, b) { return a.key.localeCompare(b.key); })
        .map(function (e) { return { key: e.key, label: e.code + (e.name ? ' · ' + e.name : '') + ' · ' + (e.reviews.length ? plural(e.reviews.length, 'review') : 'no reviews yet') }; });
    }
    return Object.keys(idx).map(function (k) { return idx[k]; })
      .filter(function (e) { return (qk && e.key.indexOf(qk) >= 0) || (e.name && e.name.toLowerCase().indexOf(q) >= 0) || subjName(subjOf(e.code)).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return b.reviews.length - a.reviews.length; }).slice(0, 6)
      .map(function (e) { return { key: e.key, label: e.code + (e.name ? ' · ' + e.name : '') + ' · ' + (e.reviews.length ? plural(e.reviews.length, 'review') : 'no reviews yet') }; });
  }
  function psResultsHTML() {
    if (psMode === 'prof') {
      const p = psProfs()[psSel];
      if (!p) return '';
      const classes = {};
      p.reviews.forEach(function (r) { classes[codeKey(parseCourse(r.course).code)] = 1; });
      const avg = avgOf(p.reviews);
      return '<div class="ps-head"><b>' + escapeHtml(p.name) + '</b><span>All reviews for this professor</span></div>' +
        '<div class="ps-sum"><div><div class="ps-big">' + avg.toFixed(1) + '</div><div class="ps-st">' + '★'.repeat(Math.round(avg)) + '</div></div>' +
        '<div style="text-align:right"><div class="ps-sm">' + plural(p.reviews.length, 'review') + '</div><div class="ps-sm">' + (Object.keys(classes).length === 1 ? '1 class' : Object.keys(classes).length + ' classes') + '</div></div></div>' +
        recent(p.reviews).map(function (r) { return psReviewRow(r, true); }).join('');
    }
    const e = courseIndex()[psSel];
    if (!e) return '';
    const byProf = {};
    e.reviews.forEach(function (r) {
      const n = canonicalProfName(r.prof), k = n.toLowerCase();
      (byProf[k] = byProf[k] || { key: k, name: n, reviews: [] }).reviews.push(r);
    });
    const rows = Object.keys(byProf).map(function (k) { return byProf[k]; })
      .sort(function (a, b) { return avgOf(b.reviews) - avgOf(a.reviews) || b.reviews.length - a.reviews.length; });
    if (!rows.length) {
      return '<div class="ps-head"><b>' + escapeHtml(e.code + (e.name ? ' · ' + e.name : '')) + '</b><span>No reviews for this class yet.</span></div>' +
        '<div class="ps-wrap"><button type="button" class="btn btn-primary" style="width:100%" data-empty-action="review">Write the first review</button></div>';
    }
    return '<div class="ps-head"><b>' + escapeHtml(e.code + (e.name ? ' · ' + e.name : '')) + '</b><span>Professors who taught this class</span></div>' +
      '<div class="ps-lbl">Best rated first</div>' + rows.map(function (p) {
        const rs = recent(p.reviews), open = psExp[p.key + '|' + psSel], avg = avgOf(p.reviews);
        return '<div class="ps-row"><div class="t"><div><h4>' + escapeHtml(p.name) + '</h4><div class="m">' + avg.toFixed(1) + ' avg · ' + plural(p.reviews.length, 'review') + ' · last taught ' + escapeHtml(rs[0].quarter) + '</div></div>' +
          '<span class="ps-sc">' + avg.toFixed(1) + '</span></div>' +
          (open ? rs.map(function (r) { return '<p>' + escapeHtml(r.text) + '<span class="ps-sm"> · ' + escapeHtml(r.quarter) + ' · ' + Number(r.rating).toFixed(1) + '</span></p>'; }).join('')
                : '<p>' + escapeHtml(rs[0].text.length > 160 ? rs[0].text.slice(0, 157) + '…' : rs[0].text) + '</p>') +
          (p.reviews.length > 1 ? '<button type="button" class="ps-link" data-pexp="' + escapeHtml(p.key) + '">' + (open ? 'Show less' : 'See all ' + p.reviews.length + ' reviews') + '</button>' : '') + '</div>';
      }).join('');
  }
  function renderProfSearch() {
    const out = document.getElementById('profSearchOut');
    const list = document.getElementById('profList');
    if (!out || !list) return;
    document.querySelectorAll('#profSearchTabs .ps-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.pmode === psMode); });
    document.getElementById('profSearchIn').placeholder = psMode === 'prof' ? 'Search a professor name' : 'Search a class code or name';
    const comp = document.getElementById('profComposer');
    const browsing = psMode === 'class' && !psQ.trim();
    if (browsing && !psSubj) {
      const idx = courseIndex(), subs = {};
      Object.keys(window.SCC_SUBJECTS || {}).forEach(function (sj) { subs[sj] = 0; });
      Object.keys(idx).forEach(function (k) { const sj = subjOf(idx[k].code); subs[sj] = (subs[sj] || 0) + 1; });
      const names = Object.keys(subs).sort(function (a, b) { return (subs[b] - subs[a]) || a.localeCompare(b); });
      const shownNames = psAllSubj ? names : names.slice(0, 12);
      out.innerHTML = names.length ? '<div class="ps-lbl" style="margin-top:2px">Browse by subject</div><div class="ps-chips">' + shownNames.map(function (n) {
        return '<button type="button" class="ps-chip' + (subs[n] ? '' : ' empty') + '" data-psubj="' + escapeHtml(n) + '"><b>' + escapeHtml(n) + '</b>' + (subjName(n) && subjName(n) !== n ? ' ' + escapeHtml(subjName(n)) : '') + (subs[n] ? ' <span>' + subs[n] + '</span>' : '') + '</button>';
      }).join('') + (names.length > shownNames.length ? '<button type="button" class="ps-chip" data-psall="1">Show all subjects (' + (names.length - shownNames.length) + ' more)</button>' : (psAllSubj && names.length > 12 ? '<button type="button" class="ps-chip" data-psall="0">Show fewer</button>' : '')) + '</div>' : '';
      list.hidden = false; if (comp) comp.hidden = false; return;
    }
    if (!psQ.trim() && !browsing) { out.innerHTML = ''; list.hidden = false; if (comp) comp.hidden = false; return; }
    list.hidden = true; if (comp) comp.hidden = true;
    const sug = psSuggestions();
    if (!sug.length && browsing) {
      out.innerHTML = '<div class="ps-lbl" style="margin-top:2px"><button type="button" class="ps-link" data-psubj="" style="margin:0">← All subjects</button> · ' + escapeHtml(psSubj) + (subjName(psSubj) ? ' · ' + escapeHtml(subjName(psSubj)) : '') + '</div>' +
        emptyHTML('No classes listed yet', 'Be the first to review a class in this subject.', 'Write a review', 'review');
      return;
    }
    if (!sug.length) {
      out.innerHTML = emptyHTML('No reviews found', psMode === 'prof' ? 'Nobody has reviewed this professor yet.' : 'Nobody has reviewed this class yet.', 'Write a review', 'review');
      return;
    }
    if (psSel && !sug.some(function (s) { return s.key === psSel; })) psSel = null;
    if (!psSel && sug.length === 1) psSel = sug[0].key;
    out.innerHTML = (browsing ? '<div class="ps-lbl" style="margin-top:2px"><button type="button" class="ps-link" data-psubj="" style="margin:0">← All subjects</button> · ' + escapeHtml(psSubj) + (subjName(psSubj) ? ' · ' + escapeHtml(subjName(psSubj)) : '') + '</div>' : '') + '<div class="ps-sug">' + sug.map(function (s) {
      return '<div role="button" tabindex="0" data-psel="' + escapeHtml(s.key) + '" class="' + (s.key === psSel ? 'on' : '') + '">' + escapeHtml(s.label) + '</div>';
    }).join('') + '</div>' + (psSel ? psResultsHTML() : '');
  }
  (function bindProfSearch() {
    const page = document.getElementById('page-professors');
    page.addEventListener('input', function (e) {
      if (e.target.id !== 'profSearchIn') return;
      psQ = e.target.value; psSel = null; psSubj = null; renderProfSearch();
    });
    page.addEventListener('click', function (e) {
      const mode = e.target.closest('[data-pmode]');
      if (mode) { psMode = mode.dataset.pmode; psSel = null; psSubj = null; renderProfSearch(); return; }
      const all = e.target.closest('[data-psall]');
      if (all) { psAllSubj = all.dataset.psall === '1'; renderProfSearch(); return; }
      const subj = e.target.closest('[data-psubj]');
      if (subj) { psSubj = subj.dataset.psubj || null; psSel = null; renderProfSearch(); return; }
      const sel = e.target.closest('[data-psel]');
      if (sel) { psSel = sel.dataset.psel; renderProfSearch(); return; }
      const exp = e.target.closest('[data-pexp]');
      if (exp) { const k = exp.dataset.pexp + '|' + psSel; psExp[k] = !psExp[k]; renderProfSearch(); }
    });
  })();

  function renderProfessors() {
    document.getElementById('page-professors').innerHTML = `
      <div class="section-head" style="padding-top:16px;"><h2>Professor Reviews</h2></div>
      <div class="ps-wrap"><div class="ps-in"><span aria-hidden="true">🔍</span><input type="search" id="profSearchIn" autocomplete="off" value="${escapeHtml(psQ)}" aria-label="Search reviews"></div>
        <div class="ps-tabs" id="profSearchTabs"><button type="button" class="ps-tab" data-pmode="prof">Professor</button><button type="button" class="ps-tab" data-pmode="class">Class</button></div></div>
      <div id="profSearchOut"></div>
      <button class="composer-box" id="profComposer" type="button">
        <div class="composer-row"><div class="composer-text">Review a professor or class…</div></div>
        <div class="composer-prompts"><span>Professor name</span><span>Course code</span><span>Quarter taken</span><span>Rating (1–5)</span></div>
        <span class="composer-btn">Write a review</span>
      </button>
      <div class="prof-list" id="profList">
        ${profReviews.map(profFullHTML).join('') || emptyHTML('No reviews yet', 'Be the first to review a professor.', 'Write a review', 'review')}
      </div>${guestFoot()}`;
    renderProfSearch();
  }

  function renderMyPage() {
    const user = Store.currentUser();
    const minePosts = posts.filter(function (p) { return user && p.authorId === user.userId; });
    let commentCount = 0;
    posts.forEach(function (p) {
      (p.comments || []).forEach(function (c) {
        if (user && c.authorId === user.userId) commentCount++;
      });
    });
    const initials = (user.nickname || 'AB').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    document.getElementById('page-my').innerHTML = `
      <div class="profile-head">
        <div class="avatar">${escapeHtml(initials)}</div>
        <div>
          <h3>${escapeHtml(user.nickname)}</h3>
          <p>${escapeHtml(user.email)} · Seattle Central College</p>
        </div>
      </div>
      <div class="menu-list" id="myMenuList">
        <button class="menu-item" type="button" data-my="posts">My posts <span class="right">${minePosts.length} ›</span></button>
        <button class="menu-item" type="button" data-my="comments">My comments <span class="right">${commentCount} ›</span></button>
        <button class="menu-item" type="button" data-my="saved">Saved stories <span class="right">${account().savedStoryIds.length} ›</span></button>
        <button class="menu-item" type="button" data-page="timer">Study timer <span class="right">Private ›</span></button>
        <button class="menu-item" type="button" data-page="schedule">Class schedule <span class="right">Private ›</span></button>
        <button class="menu-item" type="button" data-my="notif">Notification settings <span class="right">›</span></button>
        <button class="menu-item" type="button" data-my="verify">Email <span class="right">Verified ✓</span></button>
        <a class="menu-item" href="guidelines.html">Community guidelines <span class="right">›</span></a>
        <a class="menu-item" href="privacy.html">Privacy <span class="right">›</span></a>
        <button class="menu-item" type="button" data-my="about">About this app <span class="right">›</span></button>
        <button class="menu-item" type="button" data-my="signout">Sign out <span class="right">›</span></button>
      </div>`;
  }

  function renderTimerPage() {
    document.getElementById('page-timer').innerHTML = `
      <div class="section-head" style="padding-top:16px;"><h2>Study Timer</h2><span class="save-hint">Private to you</span></div>
      <div class="timer-card">
        <div class="timer-label">Current session</div>
        <div class="timer-clock" id="timerClock">00:00:00</div>
        <div class="goal-bar"><div class="goal-fill" id="goalFill"></div></div>
        <div class="goal-meta">
          <span id="goalPct">0% of daily goal</span>
          <span class="goal-edit">Goal <input type="number" id="goalInput" min="1" max="24" aria-label="Daily goal in hours"> h/day</span>
        </div>
        <div class="timer-controls">
          <button class="btn btn-primary" id="timerStartBtn" type="button">Start</button>
          <button class="btn btn-ghost" id="timerSaveBtn" type="button">Save session</button>
          <button class="btn btn-ghost" id="timerResetBtn" type="button">Reset</button>
        </div>
      </div>
      <div class="tstats" id="timerStats"></div>
      <div class="section-head"><h2>Last 7 days</h2></div>
      <div class="tchart" id="timerChart"></div>`;
    restoreLive();
    bindTimer();
    renderTimerStats();
    renderTimerClock();
    if (tInterval) {
      document.getElementById('timerStartBtn').textContent = 'Pause';
      document.getElementById('timerClock').classList.add('running');
    }
  }

  function renderSchedulePage() {
    document.getElementById('page-schedule').innerHTML = `
      <div class="section-head" style="padding-top:16px;"><h2>Class Schedule</h2><span class="save-hint">Private to you</span></div>
      <div class="qtr-nav">
        <button class="qtr-btn" id="qtrPrevBtn" type="button">Previous</button>
        <input id="schedSemester" class="sched-sem-input qtr-name" placeholder="e.g. Fall Quarter 2026" title="Quarter name">
        <button class="qtr-btn" id="qtrNextBtn" type="button">Next</button>
      </div>
      <div class="sched-toolbar">
        <span class="sched-credits" id="schedCredits">0 credits</span>
        <span class="qtr-pos" id="qtrPos"></span>
        <button class="btn btn-ghost sched-add-btn" id="schedShotBtn" type="button">Screenshot</button>
        <button class="btn btn-primary sched-add-btn" id="schedAddBtn" type="button">Add class</button>
      </div>
      <div class="sched-online" id="schedOnline" hidden></div>
      <div class="sched-grid-wrap"><div class="sched-grid" id="schedGrid"></div></div>
      <div class="empty" id="schedEmpty" hidden>
        <h4>No classes yet</h4>
        <p>Add your first class to build your weekly schedule.</p>
      </div>`;
    bindSchedule();
    renderSchedule();
  }

  function showPulse() {
    const track = document.getElementById('pulseTrack');
    if (!track) return;
    track.innerHTML = pulseFeed.map(function (t, i) {
      return `<div class="pulse-item" data-i="${i}">${escapeHtml(t)}</div>`;
    }).join('');
    rotatePulse();
  }

  function rotatePulse() {
    const items = document.querySelectorAll('#pulseTrack .pulse-item');
    if (!items.length) return;
    items.forEach(function (el) { el.classList.remove('show'); });
    items[pulseIndex % items.length].classList.add('show');
    pulseIndex = (pulseIndex + 1) % items.length;
  }

  function hashPage() {
    const raw = (location.hash || '#home').replace(/^#/, '');
    const parts = raw.split('/');
    return { name: parts[0] || 'home', extra: parts[1] };
  }

  function navTo(name, extra) {
    if (name === 'home' || name === 'board' || name === 'stories' || name === 'professors' || name === 'my' || name === 'timer' || name === 'schedule' || name === 'search' || name === 'alerts' || name === 'post') {
      const next = extra ? '#' + name + '/' + extra : '#' + name;
      if (location.hash !== next) location.hash = next;
      else goPage(name, extra);
    }
  }

  let navSeq = 0, cacheReady = false;
  function dataSig() {
    try { return JSON.stringify([posts, stories, profReviews, plans]); } catch (e) { return String(Math.random()); }
  }
  function renderPage(name) {
    if (name === 'home') renderHome();
    if (name === 'board') renderBoard();
    if (name === 'stories') renderStories();
    if (name === 'professors') renderProfessors();
    if (name === 'my') renderMyPage();
    if (name === 'timer') renderTimerPage();
    if (name === 'schedule') renderSchedulePage();
    if (name === 'search') {
      const inp = document.getElementById('searchInput');
      renderSearch(inp.value);
      if (window.innerWidth >= 900) inp.focus();
    }
  }

  async function goPage(name, extra) {
    const seq = ++navSeq;
    if (Store.guest && ['home', 'board', 'stories', 'professors'].indexOf(name) < 0) {
      try { history.replaceState(null, '', '#home'); } catch (e) {}
      await goPage('home');
      showGuestPrompt();
      return;
    }
    closeOverlays();
    document.getElementById('shotMode').hidden = true;
    if (name === 'post' && extra) {
      const known = posts.some(function (p) { return String(p.id) === String(extra); });
      if (known) openPost(extra, true);
      await refreshCache();
      if (seq !== navSeq) return;
      cacheReady = true;
      if (!posts.some(function (p) { return String(p.id) === String(extra); })) { navTo('home'); return; }
      openPost(extra, true, known);
      return;
    }
    if (!document.getElementById('page-' + name)) name = 'home';
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('page-' + name).classList.add('active');
    const tab = (name === 'timer' || name === 'schedule' || name === 'search' || name === 'alerts' || name === 'post') ? (name === 'timer' || name === 'schedule' ? 'my' : 'home') : name;
    document.querySelectorAll('.navbtn').forEach(function (b) { b.classList.toggle('active', b.dataset.page === tab); });
    document.querySelectorAll('.dn-item').forEach(function (b) { b.classList.toggle('active', b.dataset.page === tab); });

    const fab = document.getElementById('fab');
    const fabLabel = document.getElementById('fabLabel');
    if (name === 'home' || name === 'board') {
      fab.hidden = false;
      fabLabel.textContent = 'Write a post';
    } else if (name === 'stories') {
      fab.hidden = false;
      fabLabel.textContent = 'Write a story';
    } else if (name === 'professors') {
      fab.hidden = false;
      fabLabel.textContent = 'Write a review';
    } else {
      fab.hidden = true;
    }
    if (name === 'board') activeBoard = extra || 'all';
    window.scrollTo(0, 0);

    // Show what we already have right away, then refresh from the server.
    const before = dataSig();
    if (cacheReady) renderPage(name);
    await refreshCache();
    if (seq !== navSeq) return;
    const changed = !cacheReady || dataSig() !== before;
    cacheReady = true;
    const page = document.getElementById('page-' + name);
    const typing = document.activeElement && page.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (changed && !typing) renderPage(name);
    if (name === 'alerts') await renderAlerts();
    renderAside();
    await updateAlertDot();
  }

  function renderAside() {
    const aside = document.getElementById('asideStories');
    if (!aside) return;
    aside.innerHTML = stories.slice(0, 4).map(function (s) {
      return `<div class="aside-story"><div class="route">${escapeHtml(s.from)} → ${escapeHtml(s.to)}</div><div class="major">${escapeHtml(s.major)} · GPA ${escapeHtml(s.gpa)}</div></div>`;
    }).join('') || '<p class="aside-copy">No stories yet.</p>';
  }

  async function updateAlertDot() {
    const list = await Store.notifications();
    const unread = list.some(function (n) { return !n.read; });
    document.getElementById('alertDot').hidden = !unread;
  }

  async function renderAlerts() {
    await Store.markNotificationsRead();
    await updateAlertDot();
    const list = await Store.notifications();
    document.getElementById('alertsList').innerHTML = list.length
      ? list.map(function (n) {
        return `<button class="menu-item" type="button" data-post-id="${escapeHtml(n.postId || '')}">
          <div><div style="font-weight:600;font-size:13.5px;">${escapeHtml(n.text)}</div>
          <div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px;">${escapeHtml(timeAgo(n.ts))}</div></div>
          <span class="right">›</span></button>`;
      }).join('')
      : emptyHTML('No notifications yet', 'Comments on your posts will show up here.');
  }

  async function renderSearch(q) {
    const res = await Store.search(q);
    const box = document.getElementById('searchResults');
    if (!q) {
      box.innerHTML = emptyHTML('Search the campus', 'Try a course code, professor, or transfer school.');
      return;
    }
    const chunks = [];
    if (res.posts.length) chunks.push('<h3 class="search-h">Posts</h3>' + res.posts.map(postHTML).join(''));
    if (res.stories.length) chunks.push('<h3 class="search-h">Stories</h3>' + res.stories.map(storyFullHTML).join(''));
    if (res.reviews.length) chunks.push('<h3 class="search-h">Reviews</h3>' + res.reviews.map(profFullHTML).join(''));
    box.innerHTML = chunks.join('') || emptyHTML('No matches', 'Try a different word.');
  }

  function openPost(id, skipNav, keepScroll) {
    const p = posts.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    openPostId = p.id;
    const comments = p.comments = p.comments || [];
    const user = Store.currentUser();
    const mine = user && p.authorId === user.userId;
    const anonMap = {};
    let anonCount = 0;
    function anonName(c) {
      if (c.authorId === p.authorId) return 'Author';
      if (!anonMap[c.authorId]) anonMap[c.authorId] = ++anonCount;
      return 'Anonymous ' + anonMap[c.authorId];
    }
    document.getElementById('postDetailContent').innerHTML = `
      <div class="post-detail">
        <div class="post-meta"><span class="post-tag">${escapeHtml(boardNames[p.board] || p.board || 'Post')}</span><span>·</span><span>Seattle Central</span><span>·</span><span>${escapeHtml(timeAgo(p.ts))}${p.edited ? ' · edited' : ''}</span>${sampleBadge(p)}</div>
        <h2 class="post-title">${escapeHtml(p.title)}</h2>
        <p class="post-body">${escapeHtml(p.body)}</p>
        <div class="post-foot">${likeBtnHTML(p)}<span>${commentsLabel(p)}</span></div>
        <div class="post-actions">
          ${mine ? `<button class="text-action" type="button" data-edit-post>Edit</button>
          <button class="text-action danger" type="button" data-delete-post>Delete</button>` : `<button class="text-action" type="button" data-report="post" data-id="${escapeHtml(p.id)}">Report</button>
          <button class="text-action danger" type="button" data-block="post" data-id="${escapeHtml(p.id)}">Block author</button>`}
        </div>
      </div>
      <div class="comments-section">
        <h4>Comments (${comments.length})</h4>
        ${comments.length === 0 ? '<div class="empty" style="padding:18px 0;"><p>No comments yet. Start the conversation.</p></div>' : ''}
        ${comments.map(function (c, idx) {
          const canEdit = user && c.authorId === user.userId;
          const label = anonName(c);
          const initials = label === 'Author' ? 'OP' : label.split(' ')[1];
          if (idx === editingCommentIndex) {
            return `<div class="comment">
              <div class="c-avatar">${escapeHtml(initials)}</div>
              <div class="c-body" style="width:100%;">
                <input type="text" class="c-edit-input" id="commentEditInput" value="${escapeHtml(c.text)}">
                <div class="comment-edit-actions">
                  <button class="text-action" type="button" data-save-comment="${idx}">Save</button>
                  <button class="text-action" type="button" data-cancel-comment>Cancel</button>
                </div>
              </div>
            </div>`;
          }
          return `<div class="comment">
            <div class="c-avatar">${escapeHtml(initials)}</div>
            <div class="c-body">
              <div class="c-name">${escapeHtml(label)}${canEdit ? ' (you)' : ''}</div>
              <div class="c-text">${escapeHtml(c.text)}</div>
              <div class="c-time">${escapeHtml(c.ts ? timeAgo(c.ts) : '')}${c.edited ? ' · edited' : ''}</div>
              ${canEdit ? `<div class="comment-actions">
                <button class="text-action" type="button" data-edit-comment="${idx}">Edit</button>
                <button class="text-action danger" type="button" data-delete-comment="${idx}">Delete</button>
              </div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="comment-input-row">
        <label class="sr-only" for="commentInput">Add a comment</label>
        <input type="text" id="commentInput" placeholder="Add a comment…">
        <button type="button" id="commentSendBtn">Post</button>
      </div>`;

    document.querySelectorAll('.page').forEach(function (pg) {
      if (pg.classList.contains('active') && pg.id !== 'page-post') {
        lastPage = pg.id.replace('page-', '');
        if (location.hash.indexOf('#post/') !== 0) lastHash = location.hash || '#home';
      }
    });
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('page-post').classList.add('active');
    document.getElementById('fab').hidden = true;
    document.querySelectorAll('.navbtn').forEach(function (b) { b.classList.toggle('active', b.dataset.page === 'home'); });
    document.querySelectorAll('.dn-item').forEach(function (b) { b.classList.toggle('active', b.dataset.page === lastPage); });
    if (!keepScroll) window.scrollTo(0, 0);
    if (!skipNav && location.hash !== '#post/' + p.id) { skipHashFor = '#post/' + p.id; location.hash = 'post/' + p.id; }

    const sendBtn = document.getElementById('commentSendBtn');
    sendBtn.onclick = function () {
      busy(sendBtn, async function () {
        const input = document.getElementById('commentInput');
        const text = input.value.trim();
        if (!text) return;
        const cr = await Store.addComment(p.id, text);
        if (cr && cr.ok === false) { alert('Could not post comment: ' + (cr.error || 'try again')); return; }
        editingCommentIndex = null;
        await refreshCache();
        openPost(id, true, true);
      });
    };
    document.getElementById('commentInput').onkeydown = function (e) { if (e.key === 'Enter' && !e.isComposing) sendBtn.click(); };
  }

  const BOARD_HINTS = {
    events: { t: 'What class do you need help with, or what can you tutor?', b: 'Class, times that work for you, online or on campus…' },
    confess: { t: 'What are you sharing? (e.g. MATH 151 study guide)', b: 'Describe your notes, study guide, or practice test. You can paste a link to the file.' }
  };
  function syncBoardHint() {
    const h = BOARD_HINTS[document.getElementById('modalBoard').value];
    document.getElementById('modalTitleInput').placeholder = h ? h.t : 'What’s on your mind?';
    document.getElementById('modalBody').placeholder = h ? h.b : 'Share details…';
  }
  document.getElementById('modalBoard').addEventListener('change', syncBoardHint);
  function openModal(boardPreset) {
    editingPostId = null;
    document.getElementById('modalTitle').textContent = 'New post';
    document.getElementById('modalPost').textContent = 'Post anonymously';
    document.getElementById('modalBoard').value = (boardPreset && boardNames[boardPreset]) ? boardPreset : 'free';
    document.getElementById('modalTitleInput').value = '';
    document.getElementById('modalBody').value = '';
    syncBoardHint();
    document.getElementById('modalOverlay').classList.add('show');
  }

  function openEditPost(id) {
    const p = posts.find(function (x) { return x.id === id; });
    if (!p) return;
    editingPostId = id;
    document.getElementById('modalTitle').textContent = 'Edit post';
    document.getElementById('modalPost').textContent = 'Save changes';
    document.getElementById('modalBoard').value = p.board;
    document.getElementById('modalTitleInput').value = p.title;
    document.getElementById('modalBody').value = p.body;
    document.getElementById('modalOverlay').classList.add('show');
  }

  function openStoryModal() {
    document.getElementById('storyFrom').value = 'Seattle Central';
    document.getElementById('storyTo').value = '';
    document.getElementById('storyMajor').value = '';
    document.getElementById('storyGpa').value = '';
    document.getElementById('storyText').value = '';
    document.getElementById('storyModalOverlay').classList.add('show');
  }

  let profQuarter = 'Fall';
  function markProfQuarter() {
    document.querySelectorAll('#profQuarterPills .q-pill').forEach(function (b) {
      b.classList.toggle('on', b.dataset.q === profQuarter);
      b.setAttribute('aria-pressed', b.dataset.q === profQuarter ? 'true' : 'false');
    });
  }
  document.getElementById('profQuarterPills').addEventListener('click', function (e) {
    const b = e.target.closest('.q-pill');
    if (!b) return;
    profQuarter = b.dataset.q;
    markProfQuarter();
  });

  function knownProfNames() {
    const seen = {};
    const out = [];
    (window.SCC_INSTRUCTORS || []).concat((profReviews || []).map(function (r) { return r.prof; })).forEach(function (n) {
      n = String(n || '').trim();
      const k = n.toLowerCase();
      if (n && !seen[k]) { seen[k] = n; out.push(n); }
    });
    out.sort(function (a, b) { return a.localeCompare(b); });
    return out;
  }
  function canonicalProfName(typed) {
    const k = String(typed || '').trim().toLowerCase();
    const hit = knownProfNames().find(function (n) { return n.toLowerCase() === k; });
    return hit || String(typed || '').trim();
  }
  function fillProfNameList() {
    document.getElementById('profNameList').innerHTML = knownProfNames().map(function (n) {
      return '<option value="' + escapeHtml(n) + '"></option>';
    }).join('');
  }

  function openProfModal() {
    fillProfNameList();
    document.getElementById('profRevName').value = '';
    document.getElementById('profRevCourse').value = '';
    document.getElementById('profRevCourseName').value = '';
    document.getElementById('profRevCourseName').readOnly = false;
    document.getElementById('profCourseHint').textContent = '';
    fillCourseList();
    resetClassPicker();
    const nowD = new Date();
    const curYear = nowD.getFullYear();
    const mo = nowD.getMonth();
    profQuarter = mo <= 2 ? 'Winter' : mo <= 5 ? 'Spring' : mo <= 7 ? 'Summer' : 'Fall';
    const ySel = document.getElementById('profRevYear');
    ySel.innerHTML = '';
    for (let y = curYear; y >= 2020; y--) ySel.innerHTML += '<option value="' + y + '">' + y + '</option>';
    ySel.value = String(curYear);
    markProfQuarter();
    document.getElementById('profRevRating').value = '5';
    document.getElementById('profRevText').value = '';
    document.getElementById('profModalOverlay').classList.add('show');
  }

  function openMyModal(title, bodyHTML) {
    document.getElementById('myModalTitle').textContent = title;
    document.getElementById('myModalBody').innerHTML = bodyHTML;
    document.getElementById('myModalOverlay').classList.add('show');
  }

  const pad2 = function (n) { return String(n).padStart(2, '0'); };
  const hmsFmt = function (s) { return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60); };
  const hFmt = function (s) { return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : (s / 3600).toFixed(1) + 'h'; };
  function dateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function renderTimerClock() {
    const tClock = document.getElementById('timerClock');
    if (!tClock) return;
    tClock.textContent = hmsFmt(tSession);
    const savedToday = account().timer.days[dateKey(new Date())] || 0;
    const pct = Math.min(1, (savedToday + tSession) / (account().timer.goalHours * 3600));
    document.getElementById('goalFill').style.width = (pct * 100) + '%';
    document.getElementById('goalPct').textContent = Math.round(pct * 100) + '% of daily goal';
    document.getElementById('goalInput').value = account().timer.goalHours;
    if (document.getElementById('timerStats') && document.getElementById('timerChart')) renderTimerStats();
  }

  function saveLive() {
    const t = account().timer;
    if (!tSession && !tInterval) delete t.live;
    else t.live = { sec: tSession, running: !!tInterval, at: Date.now() };
    saveAccount();
  }
  function restoreLive() {
    const l = account().timer.live;
    if (!l || tInterval || tSession) return;
    tSession = (l.sec || 0) + (l.running ? Math.max(0, Math.floor((Date.now() - l.at) / 1000)) : 0);
    if (l.running) {
      tInterval = setInterval(function () { tSession++; renderTimerClock(); if (tSession % 15 === 0) saveLive(); }, 1000);
    }
  }

  function timerToggle() {
    const tStartBtn = document.getElementById('timerStartBtn');
    const tClock = document.getElementById('timerClock');
    if (tInterval) {
      clearInterval(tInterval); tInterval = null;
      tStartBtn.textContent = 'Start';
      tClock.classList.remove('running');
    } else {
      tInterval = setInterval(function () { tSession++; renderTimerClock(); if (tSession % 15 === 0) saveLive(); }, 1000);
      tStartBtn.textContent = 'Pause';
      tClock.classList.add('running');
    }
    saveLive();
  }

  function bindTimer() {
    document.getElementById('timerStartBtn').onclick = timerToggle;
    document.getElementById('timerResetBtn').onclick = function () {
      if (tInterval) timerToggle();
      tSession = 0; saveLive(); renderTimerClock();
    };
    document.getElementById('timerSaveBtn').onclick = function () {
      if (!tSession) return;
      const k = dateKey(new Date());
      account().timer.days[k] = (account().timer.days[k] || 0) + tSession;
      saveAccount();
      if (tInterval) timerToggle();
      tSession = 0; saveLive();
      renderTimerClock(); renderTimerStats();
    };
    document.getElementById('goalInput').onchange = function (e) {
      account().timer.goalHours = Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 3));
      saveAccount(); renderTimerClock();
    };
  }

  function renderTimerStats() {
    const now = new Date();
    const days = account().timer.days;
    const live = tSession || 0;
    let today = 0, week = 0, month = 0, all = 0;
    const monday = new Date(now); monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    Object.keys(days).forEach(function (k) {
      const s = days[k]; all += s;
      const d = new Date(k + 'T00:00:00');
      if (k === dateKey(now)) today = s;
      if (d >= monday) week += s;
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += s;
    });
    today += live; week += live; month += live; all += live;
    document.getElementById('timerStats').innerHTML = [
      ['Today', today], ['This week', week], ['This month', month], ['All time', all]
    ].map(function (pair) {
      return `<div class="tstat"><div class="v">${hFmt(pair[1])}</div><div class="l">${pair[0]}</div></div>`;
    }).join('');
    const bars = [];
    let max = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const secs = (days[dateKey(d)] || 0) + (i === 0 ? live : 0);
      max = Math.max(max, secs);
      bars.push({ label: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()], secs: secs, isToday: i === 0 });
    }
    document.getElementById('timerChart').innerHTML = bars.map(function (b) {
      const h = max ? Math.max(2, Math.round(b.secs / max * 70)) : 2;
      return `<div class="tbar${b.isToday ? ' today' : ''}">
        <div class="h">${b.secs ? hFmt(b.secs) : ''}</div>
        <div class="bar" style="height:${h}px"></div>
        <div class="d">${b.label}</div></div>`;
    }).join('');
  }

  const SCHED_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const SCHED_START = 8, SCHED_END = 21;
  let clsOnline = false, clsAsync = false;
  const CLASS_COLORS = [
    { bg: '#E6ECF8', text: '#1E4CA2' },
    { bg: '#E8EAFF', text: '#3D4CCC' },
    { bg: '#FFF2DE', text: '#9A6210' },
    { bg: '#FFE9EC', text: '#C2354B' },
    { bg: '#F0E7FF', text: '#6D3ACC' },
    { bg: '#E7F3FF', text: '#1B6BAA' }
  ];
  const Q_SEQ = ['Winter', 'Spring', 'Summer', 'Fall'];
  let clsEditingId = null, clsSelectedDays = new Set(), clsSelectedColor = 0;

  function hourLabel(h) {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    const sfx = hh < 12 ? 'am' : 'pm', disp = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
    return mm === 0 ? disp + sfx : disp + ':' + pad2(mm) + sfx;
  }
  function activeQuarter() { return account().schedule.quarters[account().schedule.active]; }
  function shiftQuarterName(name, dir) {
    const m = (name || '').match(/(Winter|Spring|Summer|Fall)[^0-9]*(\d{4})/i);
    if (!m) return dir < 0 ? 'Previous quarter' : 'New quarter';
    let i = Q_SEQ.findIndex(function (q) { return q.toLowerCase() === m[1].toLowerCase(); }) + dir;
    let y = parseInt(m[2], 10);
    if (i < 0) { i = 3; y--; } else if (i > 3) { i = 0; y++; }
    return Q_SEQ[i] + ' Quarter ' + y;
  }
  function goQuarter(dir) {
    const s = account().schedule;
    const target = s.active + dir;
    if (target >= 0 && target < s.quarters.length) s.active = target;
    else if (dir < 0) {
      s.quarters.unshift({ name: shiftQuarterName(s.quarters[0].name, -1), classes: [] });
      s.active = 0;
    } else {
      s.quarters.push({ name: shiftQuarterName(s.quarters[s.quarters.length - 1].name, +1), classes: [] });
      s.active = s.quarters.length - 1;
    }
    saveAccount(); renderSchedule();
  }

  function renderSchedule() {
    const s = account().schedule;
    const q = activeQuarter();
    document.getElementById('schedSemester').value = q.name;
    const credits = q.classes.reduce(function (sum, c) { return sum + (c.credits || 0); }, 0);
    document.getElementById('schedCredits').textContent = credits + ' credits';
    document.getElementById('qtrPos').textContent = s.quarters.length > 1 ? 'Quarter ' + (s.active + 1) + ' of ' + s.quarters.length : '';
    const prevBtn = document.getElementById('qtrPrevBtn');
    const nextBtn = document.getElementById('qtrNextBtn');
    if (s.active > 0) { prevBtn.textContent = '‹ ' + s.quarters[s.active - 1].name; prevBtn.classList.remove('qtr-new'); }
    else { prevBtn.textContent = '‹ Add previous quarter'; prevBtn.classList.add('qtr-new'); }
    if (s.active < s.quarters.length - 1) { nextBtn.textContent = s.quarters[s.active + 1].name + ' ›'; nextBtn.classList.remove('qtr-new'); }
    else { nextBtn.textContent = '+ New quarter'; nextBtn.classList.add('qtr-new'); }
    const grid = document.getElementById('schedGrid');
    const asyncBox = document.getElementById('schedOnline');
    const asyncList = q.classes.filter(function (c) { return c.online && c.async; });
    if (asyncBox) {
      asyncBox.hidden = asyncList.length === 0;
      asyncBox.innerHTML = '<div class="so-title">Online classes</div>' + asyncList.map(function (c) {
        return '<button type="button" class="so-chip" data-cls-id="' + c.id + '">' + escapeHtml(c.code) + (c.prof ? ' · ' + escapeHtml(c.prof) : (c.room ? ' · ' + escapeHtml(c.room) : ' · Async')) + '</button>';
      }).join('');
    }
    const empty = document.getElementById('schedEmpty');
    empty.hidden = q.classes.length > 0;
    const todayIdx = new Date().getDay() - 1;
    const rows = SCHED_END - SCHED_START;
    const rowH = 44;
    let html = '<div class="sg-head"><div class="cell"></div>' +
      SCHED_DAYS.map(function (d, i) { return '<div class="cell' + (i === todayIdx ? ' today' : '') + '">' + d + '</div>'; }).join('') +
      '</div><div class="sg-body">';
    html += '<div class="sg-timecol">' + Array.from({ length: rows }, function (_, r) { return '<div class="tl">' + hourLabel(SCHED_START + r) + '</div>'; }).join('') + '</div>';
    for (let day = 0; day < 5; day++) {
      html += '<div class="sg-daycol" data-day="' + day + '">';
      html += Array.from({ length: rows }, function () { return '<div class="hline"></div>'; }).join('');
      q.classes.filter(function (c) { return !c.async && c.days.indexOf(day) >= 0; }).forEach(function (c) {
        const top = (c.start - SCHED_START) * rowH;
        const height = Math.max(20, (c.end - c.start) * rowH - 3);
        const col = CLASS_COLORS[c.color % CLASS_COLORS.length];
        html += `<button class="sg-block${c.online ? ' sg-online' : ''}" type="button" data-cls-id="${c.id}"
          style="top:${top}px;height:${height}px;background:${col.bg};color:${col.text};${c.online ? 'border:1px dashed ' + col.text + ';' : ''}">
          <div class="code">${escapeHtml(c.code)}</div>
          <div class="room">${c.online ? 'Online' + (c.room ? ' · ' + escapeHtml(c.room) : '') : escapeHtml(c.room || '')}</div>${c.prof && height >= 40 ? '<div class="room">' + escapeHtml(c.prof) + '</div>' : ''}</button>`;
      });
      html += '</div>';
    }
    html += '</div>';
    grid.innerHTML = html;
  }

  function buildTimeOptions() {
    let opts = '';
    for (let m = SCHED_START * 60; m <= SCHED_END * 60; m += 5) { const h = m / 60; opts += '<option value="' + h + '">' + hourLabel(h) + '</option>'; }
    document.getElementById('clsStart').innerHTML = opts;
    document.getElementById('clsEnd').innerHTML = opts;
  }
  function buildDayPicker() {
    document.getElementById('clsDays').innerHTML = SCHED_DAYS.map(function (d, i) {
      return '<button class="day-chip' + (clsSelectedDays.has(i) ? ' on' : '') + '" type="button" data-day="' + i + '">' + d + '</button>';
    }).join('');
  }
  function buildColorPicker() {
    document.getElementById('clsColors').innerHTML = CLASS_COLORS.map(function (c, i) {
      return '<button class="color-dot' + (i === clsSelectedColor ? ' on' : '') + '" type="button" data-color="' + i + '" style="background:' + c.bg + ';box-shadow:inset 0 0 0 6px ' + c.bg + ', inset 0 0 0 20px ' + c.text + '22;" aria-label="Color ' + (i + 1) + '"></button>';
    }).join('');
  }
  function syncClsType() {
    document.querySelectorAll('#clsType .day-chip').forEach(function (b) { b.classList.toggle('on', (b.dataset.online === '1') === clsOnline); });
    document.querySelectorAll('#clsWhen .day-chip').forEach(function (b) { b.classList.toggle('on', (b.dataset.async === '1') === clsAsync); });
    document.getElementById('clsWhenWrap').hidden = !clsOnline;
    document.getElementById('clsTimeWrap').hidden = clsOnline && clsAsync;
    document.getElementById('clsRoomLabel').textContent = clsOnline ? 'Where (optional)' : 'Lecture room (optional)';
    document.getElementById('clsRoom').placeholder = clsOnline ? 'e.g. Canvas, Zoom link' : 'e.g. BE 3175';
  }
  document.getElementById('clsType').addEventListener('click', function (e) {
    const b = e.target.closest('.day-chip'); if (!b) return;
    const was = clsOnline; clsOnline = b.dataset.online === '1'; if (!clsOnline) clsAsync = false; else if (!was) clsAsync = true; syncClsType();
  });
  document.getElementById('clsWhen').addEventListener('click', function (e) {
    const b = e.target.closest('.day-chip'); if (!b) return;
    clsAsync = b.dataset.async === '1'; syncClsType();
  });
  function openClassModal(id) {
    clsEditingId = id == null ? null : id;
    const c = id != null ? activeQuarter().classes.find(function (x) { return x.id === id; }) : null;
    document.getElementById('classModalTitle').textContent = c ? 'Edit class' : 'Add class';
    document.getElementById('clsCode').value = (c && c.code) || '';
    document.getElementById('clsName').value = (c && c.name) || '';
    document.getElementById('clsRoom').value = (c && c.room) || '';
    document.getElementById('clsProf').value = (c && c.prof) || '';
    document.getElementById('clsCredits').value = (c && c.credits) != null ? c.credits : 5;
    clsSelectedDays = new Set((c && c.days) || []);
    clsSelectedColor = (c && c.color) != null ? c.color : (activeQuarter().classes.length % CLASS_COLORS.length);
    clsOnline = !!(c && c.online); clsAsync = !!(c && c.online && c.async);
    syncClsType();
    buildTimeOptions(); buildDayPicker(); buildColorPicker();
    document.getElementById('clsStart').value = (c && c.start) != null ? c.start : 9;
    document.getElementById('clsEnd').value = (c && c.end) != null ? c.end : 10;
    document.getElementById('clsDelete').hidden = !c;
    document.getElementById('classModalOverlay').classList.add('show');
  }

  function shotTime(a, b) {
    const sa = hourLabel(a), sb = hourLabel(b);
    const same = sa.slice(-2) === sb.slice(-2);
    return (same ? sa.slice(0, -2) : sa.replace(/m$/, '')) + '-' + sb.replace(/m$/, '');
  }
  function openShotMode() {
    const q = activeQuarter();
    const box = document.getElementById('shotMode');
    let first = 8, last = 17;
    const timed = q.classes.filter(function (c) { return !c.async; });
    const asyncL = q.classes.filter(function (c) { return c.async; });
    if (timed.length) {
      first = Math.floor(Math.min.apply(null, timed.map(function (c) { return c.start; })));
      last = Math.ceil(Math.max.apply(null, timed.map(function (c) { return c.end; })));
      if (last - first < 4) last = first + 4;
    }
    const rows = last - first;
    const rowH = Math.max(36, Math.min(90, Math.floor((window.innerHeight - 190) / rows)));
    const credits = q.classes.reduce(function (sum, c) { return sum + (c.credits || 0); }, 0);
    let grid = '<div class="shot-head"><div></div>' + SCHED_DAYS.map(function (d) { return '<div>' + d + '</div>'; }).join('') + '</div>';
    grid += '<div class="shot-body" style="--sr:' + rowH + 'px">';
    grid += '<div class="shot-times">' + Array.from({ length: rows }, function (_, r) { return '<div>' + hourLabel(first + r) + '</div>'; }).join('') + '</div>';
    for (let day = 0; day < 5; day++) {
      grid += '<div class="shot-col">' + Array.from({ length: rows }, function () { return '<i></i>'; }).join('');
      q.classes.filter(function (c) { return !c.async && c.days.indexOf(day) >= 0; }).forEach(function (c) {
        const col = CLASS_COLORS[c.color % CLASS_COLORS.length];
        const top = (c.start - first) * rowH;
        const height = Math.max(26, (c.end - c.start) * rowH - 3);
        grid += '<div class="shot-block" style="top:' + top + 'px;height:' + height + 'px;background:' + col.bg + ';color:' + col.text + ';' + (c.online ? 'border:1px dashed ' + col.text + ';' : '') + '">' +
          '<b>' + escapeHtml(c.code) + '</b>' +
          (c.name ? '<span>' + escapeHtml(c.name) + '</span>' : '') +
          (c.online ? '<span>Online</span>' : (c.room ? '<span>' + escapeHtml(c.room) + '</span>' : '')) +
          (c.prof ? '<span>' + escapeHtml(c.prof) + '</span>' : '') +
          '<span>' + shotTime(c.start, c.end) + '</span></div>';
      });
      grid += '</div>';
    }
    grid += '</div>';
    box.innerHTML = '<div class="shot-title"><h2>' + escapeHtml(q.name) + '</h2><span>' + credits + ' credits</span></div>' +
      (asyncL.length ? '<div class="shot-async"><b>Online classes:</b> ' + asyncL.map(function (c) { return escapeHtml(c.code) + (c.name ? ' (' + escapeHtml(c.name) + ')' : ''); }).join(', ') + '</div>' : '') +
      '<div class="shot-grid">' + grid + '</div>' +
      '<div class="shot-hint">Take your screenshot now. Tap anywhere to close.</div>';
    box.hidden = false;
  }
  document.getElementById('shotMode').addEventListener('click', function () { this.hidden = true; });

  function bindSchedule() {
    document.getElementById('qtrPrevBtn').onclick = function () { goQuarter(-1); };
    document.getElementById('qtrNextBtn').onclick = function () { goQuarter(1); };
    document.getElementById('schedAddBtn').onclick = function () { openClassModal(); };
    document.getElementById('schedShotBtn').onclick = openShotMode;
    document.getElementById('schedSemester').onchange = function (e) {
      activeQuarter().name = e.target.value.trim() || 'My quarter';
      saveAccount(); renderSchedule();
    };
    document.getElementById('schedOnline').onclick = function (e) {
      const chip = e.target.closest('.so-chip');
      if (chip) openClassModal(Number(chip.dataset.clsId));
    };
    document.getElementById('schedGrid').onclick = function (e) {
      const block = e.target.closest('.sg-block');
      if (block) openClassModal(Number(block.dataset.clsId));
    };
  }

  const onboardCopy = [
    { t: 'A campus feed, not a group chat', p: 'Boards, transfer stories, and professor reviews for Seattle Central students. Unofficial and student-run.' },
    { t: 'Nickname, not legal name', p: 'Use any email to join. Comments show your nickname. Be kind — report anything that feels unsafe.' },
    { t: 'Post where it belongs', p: 'Write posts on Boards, stories on Transfers, reviews on Profs. Your timer and schedule stay private on My Page.' }
  ];

  function renderOnboard() {
    const s = onboardCopy[onboardStep];
    document.getElementById('onboardSlides').innerHTML = `<h1 class="gate-title">${s.t}</h1><p class="gate-lede">${s.p}</p><p class="onboard-dots">${onboardCopy.map(function (_, i) {
      return '<span class="' + (i === onboardStep ? 'on' : '') + '"></span>';
    }).join('')}</p>`;
    document.getElementById('onboardNext').textContent = onboardStep === 2 ? 'Continue' : 'Next';
  }

  function showApp() {
    document.getElementById('onboardGate').hidden = true;
    document.getElementById('authGate').hidden = true;
    document.getElementById('guestBar').hidden = !Store.guest;
    document.getElementById('appRoot').hidden = false;
    const h = hashPage();
    goPage(h.name, h.extra);
  }

  function showAuth() {
    document.getElementById('onboardGate').hidden = true;
    document.getElementById('authGate').hidden = false;
    document.getElementById('appRoot').hidden = true;
    const demo = !Store.supabaseEnabled();
    document.getElementById('modeBanner').textContent = demo
      ? 'Demo mode: data stays in this browser until you add Supabase keys in js/config.js. Classmates on other phones will not see your posts yet.'
      : 'Live mode: posts are shared with signed-in Seattle Central students.';
    document.getElementById('modeBanner').className = 'mode-banner ' + (demo ? 'warn' : 'ok');
  }

  function showEntry() {
    Store.guest = true;
    showApp();
  }
  function openAuth(mode) {
    document.getElementById('guestPromptOverlay').classList.remove('show');
    showAuth();
    setAuthMode(mode);
  }
  document.getElementById('authBack').onclick = function (e) { e.preventDefault(); showEntry(); };

  function showGuestPrompt() {
    document.getElementById('guestPromptOverlay').classList.add('show');
  }
  document.getElementById('gpNot').onclick = function () { document.getElementById('guestPromptOverlay').classList.remove('show'); };
  document.getElementById('gpLogin').onclick = function () { openAuth('login'); };
  document.getElementById('gpSignup').onclick = function () { openAuth('signup'); };
  document.getElementById('guestBarLogin').onclick = function () { openAuth('login'); };
  document.getElementById('guestBarSignup').onclick = function () { openAuth('signup'); };

  var GUEST_LOCKED = '.post[data-post-id], .hot-item[data-post-id], [data-like], .story-save-btn, #storyComposer, #profComposer, [data-empty-action], #fab, #alertsBtn, #searchBtn, [data-page="my"], [data-page="timer"], [data-page="schedule"]';
  document.addEventListener('click', function (e) {
    if (!Store.guest || document.getElementById('appRoot').hidden) return;
    const auth = e.target.closest('[data-guest-auth]');
    if (auth) { e.preventDefault(); e.stopPropagation(); openAuth(auth.dataset.guestAuth); return; }
    if (e.target.closest('#guestPromptOverlay') || e.target.closest('#guestBar')) return;
    if (e.target.closest(GUEST_LOCKED)) { e.preventDefault(); e.stopPropagation(); showGuestPrompt(); }
  }, true);

  function guestFoot() {
    if (!Store.guest) return '';
    return `<div class="guest-foot"><p>Sign up free to see more posts and write your own.</p>
      <div class="guest-foot-btns"><button class="btn btn-ghost" type="button" data-guest-auth="login">Log in</button>
      <button class="btn btn-primary" type="button" data-guest-auth="signup">Sign up</button></div></div>`;
  }

  function showOnboard() {
    document.getElementById('onboardGate').hidden = false;
    document.getElementById('authGate').hidden = true;
    document.getElementById('appRoot').hidden = true;
    onboardStep = 0;
    renderOnboard();
  }

  async function boot() {
    await Store.init();
    const flagged = localStorage.getItem('scc_onboard_done');
    if (!flagged) {
      showOnboard();
      return;
    }
    if (!Store.currentUser()) {
      showEntry();
      return;
    }
    showApp();
  }

  document.getElementById('onboardSkip').onclick = function () {
    localStorage.setItem('scc_onboard_done', '1');
    if (Store.currentUser()) showApp(); else showEntry();
  };
  document.getElementById('onboardNext').onclick = function () {
    if (onboardStep < 2) { onboardStep++; renderOnboard(); return; }
    localStorage.setItem('scc_onboard_done', '1');
    if (Store.currentUser()) showApp(); else showEntry();
  };

  let authMode = 'login';
  function setAuthMode(m) {
    authMode = m;
    const signup = m === 'signup';
    document.getElementById('tabLogin').classList.toggle('on', !signup);
    document.getElementById('tabSignup').classList.toggle('on', signup);
    document.getElementById('nickRow').hidden = !signup;
    document.getElementById('confirmRow').hidden = !signup;
    document.getElementById('authSubmit').textContent = signup ? 'Create account' : 'Log in';
    document.getElementById('authLede').textContent = signup
      ? 'Use a nickname, never your legal name. Posts are public to signed-in classmates.'
      : 'Welcome back. Log in with your email.';
    document.getElementById('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
    document.getElementById('authError').textContent = '';
  }
  document.getElementById('tabLogin').onclick = function () { setAuthMode('login'); };
  document.getElementById('tabSignup').onclick = function () { setAuthMode('signup'); };

  document.getElementById('authSubmit').onclick = async function () {
    const email = document.getElementById('authEmail').value;
    const nickname = document.getElementById('authNickname').value;
    const password = document.getElementById('authPassword').value;
    const err = document.getElementById('authError');
    const btn = document.getElementById('authSubmit');
    err.textContent = '';
    if (authMode === 'signup' && password !== document.getElementById('authPassword2').value) {
      err.textContent = 'The two passwords do not match.';
      return;
    }
    btn.disabled = true;
    let result;
    try {
      result = authMode === 'signup'
        ? await Store.signUp(email, nickname, password)
        : await Store.logIn(email, password);
    } catch (e) {
      result = { ok: false, error: 'Something went wrong. Please try again.' };
    }
    btn.disabled = false;
    if (!result.ok) { err.textContent = result.error; return; }
    if (result.confirmEmail) {
      setAuthMode('login');
      err.textContent = 'Account created. Check your email to confirm, then log in.';
      return;
    }
    Store.guest = false;
    showApp();
  };

  document.querySelectorAll('.navbtn, .dn-item').forEach(function (btn) {
    btn.addEventListener('click', function () { navTo(btn.dataset.page); });
  });
  document.getElementById('searchBtn').onclick = function () { navTo('search'); };
  document.getElementById('alertsBtn').onclick = function () { navTo('alerts'); };
  document.getElementById('postBackBtn').onclick = function () {
    const h = lastHash || '#home';
    if (location.hash !== h) location.hash = h; else { const hp = hashPage(); goPage(hp.name, hp.extra); }
  };
  document.getElementById('asideShareBtn').onclick = openStoryModal;

  document.getElementById('fab').onclick = function () {
    const name = hashPage().name;
    if (name === 'stories') openStoryModal();
    else if (name === 'professors') openProfModal();
    else openModal(name === 'board' ? activeBoard : 'free');
  };

  document.getElementById('main').addEventListener('click', function (e) {
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) { e.stopPropagation(); toggleLike(likeBtn.dataset.like); return; }
    const cat = e.target.closest('.board-cat');
    if (cat) { activeBoard = cat.dataset.board; navTo('board', cat.dataset.board); return; }
    const go = e.target.closest('[data-go]');
    if (go) { navTo(go.dataset.go); return; }
    const empty = e.target.closest('[data-empty-action]');
    if (empty) {
      const a = empty.dataset.emptyAction;
      if (a === 'compose') openModal(hashPage().name === 'board' ? activeBoard : 'free');
      if (a === 'story') openStoryModal();
      if (a === 'review') openProfModal();
      return;
    }
    const pill = e.target.closest('[data-board-filter]');
    if (pill) {
      activeBoard = pill.dataset.boardFilter; openPlanId = null;
      try { history.replaceState(null, '', activeBoard === 'all' ? '#board' : '#board/' + activeBoard); } catch (err) {}
      renderBoard(); return;
    }
    const save = e.target.closest('.story-save-btn');
    if (save) { Store.toggleSaveStory(save.dataset.storyId); renderStories(); return; }
    const storyC = e.target.closest('#storyComposer');
    if (storyC) { openStoryModal(); return; }
    const profC = e.target.closest('#profComposer');
    if (profC) { openProfModal(); return; }
    const post = e.target.closest('.post[data-post-id], .hot-item[data-post-id]');
    if (post) { editingCommentIndex = null; openPost(post.dataset.postId); return; }
    const myItem = e.target.closest('#myMenuList [data-my]');
    if (myItem) { handleMy(myItem.dataset.my); return; }
    const myPage = e.target.closest('#myMenuList [data-page]');
    if (myPage) { navTo(myPage.dataset.page); return; }
    const report = e.target.closest('[data-report]');
    if (report) {
      reportTarget = { kind: report.dataset.report, id: report.dataset.id };
      document.getElementById('reportModalOverlay').classList.add('show');
      return;
    }
    const block = e.target.closest('[data-block]');
    if (block) {
      if (confirm('Hide all posts from this author on your account?')) {
        const k = block.dataset.block, bid = block.dataset.id;
        const list = k === 'post' ? posts : k === 'story' ? stories : profReviews;
        const item = list.find(function (x) { return String(x.id) === String(bid); });
        Store.blockAuthorOf(k, bid, item && item.authorId);
        navTo(hashPage().name === 'post' ? 'home' : hashPage().name);
      }
    }
  });

  function handleMy(key) {
    const user = Store.currentUser();
    if (key === 'signout') {
      Store.signOut().then(showEntry);
      return;
    }
    if (key === 'posts') {
      const mine = posts.filter(function (p) { return p.authorId === user.userId; });
      const html = mine.length ? mine.map(function (p) {
        return `<button class="menu-item" type="button" data-post-id="${escapeHtml(p.id)}">
          <div><div style="font-weight:700;font-size:13.5px;">${escapeHtml(p.title)}</div>
          <div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(boardNames[p.board] || p.board || 'Post')} · ${escapeHtml(timeAgo(p.ts))}</div></div>
          <span class="right">›</span></button>`;
      }).join('') : emptyHTML('No posts yet', 'Anything you post will show up here.');
      openMyModal('My posts (' + mine.length + ')', html);
    } else if (key === 'comments') {
      const all = [];
      posts.forEach(function (p) {
        (p.comments || []).forEach(function (c) {
          if (c.authorId === user.userId) all.push(Object.assign({}, c, { postId: p.id, postTitle: p.title }));
        });
      });
      const html = all.length ? all.map(function (c) {
        return `<button class="menu-item" type="button" data-post-id="${escapeHtml(c.postId)}">
          <div><div style="font-size:13px;">${escapeHtml(c.text)}</div>
          <div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px;">on “${escapeHtml(c.postTitle)}”</div></div>
          <span class="right">›</span></button>`;
      }).join('') : emptyHTML('No comments yet', 'Comments you leave will show up here.');
      openMyModal('My comments (' + all.length + ')', html);
    } else if (key === 'saved') {
      const saved = stories.filter(function (s) { return account().savedStoryIds.indexOf(s.id) >= 0; });
      const html = saved.length ? saved.map(function (s) {
        return `<button class="menu-item" type="button" data-goto-story="1">
          <div><div style="font-weight:700;font-size:13.5px;">${escapeHtml(s.major)}</div>
          <div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(s.from)} → ${escapeHtml(s.to)}</div></div>
          <span class="right">›</span></button>`;
      }).join('') : emptyHTML('No saved stories', 'Tap Save on a transfer story to bookmark it.');
      openMyModal('Saved stories (' + saved.length + ')', html);
    } else if (key === 'notif') {
      const s = account().settings;
      openMyModal('Notification settings', `
        <button class="menu-item" type="button" data-notif="notifyComments">Comments on my posts <span class="right">${s.notifyComments ? 'On ✓' : 'Off'}</span></button>
        <button class="menu-item" type="button" data-notif="notifyReplies">Replies to my comments <span class="right">${s.notifyReplies ? 'On ✓' : 'Off'}</span></button>`);
    } else if (key === 'verify') {
      openMyModal('Email', `<p class="aside-copy">Signed in as ${escapeHtml(user.email)}. Your nickname is what classmates see.</p>`);
    } else if (key === 'about') {
      openMyModal('About this app', `<p class="aside-copy">Seattle Central Community is an unofficial, student-run space for anonymous (nicknamed) posts, transfer stories, and professor reviews. It is not affiliated with Seattle Central College administration.</p>`);
    }
  }

  function commentIdAt(i) {
    const p = posts.find(function (x) { return String(x.id) === String(openPostId); });
    return p && p.comments && p.comments[i] ? p.comments[i].id : null;
  }
  document.getElementById('postDetailContent').addEventListener('click', async function (e) {
    if (openPostId == null) return;
    if (e.target.closest('[data-edit-post]')) { openEditPost(openPostId); return; }
    if (e.target.closest('[data-delete-post]')) {
      if (!confirm('Delete this post? This cannot be undone.')) return;
      await Store.deletePost(openPostId);
      navTo(lastPage || 'board');
      return;
    }
    const editBtn = e.target.closest('[data-edit-comment]');
    if (editBtn) { editingCommentIndex = Number(editBtn.dataset.editComment); openPost(openPostId, true, true); return; }
    const delBtn = e.target.closest('[data-delete-comment]');
    if (delBtn) {
      if (!confirm('Delete this comment?')) return;
      const di = Number(delBtn.dataset.deleteComment);
      await Store.deleteComment(openPostId, di, commentIdAt(di));
      await refreshCache();
      openPost(openPostId, true, true);
      return;
    }
    const saveBtn = e.target.closest('[data-save-comment]');
    if (saveBtn) {
      const input = document.getElementById('commentEditInput');
      const si = Number(saveBtn.dataset.saveComment);
      if (!input.value.trim()) { input.focus(); return; }
      await Store.updateComment(openPostId, si, input.value.trim(), commentIdAt(si));
      editingCommentIndex = null;
      await refreshCache();
      openPost(openPostId, true, true);
      return;
    }
    if (e.target.closest('[data-cancel-comment]')) { editingCommentIndex = null; openPost(openPostId, true, true); }
  });

  document.getElementById('modalCancel').onclick = function () {
    editingPostId = null;
    document.getElementById('modalOverlay').classList.remove('show');
  };
  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) { editingPostId = null; e.currentTarget.classList.remove('show'); }
  });
  document.getElementById('modalPost').onclick = function () { busy(this, submitPost); };
  async function submitPost() {
    const board = document.getElementById('modalBoard').value;
    const title = document.getElementById('modalTitleInput').value.trim();
    const body = document.getElementById('modalBody').value.trim();
    if (!title) { document.getElementById('modalTitleInput').focus(); return; }
    if (editingPostId != null) {
      const ur = await Store.updatePost(editingPostId, { board: board, title: title, body: body || '(no description)' });
      if (ur && ur.ok === false) { alert('Could not save: ' + ur.error); return; }
      const editedId = editingPostId;
      editingPostId = null;
      document.getElementById('modalOverlay').classList.remove('show');
      await refreshCache();
      openPost(editedId, true);
      return;
    }
    const cr = await Store.createPost({ board: board, title: title, body: body || '(no description)' });
    if (cr && cr.ok === false) { alert('Could not post: ' + cr.error); return; }
    document.getElementById('modalOverlay').classList.remove('show');
    activeBoard = board;
    navTo('board', board);
  }

  document.getElementById('storyModalCancel').onclick = function () { document.getElementById('storyModalOverlay').classList.remove('show'); };
  document.getElementById('storyModalOverlay').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
  document.getElementById('storyModalPost').onclick = function () { busy(this, submitStory); };
  async function submitStory() {
    const to = document.getElementById('storyTo').value.trim();
    if (!to) { document.getElementById('storyTo').focus(); return; }
    const sr = await Store.createStory({
      from: document.getElementById('storyFrom').value.trim() || 'Seattle Central',
      to: to,
      major: document.getElementById('storyMajor').value.trim() || 'Undeclared',
      gpa: document.getElementById('storyGpa').value.trim() || '—',
      text: document.getElementById('storyText').value.trim() || '(no story shared)'
    });
    if (sr && sr.ok === false) { alert('Could not post: ' + sr.error); return; }
    document.getElementById('storyModalOverlay').classList.remove('show');
    navTo('stories');
  }

  document.getElementById('profModalCancel').onclick = function () { document.getElementById('profModalOverlay').classList.remove('show'); };
  document.getElementById('profModalOverlay').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
  document.getElementById('profModalPost').onclick = function () { busy(this, submitReview); };
  async function submitReview() {
    const prof = canonicalProfName(document.getElementById('profRevName').value);
    if (!prof) { document.getElementById('profRevName').focus(); return; }
    if (!pkPicked) {
      showClassErr(document.getElementById('profClassManual').hidden ? 'Please pick a class, or add a new one.' : 'Please finish adding the class first (tap "Add class").');
      document.getElementById('profClassErr').scrollIntoView({ block: 'center' });
      return;
    }
    const rr = await Store.createReview({
      prof: prof,
      course: (function () {
        const typedCode = document.getElementById('profRevCourse').value;
        const typedName = document.getElementById('profRevCourseName').value.trim().replace(/\s+/g, ' ');
        const known = courseIndex()[codeKey(typedCode)];
        const code = known ? known.code : (normCode(typedCode) || 'Course');
        const name = known && known.name ? known.name : typedName;
        return code + (name ? ' · ' + name : '');
      })(),
      quarter: profQuarter + ' ' + document.getElementById('profRevYear').value,
      rating: parseInt(document.getElementById('profRevRating').value, 10),
      text: document.getElementById('profRevText').value.trim() || '(no experience shared)'
    });
    if (rr && rr.ok === false) { alert('Could not post: ' + rr.error); return; }
    document.getElementById('profModalOverlay').classList.remove('show');
    navTo('professors');
  }

  document.getElementById('reportCancel').onclick = function () { document.getElementById('reportModalOverlay').classList.remove('show'); };
  document.getElementById('reportSubmit').onclick = function () {
    busy(this, async function () {
      if (reportTarget) await Store.report(reportTarget.kind, reportTarget.id, document.getElementById('reportReason').value);
      document.getElementById('reportModalOverlay').classList.remove('show');
      navTo(hashPage().name === 'post' ? 'board' : hashPage().name);
    });
  };
  document.getElementById('reportModalOverlay').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
  document.getElementById('guestPromptOverlay').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });

  document.getElementById('myModalClose').onclick = function () { document.getElementById('myModalOverlay').classList.remove('show'); };
  document.getElementById('myModalOverlay').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
  document.getElementById('myModalBody').addEventListener('click', function (e) {
    const postRow = e.target.closest('[data-post-id]');
    if (postRow) {
      document.getElementById('myModalOverlay').classList.remove('show');
      openPost(postRow.dataset.postId);
      return;
    }
    if (e.target.closest('[data-goto-story]')) {
      document.getElementById('myModalOverlay').classList.remove('show');
      navTo('stories');
      return;
    }
    const notifRow = e.target.closest('[data-notif]');
    if (notifRow) {
      const key = notifRow.dataset.notif;
      account().settings[key] = !account().settings[key];
      saveAccount();
      handleMy('notif');
    }
  });

  document.getElementById('alertsList').addEventListener('click', function (e) {
    const row = e.target.closest('[data-post-id]');
    if (row && row.dataset.postId) openPost(row.dataset.postId);
  });

  let searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    const q = e.target.value;
    searchTimer = setTimeout(function () { renderSearch(q); }, 120);
  });

  document.getElementById('clsDays').addEventListener('click', function (e) {
    const chip = e.target.closest('.day-chip'); if (!chip) return;
    const d = Number(chip.dataset.day);
    if (clsSelectedDays.has(d)) clsSelectedDays.delete(d); else clsSelectedDays.add(d);
    chip.classList.toggle('on');
  });
  document.getElementById('clsColors').addEventListener('click', function (e) {
    const dot = e.target.closest('.color-dot'); if (!dot) return;
    clsSelectedColor = Number(dot.dataset.color);
    document.querySelectorAll('#clsColors .color-dot').forEach(function (x) { x.classList.toggle('on', x === dot); });
  });
  document.getElementById('clsCancel').onclick = function () { document.getElementById('classModalOverlay').classList.remove('show'); };
  document.getElementById('classModalOverlay').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
  document.getElementById('clsDelete').onclick = function () {
    activeQuarter().classes = activeQuarter().classes.filter(function (c) { return c.id !== clsEditingId; });
    saveAccount();
    document.getElementById('classModalOverlay').classList.remove('show');
    renderSchedule();
  };
  document.getElementById('clsSave').onclick = function () {
    const code = document.getElementById('clsCode').value.trim();
    if (!code) { document.getElementById('clsCode').focus(); return; }
    const isAsync = clsOnline && clsAsync;
    if (!isAsync && clsSelectedDays.size === 0) {
      document.getElementById('clsDays').style.outline = '2px solid var(--warn)';
      setTimeout(function () { document.getElementById('clsDays').style.outline = ''; }, 1200);
      return;
    }
    let start = parseFloat(document.getElementById('clsStart').value);
    let end = parseFloat(document.getElementById('clsEnd').value);
    if (end <= start) end = Math.min(SCHED_END, start + 1);
    const data = {
      code: code,
      name: document.getElementById('clsName').value.trim(),
      room: document.getElementById('clsRoom').value.trim(),
      prof: document.getElementById('clsProf').value.trim(),
      online: clsOnline,
      async: isAsync,
      days: isAsync ? [] : Array.from(clsSelectedDays).sort(),
      start: isAsync ? 0 : start,
      end: isAsync ? 0 : end,
      color: clsSelectedColor,
      credits: Math.max(0, parseInt(document.getElementById('clsCredits').value, 10) || 0)
    };
    if (clsEditingId != null) {
      const c = activeQuarter().classes.find(function (x) { return x.id === clsEditingId; });
      Object.assign(c, data);
    } else {
      activeQuarter().classes.push(Object.assign({ id: account().schedule.nextId++ }, data));
    }
    saveAccount();
    document.getElementById('classModalOverlay').classList.remove('show');
    renderSchedule();
  };

  let skipHashFor = null;
  window.addEventListener('hashchange', function () {
    if (document.getElementById('appRoot').hidden) return;
    if (skipHashFor && location.hash === skipHashFor) { skipHashFor = null; return; }
    skipHashFor = null;
    const h = hashPage();
    goPage(h.name, h.extra);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  boot();
})();
