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
    return CONFIG.allowedEmailDomains.some(function (allowed) {
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
    return { users: [], posts: [], stories: [], reviews: [], reports: [], notifications: [], seeded: false };
  }

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
      if (kind === 'post' && p.hiddenPostIds.indexOf(id) >= 0) return false;
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
              text: r.body, ts: new Date(r.created_at).getTime(), isSample: false };
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

    createReview: async function (payload) {
      const user = this.session;
      if (this.mode === 'supabase') {
        const { error } = await this.supabase.from('prof_reviews').insert({
          author_id: user.userId, prof_name: payload.prof, course: payload.course,
          quarter: payload.quarter, rating: payload.rating, body: payload.text
        });
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const review = Object.assign({
        id: uid('rev'),
        authorId: user.userId,
        school: 'sccc',
        ts: now(),
        isSample: false
      }, payload);
      this.db.reviews.unshift(review);
      this._persist();
      return review;
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
      if (kind === 'post') {
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
      ts: new Date(row.created_at).getTime(),
      isSample: row.is_sample
    };
  }

  global.SCCStore = Store;
})(window);
