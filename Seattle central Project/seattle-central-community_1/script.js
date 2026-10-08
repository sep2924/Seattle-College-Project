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

  function postHTML(p) {
    return `<article class="post" data-post-id="${escapeHtml(p.id)}">
      <div class="post-meta"><span class="post-tag">${escapeHtml(boardNames[p.board] || p.board)}</span><span>·</span><span>Seattle Central</span><span>·</span><span>${escapeHtml(timeAgo(p.ts))}</span>${sampleBadge(p)}</div>
      <h3 class="post-title">${escapeHtml(p.title)}</h3>
      <p class="post-body">${escapeHtml(p.body)}</p>
      <div class="post-foot"><span>♡ ${p.likes || 0}</span><span>${(p.comments || []).length} comments</span></div>
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
      <div class="safety-row">
        <button class="story-save-btn ${saved ? 'saved' : ''}" type="button" data-story-id="${escapeHtml(s.id)}">${saved ? '★ Saved' : '☆ Save'}</button>
        ${mine ? '' : `<button class="text-action" type="button" data-report="story" data-id="${escapeHtml(s.id)}">Report</button>
        <button class="text-action danger" type="button" data-block="story" data-id="${escapeHtml(s.id)}">Block</button>`}
      </div>
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
      ${mine ? '' : `<div class="safety-row">
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
      <div class="pulse">
        <div class="pulse-label"><span class="live-dot"></span>Campus Pulse</div>
        <div class="pulse-track" id="pulseTrack"></div>
      </div>
      <div class="section-head"><h2>Boards</h2><a href="#board">See all</a></div>
      <div class="board-grid">
        ${Object.keys(boardNames).map(function (k) {
          return `<button class="board-cat" type="button" data-board="${k}"><span>${escapeHtml(boardNames[k])}</span></button>`;
        }).join('')}
      </div>
      <div class="section-head"><h2>Campus feed</h2></div>
      <div id="homeFeed">
        ${feed.length ? feed.map(feedItemHTML).join('') : emptyHTML('Nothing in the feed yet', 'Write the first post for your classmates.', 'Write a post', 'compose')}
      </div>`;
    showPulse();
  }

  function renderBoard() {
    const el = document.getElementById('page-board');
    const all = [{ key: 'all', label: 'All' }].concat(Object.keys(boardNames).map(function (key) {
      return { key: key, label: boardNames[key] };
    }));
    const filtered = posts.filter(function (p) { return activeBoard === 'all' || p.board === activeBoard; });
    el.innerHTML = `
      <div class="filter-row" id="filterRow">
        ${all.map(function (b) {
          return `<button class="pill ${activeBoard === b.key ? 'active' : ''}" type="button" data-board-filter="${b.key}">${escapeHtml(b.label)}</button>`;
        }).join('')}
      </div>
      <div id="boardPosts">
        ${filtered.map(postHTML).join('') || emptyHTML('Nothing here yet', 'Be the first to write in this board.', 'Write a post', 'compose')}
      </div>`;
  }

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
      </div>`;
  }

  function renderProfessors() {
    document.getElementById('page-professors').innerHTML = `
      <div class="section-head" style="padding-top:16px;"><h2>Professor Reviews</h2></div>
      <button class="composer-box" id="profComposer" type="button">
        <div class="composer-row"><div class="composer-text">Review a professor or class…</div></div>
        <div class="composer-prompts"><span>Professor name</span><span>Course code</span><span>Quarter taken</span><span>Rating (1–5)</span></div>
        <span class="composer-btn">Write a review</span>
      </button>
      <div class="prof-list" id="profList">
        ${profReviews.map(profFullHTML).join('') || emptyHTML('No reviews yet', 'Be the first to review a professor.', 'Write a review', 'review')}
      </div>`;
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
    bindTimer();
    renderTimerStats();
    renderTimerClock();
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
        <button class="btn btn-primary sched-add-btn" id="schedAddBtn" type="button">Add class</button>
      </div>
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
  setInterval(rotatePulse, 3200);

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

  async function goPage(name, extra) {
    if (name === 'post' && extra) {
      await refreshCache();
      openPost(extra, true);
      return;
    }
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    const page = document.getElementById('page-' + name);
    if (!page) {
      name = 'home';
    }
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

    await refreshCache();
    if (name === 'home') renderHome();
    if (name === 'board') {
      if (extra) activeBoard = extra;
      renderBoard();
    }
    if (name === 'stories') renderStories();
    if (name === 'professors') renderProfessors();
    if (name === 'my') renderMyPage();
    if (name === 'timer') renderTimerPage();
    if (name === 'schedule') renderSchedulePage();
    if (name === 'alerts') await renderAlerts();
    renderAside();
    await updateAlertDot();
    document.getElementById('main').scrollTo(0, 0);
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

  function openPost(id, skipNav) {
    const p = posts.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    openPostId = p.id;
    const comments = p.comments = p.comments || [];
    const user = Store.currentUser();
    const mine = user && p.authorId === user.userId;
    document.getElementById('postDetailContent').innerHTML = `
      <div class="post-detail">
        <div class="post-meta"><span class="post-tag">${escapeHtml(boardNames[p.board])}</span><span>·</span><span>Seattle Central</span><span>·</span><span>${escapeHtml(timeAgo(p.ts))}${p.edited ? ' · edited' : ''}</span>${sampleBadge(p)}</div>
        <h2 class="post-title">${escapeHtml(p.title)}</h2>
        <p class="post-body">${escapeHtml(p.body)}</p>
        <div class="post-foot"><span>♡ ${p.likes || 0}</span><span>${comments.length} comments</span></div>
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
          const initials = String(c.name || 'S').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
          const canEdit = user && c.authorId === user.userId;
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
              <div class="c-name">${escapeHtml(c.name)}</div>
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
      if (pg.classList.contains('active') && pg.id !== 'page-post') lastPage = pg.id.replace('page-', '');
    });
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('page-post').classList.add('active');
    document.getElementById('fab').hidden = true;
    if (!skipNav && location.hash !== '#post/' + p.id) location.hash = 'post/' + p.id;

    document.getElementById('commentSendBtn').onclick = async function () {
      const input = document.getElementById('commentInput');
      const text = input.value.trim();
      if (!text) return;
      await Store.addComment(p.id, text);
      editingCommentIndex = null;
      await refreshCache();
      openPost(id, true);
    };
  }

  function openModal(boardPreset) {
    editingPostId = null;
    document.getElementById('modalTitle').textContent = 'New post';
    document.getElementById('modalPost').textContent = 'Post anonymously';
    if (boardPreset && boardPreset !== 'all') document.getElementById('modalBoard').value = boardPreset;
    document.getElementById('modalTitleInput').value = '';
    document.getElementById('modalBody').value = '';
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

  function openProfModal() {
    document.getElementById('profRevName').value = '';
    document.getElementById('profRevCourse').value = '';
    document.getElementById('profRevQuarter').value = '';
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
  const hFmt = function (s) { return (s / 3600).toFixed(1) + 'h'; };
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
  }

  function timerToggle() {
    const tStartBtn = document.getElementById('timerStartBtn');
    const tClock = document.getElementById('timerClock');
    if (tInterval) {
      clearInterval(tInterval); tInterval = null;
      tStartBtn.textContent = 'Start';
      tClock.classList.remove('running');
    } else {
      tInterval = setInterval(function () { tSession++; renderTimerClock(); }, 1000);
      tStartBtn.textContent = 'Pause';
      tClock.classList.add('running');
    }
  }

  function bindTimer() {
    document.getElementById('timerStartBtn').onclick = timerToggle;
    document.getElementById('timerResetBtn').onclick = function () {
      if (tInterval) timerToggle();
      tSession = 0; renderTimerClock();
    };
    document.getElementById('timerSaveBtn').onclick = function () {
      if (!tSession) return;
      const k = dateKey(new Date());
      account().timer.days[k] = (account().timer.days[k] || 0) + tSession;
      saveAccount();
      if (tInterval) timerToggle();
      tSession = 0;
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
    document.getElementById('timerStats').innerHTML = [
      ['Today', today], ['This week', week], ['This month', month], ['All time', all]
    ].map(function (pair) {
      return `<div class="tstat"><div class="v">${hFmt(pair[1])}</div><div class="l">${pair[0]}</div></div>`;
    }).join('');
    const bars = [];
    let max = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const secs = days[dateKey(d)] || 0;
      max = Math.max(max, secs);
      bars.push({ label: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()], secs: secs, isToday: i === 0 });
    }
    document.getElementById('timerChart').innerHTML = bars.map(function (b) {
      const h = max ? Math.max(2, Math.round(b.secs / max * 70)) : 2;
      return `<div class="tbar${b.isToday ? ' today' : ''}">
        <div class="h">${b.secs ? (b.secs / 3600).toFixed(1) : ''}</div>
        <div class="bar" style="height:${h}px"></div>
        <div class="d">${b.label}</div></div>`;
    }).join('');
  }

  const SCHED_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const SCHED_START = 8, SCHED_END = 20;
  const CLASS_COLORS = [
    { bg: '#E3FBF6', text: '#00785F' },
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
      q.classes.filter(function (c) { return c.days.indexOf(day) >= 0; }).forEach(function (c) {
        const top = (c.start - SCHED_START) * rowH;
        const height = Math.max(20, (c.end - c.start) * rowH - 3);
        const col = CLASS_COLORS[c.color % CLASS_COLORS.length];
        html += `<button class="sg-block" type="button" data-cls-id="${c.id}"
          style="top:${top}px;height:${height}px;background:${col.bg};color:${col.text};">
          <div class="code">${escapeHtml(c.code)}</div>
          <div class="room">${escapeHtml(c.room || '')}</div></button>`;
      });
      html += '</div>';
    }
    html += '</div>';
    grid.innerHTML = html;
  }

  function buildTimeOptions() {
    let opts = '';
    for (let h = SCHED_START; h <= SCHED_END; h += 0.5) opts += '<option value="' + h + '">' + hourLabel(h) + '</option>';
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
  function openClassModal(id) {
    clsEditingId = id == null ? null : id;
    const c = id != null ? activeQuarter().classes.find(function (x) { return x.id === id; }) : null;
    document.getElementById('classModalTitle').textContent = c ? 'Edit class' : 'Add class';
    document.getElementById('clsCode').value = (c && c.code) || '';
    document.getElementById('clsName').value = (c && c.name) || '';
    document.getElementById('clsRoom').value = (c && c.room) || '';
    document.getElementById('clsCredits').value = (c && c.credits) != null ? c.credits : 5;
    clsSelectedDays = new Set((c && c.days) || []);
    clsSelectedColor = (c && c.color) != null ? c.color : (activeQuarter().classes.length % CLASS_COLORS.length);
    buildTimeOptions(); buildDayPicker(); buildColorPicker();
    document.getElementById('clsStart').value = (c && c.start) != null ? c.start : 9;
    document.getElementById('clsEnd').value = (c && c.end) != null ? c.end : 10;
    document.getElementById('clsDelete').hidden = !c;
    document.getElementById('classModalOverlay').classList.add('show');
  }

  function bindSchedule() {
    document.getElementById('qtrPrevBtn').onclick = function () { goQuarter(-1); };
    document.getElementById('qtrNextBtn').onclick = function () { goQuarter(1); };
    document.getElementById('schedAddBtn').onclick = function () { openClassModal(); };
    document.getElementById('schedSemester').onchange = function (e) {
      activeQuarter().name = e.target.value.trim() || 'My quarter';
      saveAccount(); renderSchedule();
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
      showAuth();
      return;
    }
    showApp();
  }

  document.getElementById('onboardSkip').onclick = function () {
    localStorage.setItem('scc_onboard_done', '1');
    if (Store.currentUser()) showApp(); else showAuth();
  };
  document.getElementById('onboardNext').onclick = function () {
    if (onboardStep < 2) { onboardStep++; renderOnboard(); return; }
    localStorage.setItem('scc_onboard_done', '1');
    if (Store.currentUser()) showApp(); else showAuth();
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
    showApp();
  };

  document.querySelectorAll('.navbtn, .dn-item').forEach(function (btn) {
    btn.addEventListener('click', function () { navTo(btn.dataset.page); });
  });
  document.getElementById('searchBtn').onclick = function () { navTo('search'); };
  document.getElementById('alertsBtn').onclick = function () { navTo('alerts'); };
  document.getElementById('postBackBtn').onclick = function () { navTo(lastPage || 'home'); };
  document.getElementById('asideShareBtn').onclick = openStoryModal;

  document.getElementById('fab').onclick = function () {
    const name = hashPage().name;
    if (name === 'stories') openStoryModal();
    else if (name === 'professors') openProfModal();
    else openModal(activeBoard);
  };

  document.getElementById('main').addEventListener('click', function (e) {
    const cat = e.target.closest('.board-cat');
    if (cat) { activeBoard = cat.dataset.board; navTo('board', cat.dataset.board); return; }
    const go = e.target.closest('[data-go]');
    if (go) { navTo(go.dataset.go); return; }
    const empty = e.target.closest('[data-empty-action]');
    if (empty) {
      const a = empty.dataset.emptyAction;
      if (a === 'compose') openModal(activeBoard);
      if (a === 'story') openStoryModal();
      if (a === 'review') openProfModal();
      return;
    }
    const pill = e.target.closest('[data-board-filter]');
    if (pill) { activeBoard = pill.dataset.boardFilter; renderBoard(); return; }
    const save = e.target.closest('.story-save-btn');
    if (save) { Store.toggleSaveStory(save.dataset.storyId); renderStories(); return; }
    const storyC = e.target.closest('#storyComposer');
    if (storyC) { openStoryModal(); return; }
    const profC = e.target.closest('#profComposer');
    if (profC) { openProfModal(); return; }
    const post = e.target.closest('.post[data-post-id]');
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
        Store.blockAuthorOf(block.dataset.block, block.dataset.id);
        navTo(hashPage().name === 'post' ? 'home' : hashPage().name);
      }
    }
  });

  function handleMy(key) {
    const user = Store.currentUser();
    if (key === 'signout') {
      Store.signOut().then(showAuth);
      return;
    }
    if (key === 'posts') {
      const mine = posts.filter(function (p) { return p.authorId === user.userId; });
      const html = mine.length ? mine.map(function (p) {
        return `<button class="menu-item" type="button" data-post-id="${escapeHtml(p.id)}">
          <div><div style="font-weight:700;font-size:13.5px;">${escapeHtml(p.title)}</div>
          <div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(boardNames[p.board])} · ${escapeHtml(timeAgo(p.ts))}</div></div>
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
    if (editBtn) { editingCommentIndex = Number(editBtn.dataset.editComment); openPost(openPostId, true); return; }
    const delBtn = e.target.closest('[data-delete-comment]');
    if (delBtn) {
      if (!confirm('Delete this comment?')) return;
      await Store.deleteComment(openPostId, Number(delBtn.dataset.deleteComment));
      await refreshCache();
      openPost(openPostId, true);
      return;
    }
    const saveBtn = e.target.closest('[data-save-comment]');
    if (saveBtn) {
      const input = document.getElementById('commentEditInput');
      await Store.updateComment(openPostId, Number(saveBtn.dataset.saveComment), input.value.trim());
      editingCommentIndex = null;
      await refreshCache();
      openPost(openPostId, true);
      return;
    }
    if (e.target.closest('[data-cancel-comment]')) { editingCommentIndex = null; openPost(openPostId, true); }
  });

  document.getElementById('modalCancel').onclick = function () {
    editingPostId = null;
    document.getElementById('modalOverlay').classList.remove('show');
  };
  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) { editingPostId = null; e.currentTarget.classList.remove('show'); }
  });
  document.getElementById('modalPost').onclick = async function () {
    const board = document.getElementById('modalBoard').value;
    const title = document.getElementById('modalTitleInput').value.trim();
    const body = document.getElementById('modalBody').value.trim();
    if (!title) { document.getElementById('modalTitleInput').focus(); return; }
    if (editingPostId != null) {
      await Store.updatePost(editingPostId, { board: board, title: title, body: body || '(no description)' });
      const editedId = editingPostId;
      editingPostId = null;
      document.getElementById('modalOverlay').classList.remove('show');
      await refreshCache();
      openPost(editedId, true);
      return;
    }
    await Store.createPost({ board: board, title: title, body: body || '(no description)' });
    document.getElementById('modalOverlay').classList.remove('show');
    activeBoard = board;
    navTo('board', board);
  };

  document.getElementById('storyModalCancel').onclick = function () { document.getElementById('storyModalOverlay').classList.remove('show'); };
  document.getElementById('storyModalOverlay').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
  document.getElementById('storyModalPost').onclick = async function () {
    const to = document.getElementById('storyTo').value.trim();
    if (!to) { document.getElementById('storyTo').focus(); return; }
    await Store.createStory({
      from: document.getElementById('storyFrom').value.trim() || 'Seattle Central',
      to: to,
      major: document.getElementById('storyMajor').value.trim() || 'Undeclared',
      gpa: document.getElementById('storyGpa').value.trim() || '—',
      text: document.getElementById('storyText').value.trim() || '(no story shared)'
    });
    document.getElementById('storyModalOverlay').classList.remove('show');
    navTo('stories');
  };

  document.getElementById('profModalCancel').onclick = function () { document.getElementById('profModalOverlay').classList.remove('show'); };
  document.getElementById('profModalOverlay').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
  document.getElementById('profModalPost').onclick = async function () {
    const prof = document.getElementById('profRevName').value.trim();
    if (!prof) { document.getElementById('profRevName').focus(); return; }
    await Store.createReview({
      prof: prof,
      course: document.getElementById('profRevCourse').value.trim() || 'Course',
      quarter: document.getElementById('profRevQuarter').value.trim() || 'Quarter',
      rating: parseInt(document.getElementById('profRevRating').value, 10),
      text: document.getElementById('profRevText').value.trim() || '(no experience shared)'
    });
    document.getElementById('profModalOverlay').classList.remove('show');
    navTo('professors');
  };

  document.getElementById('reportCancel').onclick = function () { document.getElementById('reportModalOverlay').classList.remove('show'); };
  document.getElementById('reportSubmit').onclick = async function () {
    if (reportTarget) await Store.report(reportTarget.kind, reportTarget.id, document.getElementById('reportReason').value);
    document.getElementById('reportModalOverlay').classList.remove('show');
    navTo(hashPage().name === 'post' ? 'board' : hashPage().name);
  };

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
    if (clsSelectedDays.size === 0) {
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
      days: Array.from(clsSelectedDays).sort(),
      start: start,
      end: end,
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

  window.addEventListener('hashchange', function () {
    if (document.getElementById('appRoot').hidden) return;
    const h = hashPage();
    goPage(h.name, h.extra);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  boot();
})();
