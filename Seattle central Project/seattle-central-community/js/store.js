(function (global) {
  const CONFIG = global.SCC_CONFIG;
  const DB_KEY = 'scc_community_v2';
  const SESSION_KEY = 'scc_session_v2';
  const PRIVATE_KEY = 'scc_private_v2';

  const BOARD_NAMES = {
    free: 'Free Talk',
    transfer: 'Transfer Q&A',
    courseplan: 'Course Plan Q&A',
    info: 'Info',
    dreams: 'Share Your Dream',
    events: 'Tutoring',
    confess: 'Share Study Materials'
  };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function now() { return Date.now(); }

  function emailDomain(email) {
    return String(email || '').toLowerCase().trim().split('@')[1] || '';
  }

  function isSchoolEmail(email) {
    const d = emailDomain(email);
    return (CONFIG.allowedEmailDomains || ['seattlecolleges.edu', 'seattlecentral.edu']).some(function (allowed) {
      return d === allowed || d.endsWith('.' + allowed);
    });
  }

  function defaultPrivate() {
    return {
      onboarded: false,
      savedStoryIds: [],
      settings: { notifyComments: true, notifyReplies: true },
      timer: { goalHours: 3, days: {} },
      schedule: {
        quarters: [{ name: 'Fall Quarter 2026', classes: [] }],
        active: 0,
        nextId: 1
      },
      hiddenPostIds: [],
      blockedUserIds: []
    };
  }

  function sampleSeed() {
    const sampleUser = {
      id: 'user_sample',
      email: 'sample@seattlecolleges.edu',
      nickname: 'Capitol Hill Owl',
      createdAt: now() - 86400000 * 4
    };
    const posts = [
      {
        id: 'post_sample_1',
        authorId: sampleUser.id,
        board: 'transfer',
        title: 'Anyone else applying to UW CS for winter?',
        body: 'I am wrapping up CHEM 161 and MATH 152 this quarter. Curious what GPA people felt competitive with, and whether they submitted a personal statement draft to the transfer center.',
        likes: 12,
        ts: now() - 3600000 * 6,
        edited: false,
        isSample: true,
        comments: [
          { id: 'c1', authorId: sampleUser.id, name: 'Capitol Hill Owl', text: 'Transfer center drop-in on Tuesdays was actually useful.', ts: now() - 3600000 * 5 }
        ]
      },
      {
        id: 'post_sample_2',
        authorId: sampleUser.id,
        board: 'free',
        title: 'Quiet study spots besides the library?',
        body: 'Library is packed after 11. Broadway Edison 3rd floor hallway benches have been decent if you have headphones.',
        likes: 8,
        ts: now() - 3600000 * 20,
        edited: false,
        isSample: true,
        comments: []
      },
      {
        id: 'post_sample_3',
        authorId: sampleUser.id,
        board: 'info',
        title: 'Reminder: add/drop deadline is this Friday',
        body: 'If you are waitlisted, check ctcLink tonight. A few MATH 151 seats opened yesterday.',
        likes: 21,
        ts: now() - 86400000,
        edited: false,
        isSample: true,
        comments: []
      }
    ];
    const stories = [
      {
        id: 'story_sample_1',
        authorId: sampleUser.id,
        from: 'Seattle Central',
        to: 'University of Washington',
        major: 'Biology',
        gpa: '3.71',
        text: 'I treated every STEM class like it counted for the major, even the ones that felt like filler. Office hours + a clean course plan from an advisor mattered more than one extra club.',
        school: 'sccc',
        ts: now() - 86400000 * 2,
        isSample: true
      }
    ];
    const reviews = [
      {
        id: 'rev_sample_1',
        authorId: sampleUser.id,
        prof: 'Dr. Park',
        course: 'ENGL 102',
        quarter: 'Spring 2026',
        rating: 4,
        text: 'Heavy feedback but fair. Read the rubric before you draft. Participation is actually part of the grade.',
        school: 'sccc',
        ts: now() - 86400000 * 3,
        isSample: true
      }
    ];
    return {
      users: [sampleUser],
      posts: posts,
      stories: stories,
      reviews: reviews,
      reports: [],
      notifications: [],
      seeded: true
    };
  }

  function emptyDb() {
    return { users: [], posts: [], stories: [], reviews: [], reports: [], notifications: [], reviewComments: [], courseLinks: [], linkVotes: [], seeded: false };
  }

  // Course key: "MATH& 151" and "math 151" both become "MATH151".
  function courseKey(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function reviewCourseKey(course) { return courseKey(String(course || '').split(' · ')[0]); }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return fallback;
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function migrateOldAccount(db, privateMap) {
    try {
      const raw = localStorage.getItem('scc_account');
      if (!raw) return { db: db, privateMap: privateMap };
      const old = JSON.parse(raw);
      if (!old || privateMap._migrated) return { db: db, privateMap: privateMap };
      if (Array.isArray(old.posts) && old.posts.length && db.posts.filter(function (p) { return !p.isSample; }).length === 0) {
        old.posts.forEach(function (p) {
          db.posts.unshift(Object.assign({}, p, {
            authorId: 'local_migrated',
            comments: p.commentList || [],
            isSample: false
          }));
        });
      }
      if (Array.isArray(old.stories)) {
        old.stories.forEach(function (s) {
          if (!db.stories.some(function (x) { return x.id === s.id; })) {
            db.stories.unshift(Object.assign({}, s, { authorId: 'local_migrated', isSample: false }));
          }
        });
      }
      if (Array.isArray(old.profReviews)) {
        old.profReviews.forEach(function (r) {
          db.reviews.unshift(Object.assign({}, r, { id: r.id || uid('rev'), authorId: 'local_migrated', isSample: false }));
        });
      }
      privateMap._migrated = true;
      if (old.timer || old.schedule) {
        privateMap._legacyTools = {
          timer: old.timer,
          schedule: old.schedule,
          savedStoryIds: old.savedStoryIds || [],
          settings: old.settings || { notifyComments: true, notifyReplies: true }
        };
      }
    } catch (e) {}
    return { db: db, privateMap: privateMap };
  }

  const Store = {
    mode: 'local',
    supabase: null,
    db: emptyDb(),
    session: null,
    privateMap: {},

    supabaseEnabled: function () {
      return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && global.supabase);
    },

    init: async function () {
      if (this.supabaseEnabled()) {
        this.mode = 'supabase';
        this.supabase = global.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
        const { data } = await this.supabase.auth.getSession();
        if (data && data.session) {
          this.session = await this._profileFromSupabase(data.session.user);
        }
        this.privateMap = readJson(PRIVATE_KEY, {});
        await this._pullPrivate();
        return;
      }
      this.mode = 'local';
      let db = readJson(DB_KEY, null);
      if (!db || !db.seeded) db = sampleSeed();
      let privateMap = readJson(PRIVATE_KEY, {});
      const migrated = migrateOldAccount(db, privateMap);
      this.db = migrated.db;
      this.privateMap = migrated.privateMap;
      this.session = readJson(SESSION_KEY, null);
      if (this.session && this.session.userId === 'local_migrated') this.session = null;
      this._persist();
    },

    _persist: function () {
      if (this.mode !== 'local') {
        writeJson(PRIVATE_KEY, this.privateMap);
        return;
      }
      writeJson(DB_KEY, this.db);
      writeJson(SESSION_KEY, this.session);
      writeJson(PRIVATE_KEY, this.privateMap);
    },

    isSchoolEmail: isSchoolEmail,
    boardNames: BOARD_NAMES,

    currentUser: function () { return this.session; },

    getPrivate: function () {
      const id = this.session && this.session.userId;
      if (!id) return defaultPrivate();
      if (!this.privateMap[id]) {
        this.privateMap[id] = defaultPrivate();
        if (this.privateMap._legacyTools && !this.privateMap[id]._tookLegacy) {
          const L = this.privateMap._legacyTools;
          if (L.timer) this.privateMap[id].timer = L.timer;
          if (L.schedule) this.privateMap[id].schedule = L.schedule;
          if (L.savedStoryIds) this.privateMap[id].savedStoryIds = L.savedStoryIds;
          if (L.settings) this.privateMap[id].settings = L.settings;
          this.privateMap[id]._tookLegacy = true;
        }
        this._persist();
      }
      return this.privateMap[id];
    },

    savePrivate: function () {
      this._persist();
      this._pushPrivateSoon();
    },

    // Timer, schedule, saved stories and settings follow the account (Supabase table user_data).
    _pullPrivate: async function () {
      if (this.mode !== 'supabase' || !this.session) return;
      try {
        const id = this.session.userId;
        const { data, error } = await this.supabase.from('user_data').select('data').eq('user_id', id).maybeSingle();
        if (error) { this._cloudOk = false; return; }
        this._cloudOk = true;
        if (data && data.data && typeof data.data === 'object') {
          this.privateMap[id] = Object.assign(defaultPrivate(), data.data);
          writeJson(PRIVATE_KEY, this.privateMap);
        } else {
          this.getPrivate();
          await this._pushPrivateNow();
        }
      } catch (e) { this._cloudOk = false; }
    },

    _pushPrivateSoon: function () {
      if (this.mode !== 'supabase' || !this.session || this._cloudOk === false) return;
      const self = this;
      clearTimeout(this._pushT);
      this._pushT = setTimeout(function () { self._pushPrivateNow(); }, 800);
    },

    _pushPrivateNow: async function () {
      if (this.mode !== 'supabase' || !this.session || this._cloudOk === false) return;
      try {
        const id = this.session.userId;
        await this.supabase.from('user_data').upsert({
          user_id: id, data: this.privateMap[id] || defaultPrivate(), updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      } catch (e) {}
    },

    signInLocal: function (email, nickname, password) {
      email = String(email || '').toLowerCase().trim();
      nickname = String(nickname || '').trim();
      password = String(password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Enter a valid email address.' };
      }
      if (nickname.length < 2 || nickname.length > 24) {
        return { ok: false, error: 'Pick a nickname between 2 and 24 characters. Do not use your legal name.' };
      }
      if (password.length < 8) {
        return { ok: false, error: 'Password must be at least 8 characters.' };
      }
      let user = this.db.users.find(function (u) { return u.email === email; });
      if (user) {
        if (user.password !== password) return { ok: false, error: 'That email is already registered. Check your password.' };
      } else {
        user = { id: uid('user'), email: email, nickname: nickname, password: password, createdAt: now() };
        this.db.users.push(user);
      }
      this.session = { userId: user.id, email: user.email, nickname: user.nickname };
      this.getPrivate();
      this._persist();
      return { ok: true };
    },

    signOut: async function () {
      if (this.mode === 'supabase' && this.supabase) await this.supabase.auth.signOut();
      this.session = null;
      this._persist();
    },

    signInSupabase: async function (email, nickname, password) {
      email = String(email || '').toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Enter a valid email address.' };
      }
      if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
      const { data, error } = await this.supabase.auth.signUp({
        email: email,
        password: password,
        options: { data: { nickname: nickname } }
      });
      if (error && /already/i.test(error.message)) {
        const signed = await this.supabase.auth.signInWithPassword({ email: email, password: password });
        if (signed.error) return { ok: false, error: signed.error.message };
        this.session = await this._profileFromSupabase(signed.data.user);
        await this._pullPrivate();
        return { ok: true };
      }
      if (error) return { ok: false, error: error.message };
      if (data.user) {
        await this.supabase.from('profiles').upsert({
          id: data.user.id,
          nickname: nickname || 'Anonymous Beaver',
          email: email
        });
        if (data.session) this.session = await this._profileFromSupabase(data.user);
        else return { ok: true, confirmEmail: true };
      }
      return { ok: true };
    },

    _profileFromSupabase: async function (user) {
      let { data } = await this.supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      const meta = (user.user_metadata && user.user_metadata.nickname) || 'Anonymous Beaver';
      if (!data) {
        // First login after email confirmation: create the profile row now.
        await this.supabase.from('profiles').upsert({ id: user.id, nickname: meta, email: user.email });
        data = { nickname: meta };
      }
      return { userId: user.id, email: user.email, nickname: data.nickname || meta };
    },

    // ---------- Separate Log in / Sign up ----------
    logIn: async function (email, password) {
      email = String(email || '').toLowerCase().trim();
      password = String(password || '');
      if (!email || !password) return { ok: false, error: 'Enter your email and password.' };
      if (this.mode === 'supabase') {
        const r = await this.supabase.auth.signInWithPassword({ email: email, password: password });
        if (r.error) {
          if (/not confirmed/i.test(r.error.message)) return { ok: false, error: 'Please confirm your email first. Check your inbox.' };
          return { ok: false, error: 'Wrong email or password.' };
        }
        this.session = await this._profileFromSupabase(r.data.user);
        await this._pullPrivate();
        return { ok: true };
      }
      const user = this.db.users.find(function (u) { return u.email === email; });
      if (!user) return { ok: false, error: 'No account found for that email. Please sign up.' };
      if (user.password !== password) return { ok: false, error: 'Wrong password.' };
      this.session = { userId: user.id, email: user.email, nickname: user.nickname };
      this.getPrivate();
      this._persist();
      return { ok: true };
    },

    signUp: async function (email, nickname, password) {
      email = String(email || '').toLowerCase().trim();
      nickname = String(nickname || '').trim();
      password = String(password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Enter a valid email address.' };
      }
      if (nickname.length < 2 || nickname.length > 24) {
        return { ok: false, error: 'Pick a nickname between 2 and 24 characters. Do not use your legal name.' };
      }
      if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
      if (this.mode === 'supabase') {
        const r = await this.supabase.auth.signUp({
          email: email, password: password, options: { data: { nickname: nickname } }
        });
        if (r.error) {
          if (/already/i.test(r.error.message)) return { ok: false, error: 'That email already has an account. Please log in.' };
          return { ok: false, error: r.error.message };
        }
        if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) {
          return { ok: false, error: 'That email already has an account. Please log in.' };
        }
        if (r.data.session) {
          this.session = await this._profileFromSupabase(r.data.user);
          await this._pullPrivate();
          return { ok: true };
        }
        return { ok: true, confirmEmail: true };
      }
      if (this.db.users.find(function (u) { return u.email === email; })) {
        return { ok: false, error: 'That email already has an account. Please log in.' };
      }
      return this.signInLocal(email, nickname, password);
    },

    _visible: function (authorId, id, kind) {
      const p = this.getPrivate();
      if ((kind === 'post' || kind === 'review_comment' || kind === 'course_link') && p.hiddenPostIds.indexOf(id) >= 0) return false;
      if (authorId && p.blockedUserIds.indexOf(authorId) >= 0) return false;
      return true;
    },

    // Public preview: a few latest posts, readable without logging in.
    previewPosts: async function () {
      if (this.mode === 'supabase') {
        const { data, error } = await this.supabase.rpc('public_preview');
        if (error) return [];
        return data || [];
      }
      return this.db.posts.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 5)
        .map(function (p) { return { title: p.title, body: p.body }; });
    },

    listPosts: async function () {
      if (this.guest) {
        if (this.mode === 'supabase') {
          const { data, error } = await this.supabase.rpc('public_posts');
          if (error) return [];
          return (data || []).map(function (r) {
            return { id: r.id, authorId: null, board: r.board, title: r.title, body: r.body, likes: r.likes || 0,
              ts: new Date(r.created_at).getTime(), edited: false, isSample: false, comments: [], commentCount: Number(r.comment_count) || 0 };
          });
        }
        return this.db.posts.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 10).map(normalizePost);
      }
      if (this.mode === 'supabase') {
        const { data, error } = await this.supabase.from('posts').select('*, comments(*)').order('created_at', { ascending: false });
        if (error) return [];
        const mineLikes = {};
        try {
          const lr = await this.supabase.from('post_likes').select('post_id').eq('user_id', this.session.userId);
          (lr.data || []).forEach(function (r) { mineLikes[r.post_id] = true; });
        } catch (e) {}
        return (data || []).map(function (row) {
          const p = fromSupabasePost(row);
          p.liked = !!mineLikes[p.id];
          return p;
        }).filter(function (p) {
          return Store._visible(p.authorId, p.id, 'post');
        });
      }
      return this.db.posts
        .filter(function (p) { return Store._visible(p.authorId, p.id, 'post'); })
        .slice()
        .sort(function (a, b) { return b.ts - a.ts; })
        .map(function (p) {
          const n = normalizePost(p);
          n.liked = !!(this.session && (p.likedBy || []).indexOf(this.session.userId) >= 0);
          return n;
        }, this);
    },

    // One like per person per post. Tap again to undo.
    toggleLike: async function (postId, wasLiked) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      if (this.mode === 'supabase') {
        if (wasLiked) {
          const { error } = await this.supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.userId);
          return error ? { ok: false, error: error.message } : { ok: true };
        }
        const { error } = await this.supabase.from('post_likes').insert({ post_id: postId, user_id: user.userId });
        if (error && error.code !== '23505') return { ok: false, error: error.message };
        return { ok: true };
      }
      const post = this.db.posts.find(function (x) { return String(x.id) === String(postId); });
      if (!post) return { ok: false, error: 'Post not found.' };
      post.likedBy = post.likedBy || [];
      const i = post.likedBy.indexOf(user.userId);
      if (i >= 0) { post.likedBy.splice(i, 1); post.likes = Math.max(0, (post.likes || 0) - 1); }
      else { post.likedBy.push(user.userId); post.likes = (post.likes || 0) + 1; }
      this._persist();
      return { ok: true };
    },

    listStories: async function () {
      if (this.guest) {
        if (this.mode === 'supabase') {
          const { data, error } = await this.supabase.rpc('public_stories');
          if (error) return [];
          return (data || []).map(function (r) {
            return { id: r.id, authorId: null, from: r.from_school, to: r.to_school, major: r.major, gpa: r.gpa,
              text: r.body, ts: new Date(r.created_at).getTime(), isSample: false };
          });
        }
        return this.db.stories.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 10);
      }
      if (this.mode === 'supabase') {
        const { data } = await this.supabase.from('stories').select('*').order('created_at', { ascending: false });
        return (data || []).map(fromSupabaseStory).filter(function (s) {
          return Store._visible(s.authorId, s.id, 'story');
        });
      }
      return this.db.stories.filter(function (s) { return Store._visible(s.authorId, s.id, 'story'); }).slice().sort(function (a, b) { return b.ts - a.ts; });
    },

    listReviews: async function () {
      if (this.guest) {
        if (this.mode === 'supabase') {
          const { data, error } = await this.supabase.rpc('public_reviews');
          if (error) return [];
          return (data || []).map(function (r) {
            return { id: r.id, authorId: null, prof: r.prof_name, course: r.course, quarter: r.quarter, rating: r.rating,
              text: r.body, tags: r.tags || [], edited: !!r.edited, ts: new Date(r.created_at).getTime(), isSample: false };
          });
        }
        return this.db.reviews.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 10);
      }
      if (this.mode === 'supabase') {
        const { data } = await this.supabase.from('prof_reviews').select('*').order('created_at', { ascending: false });
        return (data || []).map(fromSupabaseReview).filter(function (r) {
          return Store._visible(r.authorId, r.id, 'review');
        });
      }
      return this.db.reviews.filter(function (r) { return Store._visible(r.authorId, r.id, 'review'); }).slice().sort(function (a, b) { return b.ts - a.ts; });
    },

    getPost: async function (id) {
      const posts = await this.listPosts();
      return posts.find(function (p) { return String(p.id) === String(id); }) || null;
    },

    createPost: async function (payload) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Sign in first.' };
      const post = {
        id: uid('post'),
        authorId: user.userId,
        board: payload.board,
        title: payload.title,
        body: payload.body,
        likes: 0,
        ts: now(),
        edited: false,
        isSample: false,
        comments: []
      };
      if (this.mode === 'supabase') {
        const { data, error } = await this.supabase.from('posts').insert({
          author_id: user.userId,
          board: post.board,
          title: post.title,
          body: post.body
        }).select().single();
        if (error) return { ok: false, error: error.message };
        post.id = data.id;
        return { ok: true, post: post };
      }
      this.db.posts.unshift(post);
      this._persist();
      return { ok: true, post: post };
    },

    updatePost: async function (id, payload) {
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('posts')
          .update({ board: payload.board, title: payload.title, body: payload.body, edited: true })
          .eq('id', id).eq('author_id', this.session.userId);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const post = this.db.posts.find(function (p) { return p.id === id; });
      if (!post) return { ok: false, error: 'Post not found.' };
      if (post.authorId !== this.session.userId) return { ok: false, error: 'You can only edit your own posts.' };
      post.board = payload.board;
      post.title = payload.title;
      post.body = payload.body;
      post.edited = true;
      this._persist();
      return { ok: true };
    },

    deletePost: async function (id) {
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('posts').delete().eq('id', id);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const post = this.db.posts.find(function (p) { return p.id === id; });
      if (!post) return { ok: false };
      if (post.authorId !== this.session.userId && !post.isSample) return { ok: false, error: 'You can only delete your own posts.' };
      this.db.posts = this.db.posts.filter(function (p) { return p.id !== id; });
      this._persist();
      return { ok: true };
    },

    _commentIds: async function (postId) {
      const { data } = await this.supabase.from('comments').select('id, created_at')
        .eq('post_id', postId).order('created_at', { ascending: true }).order('id', { ascending: true });
      return (data || []).map(function (c) { return c.id; });
    },

    addComment: async function (postId, text) {
      const user = this.session;
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('comments').insert({
          post_id: postId, author_id: user.userId, nickname: 'Anonymous', body: text
        });
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const post = this.db.posts.find(function (p) { return p.id === postId; });
      if (!post) return { ok: false };
      const comment = { id: uid('c'), authorId: user.userId, name: 'Anonymous', text: text, ts: now() };
      post.comments = post.comments || [];
      post.comments.push(comment);
      if (post.authorId !== user.userId) {
        this.db.notifications.unshift({
          id: uid('n'),
          userId: post.authorId,
          text: 'Someone commented on “' + post.title + '”',
          ts: now(),
          read: false,
          postId: post.id
        });
      }
      this._persist();
      return { ok: true };
    },

    updateComment: async function (postId, idx, text, commentId) {
      if (this.mode === 'supabase') {
        const id = commentId || (await this._commentIds(postId))[idx];
        if (!id) return;
        await this.supabase.from('comments').update({ body: text, edited: true })
          .eq('id', id).eq('author_id', this.session.userId);
        return;
      }
      const post = this.db.posts.find(function (p) { return p.id === postId; });
      if (post && commentId) { const j = (post.comments || []).findIndex(function (c) { return c.id === commentId; }); if (j >= 0) idx = j; }
      if (!post || !post.comments[idx]) return;
      if (post.comments[idx].authorId !== this.session.userId) return;
      post.comments[idx].text = text;
      post.comments[idx].edited = true;
      this._persist();
    },

    deleteComment: async function (postId, idx, commentId) {
      if (this.mode === 'supabase') {
        const id = commentId || (await this._commentIds(postId))[idx];
        if (!id) return;
        await this.supabase.from('comments').delete()
          .eq('id', id).eq('author_id', this.session.userId);
        return;
      }
      const post = this.db.posts.find(function (p) { return p.id === postId; });
      if (!post) return;
      if (commentId) { const j = (post.comments || []).findIndex(function (c) { return c.id === commentId; }); if (j >= 0) idx = j; }
      const c = post.comments[idx];
      if (!c) return;
      if (c.authorId !== this.session.userId) return;
      post.comments.splice(idx, 1);
      this._persist();
    },

    createStory: async function (payload) {
      const user = this.session;
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('stories').insert({
          author_id: user.userId, from_school: payload.from, to_school: payload.to,
          major: payload.major, gpa: payload.gpa, body: payload.text
        });
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const story = Object.assign({
        id: uid('story'),
        authorId: user.userId,
        school: 'sccc',
        ts: now(),
        isSample: false
      }, payload);
      this.db.stories.unshift(story);
      this._persist();
      return story;
    },

    // One review per person for the same professor + class.
    _dupReview: function (payload, exceptId) {
      const me = this.session && this.session.userId;
      const k = reviewCourseKey(payload.course), pn = String(payload.prof || '').trim().toLowerCase();
      return this.db.reviews.find(function (r) {
        return r.authorId === me && r.id !== exceptId && reviewCourseKey(r.course) === k && String(r.prof || '').trim().toLowerCase() === pn;
      });
    },

    createReview: async function (payload) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      const tags = (payload.tags || []).slice(0, 6);
      if (this.mode === 'supabase') {
        const row = {
          author_id: user.userId, prof_name: payload.prof, course: payload.course,
          quarter: payload.quarter, rating: payload.rating, body: payload.text, tags: tags
        };
        let r = await this.supabase.from('prof_reviews').insert(row).select('id').single();
        if (r.error && /tags/i.test(r.error.message || '')) { delete row.tags; r = await this.supabase.from('prof_reviews').insert(row).select('id').single(); }
        if (r.error) {
          if (r.error.code === '23505') return { ok: false, duplicate: true, error: 'You already reviewed this professor for this class. Edit your review instead.' };
          return { ok: false, error: r.error.message };
        }
        return { ok: true, id: r.data && r.data.id };
      }
      if (this._dupReview(payload)) return { ok: false, duplicate: true, error: 'You already reviewed this professor for this class. Edit your review instead.' };
      const review = Object.assign({
        id: uid('rev'),
        authorId: user.userId,
        school: 'sccc',
        ts: now(),
        isSample: false
      }, payload, { tags: tags });
      this.db.reviews.unshift(review);
      this._persist();
      return { ok: true, id: review.id };
    },

    updateReview: async function (id, payload) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      const tags = (payload.tags || []).slice(0, 6);
      if (this.mode === 'supabase') {
        const row = { prof_name: payload.prof, course: payload.course, quarter: payload.quarter,
          rating: payload.rating, body: payload.text, tags: tags, edited: true };
        let r = await this.supabase.from('prof_reviews').update(row).eq('id', id).eq('author_id', user.userId);
        if (r.error && /tags|edited/i.test(r.error.message || '')) {
          delete row.tags; delete row.edited;
          r = await this.supabase.from('prof_reviews').update(row).eq('id', id).eq('author_id', user.userId);
        }
        if (r.error) {
          if (r.error.code === '23505') return { ok: false, duplicate: true, error: 'You already reviewed this professor for this class.' };
          return { ok: false, error: r.error.message };
        }
        return { ok: true, id: id };
      }
      const rev = this.db.reviews.find(function (r) { return r.id === id; });
      if (!rev || rev.authorId !== user.userId) return { ok: false, error: 'You can only edit your own reviews.' };
      if (this._dupReview(payload, id)) return { ok: false, duplicate: true, error: 'You already reviewed this professor for this class.' };
      Object.assign(rev, { prof: payload.prof, course: payload.course, quarter: payload.quarter,
        rating: payload.rating, text: payload.text, tags: tags, edited: true });
      this._persist();
      return { ok: true, id: id };
    },

    deleteReview: async function (id) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('prof_reviews').delete().eq('id', id).eq('author_id', user.userId);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const rev = this.db.reviews.find(function (r) { return r.id === id; });
      if (!rev || rev.authorId !== user.userId) return { ok: false, error: 'You can only delete your own reviews.' };
      this.db.reviews = this.db.reviews.filter(function (r) { return r.id !== id; });
      this.db.reviewComments = (this.db.reviewComments || []).filter(function (c) { return c.reviewId !== id; });
      this.db.notifications = this.db.notifications.filter(function (n) { return n.reviewId !== id; });
      this._persist();
      return { ok: true };
    },

    // ---- Comments on reviews (anonymous) ----
    listReviewComments: async function () {
      if (this.mode === 'supabase') {
        if (this.guest || !this.session) {
          const { data, error } = await this.supabase.rpc('public_review_comments');
          if (error) return [];
          return (data || []).map(function (c) {
            return { id: c.id, reviewId: c.review_id, authorId: null, who: c.who, text: c.body,
              helpful: !!c.helpful, edited: !!c.edited, ts: new Date(c.created_at).getTime() };
          });
        }
        const { data, error } = await this.supabase.from('review_comments').select('*').order('created_at', { ascending: true }).order('id', { ascending: true });
        if (error) return [];
        return (data || []).map(function (c) {
          return { id: c.id, reviewId: c.review_id, authorId: c.author_id, text: c.body,
            helpful: !!c.helpful, edited: !!c.edited, ts: new Date(c.created_at).getTime() };
        }).filter(function (c) { return Store._visible(c.authorId, c.id, 'review_comment'); });
      }
      const self = this;
      let list = (this.db.reviewComments || []).slice().sort(function (a, b) { return a.ts - b.ts; });
      if (this.guest) {
        const pub = {};
        this.db.reviews.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 10).forEach(function (r) { pub[r.id] = r.authorId; });
        const order = {};
        return list.filter(function (c) { return pub.hasOwnProperty(c.reviewId); }).map(function (c) {
          let who;
          if (c.authorId === pub[c.reviewId]) who = 'Author';
          else {
            const o = order[c.reviewId] = order[c.reviewId] || { n: 0, m: {} };
            if (!o.m[c.authorId]) o.m[c.authorId] = ++o.n;
            who = 'Anonymous ' + o.m[c.authorId];
          }
          return { id: c.id, reviewId: c.reviewId, authorId: null, who: who, text: c.text, helpful: !!c.helpful, edited: !!c.edited, ts: c.ts };
        });
      }
      return list.filter(function (c) { return self._visible(c.authorId, c.id, 'review_comment'); })
        .map(function (c) { return Object.assign({}, c); });
    },

    addReviewComment: async function (reviewId, text) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      text = String(text || '').trim().slice(0, 1000);
      if (!text) return { ok: false, error: 'Write a comment first.' };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('review_comments').insert({ review_id: reviewId, author_id: user.userId, body: text });
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const rev = this.db.reviews.find(function (r) { return r.id === reviewId; });
      if (!rev) return { ok: false, error: 'Review not found.' };
      this.db.reviewComments = this.db.reviewComments || [];
      this.db.reviewComments.push({ id: uid('rc'), reviewId: reviewId, authorId: user.userId, text: text, ts: now(), edited: false, helpful: false });
      if (rev.authorId !== user.userId) {
        this.db.notifications.unshift({ id: uid('n'), userId: rev.authorId, text: 'Someone commented on your review', ts: now(), read: false, reviewId: reviewId });
      }
      this._persist();
      return { ok: true };
    },

    updateReviewComment: async function (id, text) {
      const user = this.session;
      text = String(text || '').trim().slice(0, 1000);
      if (!user || !text) return { ok: false, error: 'Write a comment first.' };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('review_comments').update({ body: text, edited: true }).eq('id', id).eq('author_id', user.userId);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const c = (this.db.reviewComments || []).find(function (x) { return x.id === id; });
      if (!c || c.authorId !== user.userId) return { ok: false, error: 'You can only edit your own comments.' };
      c.text = text; c.edited = true;
      this._persist();
      return { ok: true };
    },

    deleteReviewComment: async function (id) {
      const user = this.session;
      if (!user) return { ok: false };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('review_comments').delete().eq('id', id).eq('author_id', user.userId);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const before = (this.db.reviewComments || []).length;
      this.db.reviewComments = (this.db.reviewComments || []).filter(function (c) { return !(c.id === id && c.authorId === user.userId); });
      this._persist();
      return before === this.db.reviewComments.length ? { ok: false, error: 'You can only delete your own comments.' } : { ok: true };
    },

    // Only the review's author can mark one comment as the helpful answer.
    markReviewCommentHelpful: async function (id, on) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.rpc('mark_review_comment_helpful', { comment_id: id, on_off: !!on });
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const list = this.db.reviewComments || [];
      const c = list.find(function (x) { return x.id === id; });
      const rev = c && this.db.reviews.find(function (r) { return r.id === c.reviewId; });
      if (!rev || rev.authorId !== user.userId) return { ok: false, error: 'Only the review author can do this.' };
      if (on && c.authorId === user.userId) return { ok: false, error: 'You cannot mark your own comment.' };
      list.forEach(function (x) { if (x.reviewId === c.reviewId) x.helpful = false; });
      if (on) c.helpful = true;
      this._persist();
      return { ok: true };
    },

    // ---- Class requirements added by students ("take FROM before TO"), confirmed by votes ----
    listCourseLinks: async function () {
      const me = this.session && !this.guest ? this.session.userId : null;
      if (this.mode === 'supabase') {
        if (!me) {
          const { data, error } = await this.supabase.rpc('public_course_links');
          if (error) return [];
          return (data || []).map(function (l) {
            return { id: l.id, fromKey: l.from_key, toKey: l.to_key, fromCode: l.from_code, toCode: l.to_code,
              note: l.note || '', source: l.source_url || '', up: Number(l.up) || 0, down: Number(l.down) || 0,
              myVote: 0, mine: false, ts: new Date(l.created_at).getTime() };
          });
        }
        const lr = await this.supabase.from('course_links').select('*');
        if (lr.error) return [];
        const vr = await this.supabase.from('course_link_votes').select('*');
        const votes = (vr.data || []);
        return (lr.data || []).map(function (l) {
          let up = 0, down = 0, mv = 0;
          votes.forEach(function (v) {
            if (v.link_id !== l.id) return;
            if (v.vote > 0) up++; else down++;
            if (v.user_id === me) mv = v.vote > 0 ? 1 : -1;
          });
          return { id: l.id, fromKey: l.from_key, toKey: l.to_key, fromCode: l.from_code, toCode: l.to_code,
            note: l.note || '', source: l.source_url || '', up: up, down: down, myVote: mv,
            mine: l.author_id === me, authorId: l.author_id, ts: new Date(l.created_at).getTime() };
        }).filter(function (l) { return Store._visible(l.authorId, l.id, 'course_link'); });
      }
      const self = this;
      const votes = this.db.linkVotes || [];
      return (this.db.courseLinks || []).map(function (l) {
        let up = 0, down = 0, mv = 0;
        votes.forEach(function (v) {
          if (v.linkId !== l.id) return;
          if (v.vote > 0) up++; else down++;
          if (me && v.userId === me) mv = v.vote > 0 ? 1 : -1;
        });
        return { id: l.id, fromKey: l.fromKey, toKey: l.toKey, fromCode: l.fromCode, toCode: l.toCode,
          note: l.note || '', source: l.source || '', up: up, down: down, myVote: mv,
          mine: !!me && l.authorId === me, authorId: me ? l.authorId : null, ts: l.ts };
      }).filter(function (l) { return !me || self._visible(l.authorId, l.id, 'course_link'); });
    },

    addCourseLink: async function (p) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      const fromKey = courseKey(p.fromCode), toKey = courseKey(p.toCode);
      if (!/\d/.test(fromKey) || !/\d/.test(toKey)) return { ok: false, error: 'Please write a course code, like MATH 142.' };
      if (fromKey === toKey) return { ok: false, error: 'A class cannot come before itself.' };
      const note = String(p.note || '').trim().slice(0, 120);
      let source = String(p.source || '').trim().slice(0, 300);
      if (source && !/^https?:\/\/\S+$/i.test(source)) return { ok: false, error: 'The source link must start with http:// or https://' };
      const existing = (await this.listCourseLinks()).find(function (l) {
        return (l.fromKey === fromKey && l.toKey === toKey) || (l.fromKey === toKey && l.toKey === fromKey);
      });
      if (existing) {
        const same = existing.fromKey === fromKey;
        return { ok: false, duplicate: true, reverse: !same, link: existing,
          error: same ? 'Someone already added this. You can vote on it instead.' : 'Someone already added the opposite order for these two classes. Vote "Not right" on it if it is wrong.' };
      }
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('course_links').insert({
          from_key: fromKey, to_key: toKey, from_code: String(p.fromCode).trim().slice(0, 20), to_code: String(p.toCode).trim().slice(0, 20),
          note: note, source_url: source || null, author_id: user.userId
        });
        if (error) {
          if (error.code === '23505') return { ok: false, duplicate: true, error: 'Someone already added this. You can vote on it instead.' };
          return { ok: false, error: error.message };
        }
        return { ok: true };
      }
      this.db.courseLinks = this.db.courseLinks || [];
      this.db.courseLinks.push({ id: uid('cl'), fromKey: fromKey, toKey: toKey, fromCode: String(p.fromCode).trim().slice(0, 20),
        toCode: String(p.toCode).trim().slice(0, 20), note: note, source: source, authorId: user.userId, ts: now() });
      this._persist();
      return { ok: true };
    },

    // vote: 1 = Correct, -1 = Not right, 0 = take my vote back.
    voteCourseLink: async function (linkId, vote) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      vote = vote > 0 ? 1 : vote < 0 ? -1 : 0;
      if (this.mode === 'supabase') {
        let r;
        if (!vote) r = await this.supabase.from('course_link_votes').delete().eq('link_id', linkId).eq('user_id', user.userId);
        else r = await this.supabase.from('course_link_votes').upsert({ link_id: linkId, user_id: user.userId, vote: vote }, { onConflict: 'link_id,user_id' });
        if (r.error) return { ok: false, error: /row-level|policy/i.test(r.error.message) ? 'You cannot vote on your own suggestion.' : r.error.message };
        return { ok: true };
      }
      const link = (this.db.courseLinks || []).find(function (l) { return l.id === linkId; });
      if (!link) return { ok: false, error: 'Not found.' };
      if (link.authorId === user.userId) return { ok: false, error: 'You cannot vote on your own suggestion.' };
      this.db.linkVotes = (this.db.linkVotes || []).filter(function (v) { return !(v.linkId === linkId && v.userId === user.userId); });
      if (vote) this.db.linkVotes.push({ linkId: linkId, userId: user.userId, vote: vote });
      this._persist();
      return { ok: true };
    },

    deleteCourseLink: async function (linkId) {
      const user = this.session;
      if (!user) return { ok: false };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('course_links').delete().eq('id', linkId).eq('author_id', user.userId);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const link = (this.db.courseLinks || []).find(function (l) { return l.id === linkId; });
      if (!link || link.authorId !== user.userId) return { ok: false, error: 'You can only delete your own suggestion.' };
      this.db.courseLinks = this.db.courseLinks.filter(function (l) { return l.id !== linkId; });
      this.db.linkVotes = (this.db.linkVotes || []).filter(function (v) { return v.linkId !== linkId; });
      this._persist();
      return { ok: true };
    },

    // ---- Course work plans (one per user) ----
    _planFromRow: function (r) {
      return {
        id: r.user_id, authorId: r.user_id, major: r.major || '',
        otherMajors: r.other_majors || [], dreamSchools: r.dream_schools || [],
        quarters: Array.isArray(r.quarters) ? r.quarters : [],
        ts: new Date(r.updated_at || r.created_at || Date.now()).getTime()
      };
    },

    listPlans: async function () {
      if (this.mode === 'supabase') {
        if (this.guest || !this.session) return [];
        const { data } = await this.supabase.from('course_plans').select('*').order('updated_at', { ascending: false });
        return (data || []).map(this._planFromRow);
      }
      return (this.db.coursePlans || []).slice().sort(function (a, b) { return b.ts - a.ts; }).map(function (p) {
        return JSON.parse(JSON.stringify(p));
      });
    },

    savePlan: async function (plan) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('course_plans').upsert({
          user_id: user.userId, major: plan.major, other_majors: plan.otherMajors,
          dream_schools: plan.dreamSchools, quarters: plan.quarters,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      this.db.coursePlans = this.db.coursePlans || [];
      const rec = {
        id: user.userId, authorId: user.userId, major: plan.major,
        otherMajors: plan.otherMajors, dreamSchools: plan.dreamSchools,
        quarters: plan.quarters, ts: now()
      };
      const i = this.db.coursePlans.findIndex(function (p) { return p.id === user.userId; });
      if (i >= 0) this.db.coursePlans[i] = rec; else this.db.coursePlans.push(rec);
      this._persist();
      return { ok: true };
    },

    deletePlan: async function () {
      const user = this.session;
      if (!user) return { ok: false };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('course_plans').delete().eq('user_id', user.userId);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      this.db.coursePlans = (this.db.coursePlans || []).filter(function (p) { return p.id !== user.userId; });
      this.db.planComments = (this.db.planComments || []).filter(function (c) { return c.planId !== user.userId; });
      this._persist();
      return { ok: true };
    },

    listPlanComments: async function (planId) {
      if (this.mode === 'supabase') {
        if (this.guest) return [];
        const { data } = await this.supabase.from('plan_comments').select('*')
          .eq('plan_user_id', planId).order('created_at', { ascending: true });
        return (data || []).map(function (c) {
          return { id: c.id, authorId: c.author_id, text: c.body, ts: new Date(c.created_at).getTime() };
        });
      }
      return (this.db.planComments || []).filter(function (c) { return c.planId === planId; })
        .sort(function (a, b) { return a.ts - b.ts; });
    },

    addPlanComment: async function (planId, text) {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('plan_comments').insert({
          plan_user_id: planId, author_id: user.userId, body: text
        });
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      this.db.planComments = this.db.planComments || [];
      this.db.planComments.push({ id: uid('pc'), planId: planId, authorId: user.userId, text: text, ts: now() });
      this._persist();
      return { ok: true };
    },

    deletePlanComment: async function (id) {
      const user = this.session;
      if (!user) return { ok: false };
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('plan_comments').delete().eq('id', id).eq('author_id', user.userId);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      this.db.planComments = (this.db.planComments || []).filter(function (c) {
        return !(c.id === id && c.authorId === user.userId);
      });
      this._persist();
      return { ok: true };
    },

    // Delete the signed-in account and everything linked to it.
    deleteAccount: async function () {
      const user = this.session;
      if (!user) return { ok: false, error: 'Please log in first.' };
      const id = user.userId;
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.rpc('delete_my_account');
        if (error) return { ok: false, error: error.message };
        try { await this.supabase.auth.signOut(); } catch (e) {}
      } else {
        const db = this.db;
        db.users = db.users.filter(function (u) { return u.id !== id; });
        db.posts = db.posts.filter(function (p) { return p.authorId !== id; });
        db.posts.forEach(function (p) {
          p.comments = (p.comments || []).filter(function (c) { return c.authorId !== id; });
          if (p.likedBy && p.likedBy.indexOf(id) >= 0) {
            p.likedBy = p.likedBy.filter(function (x) { return x !== id; });
            p.likes = Math.max(0, (p.likes || 0) - 1);
          }
        });
        db.stories = db.stories.filter(function (s) { return s.authorId !== id; });
        const goneReviews = {};
        db.reviews.forEach(function (r) { if (r.authorId === id) goneReviews[r.id] = 1; });
        db.reviews = db.reviews.filter(function (r) { return r.authorId !== id; });
        db.reviewComments = (db.reviewComments || []).filter(function (c) { return c.authorId !== id && !goneReviews[c.reviewId]; });
        const goneLinks = {};
        (db.courseLinks || []).forEach(function (l) { if (l.authorId === id) goneLinks[l.id] = 1; });
        db.courseLinks = (db.courseLinks || []).filter(function (l) { return l.authorId !== id; });
        db.linkVotes = (db.linkVotes || []).filter(function (v) { return v.userId !== id && !goneLinks[v.linkId]; });
        db.coursePlans = (db.coursePlans || []).filter(function (p) { return p.id !== id; });
        db.planComments = (db.planComments || []).filter(function (c) { return c.planId !== id && c.authorId !== id; });
        db.notifications = db.notifications.filter(function (n) { return n.userId !== id; });
        db.reports = db.reports.filter(function (r) { return r.reporterId !== id; });
      }
      delete this.privateMap[id];
      this.session = null;
      this._cloudOk = undefined;
      this._persist();
      return { ok: true };
    },

    toggleSaveStory: function (id) {
      const p = this.getPrivate();
      const i = p.savedStoryIds.indexOf(id);
      if (i >= 0) p.savedStoryIds.splice(i, 1);
      else p.savedStoryIds.push(id);
      this.savePrivate();
    },

    report: async function (kind, id, reason) {
      if (this.mode === 'supabase') {
        await this.supabase.from('reports').insert({
          reporter_id: this.session.userId,
          kind: kind,
          target_id: id,
          reason: reason
        });
      } else {
        this.db.reports.push({
          id: uid('rep'),
          reporterId: this.session.userId,
          kind: kind,
          targetId: id,
          reason: reason,
          ts: now()
        });
      }
      if (kind === 'post' || kind === 'review_comment' || kind === 'course_link') {
        const p = this.getPrivate();
        if (p.hiddenPostIds.indexOf(id) < 0) p.hiddenPostIds.push(id);
      }
      this.savePrivate();
    },

    blockAuthorOf: function (kind, id, knownAuthorId) {
      let authorId = knownAuthorId || null;
      if (authorId) { /* already known from the page */ }
      else if (kind === 'post') {
        const p = this.db.posts.find(function (x) { return x.id === id; });
        authorId = p && p.authorId;
      } else if (kind === 'story') {
        const s = this.db.stories.find(function (x) { return x.id === id; });
        authorId = s && s.authorId;
      } else if (kind === 'review') {
        const r = this.db.reviews.find(function (x) { return x.id === id; });
        authorId = r && r.authorId;
      }
      if (!authorId || authorId === this.session.userId) return;
      const p = this.getPrivate();
      if (p.blockedUserIds.indexOf(authorId) < 0) p.blockedUserIds.push(authorId);
      this.savePrivate();
    },

    notifications: async function () {
      const uidCur = this.session && this.session.userId;
      if (!uidCur) return [];
      if (this.mode === 'supabase') {
        const { data, error } = await this.supabase
          .from('notifications')
          .select('*')
          .eq('user_id', uidCur)
          .order('created_at', { ascending: false });
        if (error) return [];
        return (data || []).map(function (row) {
          return {
            id: row.id,
            userId: row.user_id,
            postId: row.post_id,
            reviewId: row.review_id || null,
            text: row.text,
            read: row.read,
            ts: new Date(row.created_at).getTime()
          };
        });
      }
      return this.db.notifications.filter(function (n) { return n.userId === uidCur; });
    },

    markNotificationsRead: async function () {
      const uidCur = this.session && this.session.userId;
      if (!uidCur) return;
      if (this.mode === 'supabase') {
        await this.supabase.from('notifications').update({ read: true }).eq('user_id', uidCur).eq('read', false);
        return;
      }
      this.db.notifications.forEach(function (n) {
        if (n.userId === uidCur) n.read = true;
      });
      this._persist();
    },

    search: async function (q) {
      q = String(q || '').trim().toLowerCase();
      if (!q) return { posts: [], stories: [], reviews: [] };
      const posts = (await this.listPosts()).filter(function (p) {
        return (p.title + ' ' + p.body + ' ' + (BOARD_NAMES[p.board] || '')).toLowerCase().indexOf(q) >= 0;
      });
      const stories = (await this.listStories()).filter(function (s) {
        return (s.from + ' ' + s.to + ' ' + s.major + ' ' + s.text).toLowerCase().indexOf(q) >= 0;
      });
      const reviews = (await this.listReviews()).filter(function (r) {
        return (r.prof + ' ' + r.course + ' ' + r.text).toLowerCase().indexOf(q) >= 0;
      });
      return { posts: posts, stories: stories, reviews: reviews };
    }
  };

  function normalizePost(p) {
    const comments = p.comments || p.commentList || [];
    return Object.assign({}, p, {
      comments: comments,
      commentCount: comments.length
    });
  }

  function fromSupabasePost(row) {
    return normalizePost({
      id: row.id,
      authorId: row.author_id,
      board: row.board,
      title: row.title,
      body: row.body,
      likes: row.likes || 0,
      ts: new Date(row.created_at).getTime(),
      edited: row.edited,
      isSample: row.is_sample,
      comments: (row.comments || []).slice().sort(function (a, b) {
        return new Date(a.created_at) - new Date(b.created_at) || (a.id < b.id ? -1 : 1);
      }).map(function (c) {
        return { id: c.id, authorId: c.author_id, name: c.nickname || 'Student', text: c.body, edited: c.edited, ts: new Date(c.created_at).getTime() };
      })
    });
  }

  function fromSupabaseStory(row) {
    return {
      id: row.id,
      authorId: row.author_id,
      from: row.from_school,
      to: row.to_school,
      major: row.major,
      gpa: row.gpa,
      text: row.body,
      ts: new Date(row.created_at).getTime(),
      isSample: row.is_sample
    };
  }

  function fromSupabaseReview(row) {
    return {
      id: row.id,
      authorId: row.author_id,
      prof: row.prof_name,
      course: row.course,
      quarter: row.quarter,
      rating: row.rating,
      text: row.body,
      tags: Array.isArray(row.tags) ? row.tags : [],
      edited: !!row.edited,
      ts: new Date(row.created_at).getTime(),
      isSample: row.is_sample
    };
  }

  Store.courseKey = courseKey;
  Store.reviewCourseKey = reviewCourseKey;
  global.SCCStore = Store;
})(window);
