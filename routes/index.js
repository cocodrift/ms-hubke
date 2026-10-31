import express from 'express';
import crypto from 'crypto';
import Post from '../models/post.js';
import connectDB from '../config/db.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const router = express.Router();


// --------------------------------------------------
// Helpers
// --------------------------------------------------

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}


function cleanMarkdown(markdown) {
  const html = marked.parse(markdown || '');

  return sanitizeHtml(html, {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'strong',
      'em',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'pre',
      'code',
      'hr'
    ],

    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title']
    },

    allowedSchemes: [
      'http',
      'https',
      'mailto'
    ]
  });
}


// --------------------------------------------------
// Admin authentication
// --------------------------------------------------

function createAdminToken() {
  const timestamp = Date.now().toString();

  const signature = crypto
    .createHmac(
      'sha256',
      process.env.ADMIN_SESSION_SECRET
    )
    .update(timestamp)
    .digest('hex');

  return `${timestamp}.${signature}`;
}


function isValidAdminToken(token) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) {
    return false;
  }

  const parts = token.split('.');

  if (parts.length !== 2) {
    return false;
  }

  const timestamp = Number(parts[0]);
  const signature = parts[1];

  if (!timestamp || !signature) {
    return false;
  }

  // Login expires after 7 days
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  if (Date.now() - timestamp > sevenDays) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac(
      'sha256',
      process.env.ADMIN_SESSION_SECRET
    )
    .update(parts[0])
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    return false;
  }
}


function requireAdmin(req, res, next) {
  const token = req.cookies?.mshub_admin;

  if (!isValidAdminToken(token)) {
    return res.redirect('/admin/login');
  }

  next();
}


// --------------------------------------------------
// Video URL helper
// --------------------------------------------------

function normalizeVideoUrl(url) {
  if (!url) {
    return '';
  }

  const value = url.trim();

  try {
    const parsed = new URL(value);

    // Standard YouTube URL
    // https://www.youtube.com/watch?v=VIDEO_ID
    if (
      parsed.hostname === 'www.youtube.com' ||
      parsed.hostname === 'youtube.com' ||
      parsed.hostname === 'm.youtube.com'
    ) {
      const videoId = parsed.searchParams.get('v');

      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }

      // YouTube Shorts
      // https://www.youtube.com/shorts/VIDEO_ID
      if (parsed.pathname.startsWith('/shorts/')) {
        const videoId = parsed.pathname
          .split('/shorts/')[1]
          ?.split('/')[0];

        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}`;
        }
      }

      // Already an embed URL
      // https://www.youtube.com/embed/VIDEO_ID
      if (parsed.pathname.startsWith('/embed/')) {
        return value;
      }
    }

    // Short YouTube URL
    // https://youtu.be/VIDEO_ID
    if (parsed.hostname === 'youtu.be') {
      const videoId = parsed.pathname
        .replace(/^\/+/, '')
        .split('/')[0];

      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }
    }

    // Return other valid URLs unchanged
    return value;

  } catch (error) {
    return '';
  }
}


// --------------------------------------------------
// Admin form helpers
// --------------------------------------------------

// Always returns a trimmed string. If a field arrives more than once
// (an array), the first non-empty value is used instead of crashing.
function text(value) {
  if (Array.isArray(value)) {
    value = value.find(v => typeof v === 'string' && v.trim()) ?? '';
  }

  return typeof value === 'string' ? value.trim() : '';
}


function readPostFields(body = {}) {
  const title = text(body.title);
  const excerpt = text(body.excerpt);

  return {
    title,
    slug: text(body.slug),
    excerpt,
    content: text(body.content),
    category: text(body.category),

    tags: text(body.tags)
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean),

    featuredImage: text(body.featuredImage),

    videoTitle: text(body.videoTitle),
    videoUrl: normalizeVideoUrl(text(body.videoUrl)),

    author: text(body.author) || 'M’s Hub KE',

    seoTitle: text(body.seoTitle) || title,
    seoDescription: text(body.seoDescription) || excerpt,

    status: text(body.status) === 'published' ? 'published' : 'draft'
  };
}


// An article can be text only, an image only, a video only, or any mix.
// It only needs a title, a category and at least one of the three.
function validatePostFields(fields) {
  if (!fields.title || !fields.category) {
    return 'Title and category are required.';
  }

  if (!fields.content && !fields.featuredImage && !fields.videoUrl) {
    return 'Add at least one of: text, an image URL or a video URL.';
  }

  return null;
}


// --------------------------------------------------
// Existing site routes
// --------------------------------------------------

router.get('/', async (req, res, next) => {
  try {
    await connectDB();

    const posts = await Post.find({
      status: 'published'
    })
      .sort({ publishedAt: -1 })
      .limit(7)
      .lean();

    const featuredPost = posts[0] || null;
    const latestPosts = posts.slice(1);

    res.render('index', {
      featuredPost,
      latestPosts
    });

  } catch (error) {
    next(error);
  }
});


router.get('/profile', (req, res) => {
  res.redirect(301, '/#about');
});


router.get('/travel', (req, res, next) => {
  try {
    res.render('travel');
  } catch (error) {
    next(error);
  }
});


router.get('/fitness', (req, res, next) => {
  try {
    res.render('fitness');
  } catch (error) {
    next(error);
  }
});


router.get('/books', (req, res, next) => {
  try {
    res.render('books');
  } catch (error) {
    next(error);
  }
});


// --------------------------------------------------
// PUBLIC CONTENT HUB
// --------------------------------------------------

router.get('/learn', async (req, res, next) => {
  try {
    await connectDB();

    const category = req.query.category;

    const query = {
      status: 'published'
    };

    if (category) {
      query.category = category;
    }

    const posts = await Post.find(query)
      .sort({ publishedAt: -1 })
      .lean();

    res.render('learn', {
      posts,
      category: category || 'All'
    });

  } catch (error) {
    next(error);
  }
});


router.get('/learn/:slug', async (req, res, next) => {
  try {
    await connectDB();

    const post = await Post.findOne({
      slug: req.params.slug,
      status: 'published'
    }).lean();

    if (!post) {
      return res.status(404).render('404');
    }

    const articleHtml = cleanMarkdown(post.content);

    const relatedPosts = await Post.find({
      status: 'published',
      category: post.category,
      _id: { $ne: post._id }
    })
      .sort({ publishedAt: -1 })
      .limit(3)
      .lean();

    res.render('article', {
      post,
      articleHtml,
      relatedPosts
    });

  } catch (error) {
    next(error);
  }
});


// --------------------------------------------------
// ADMIN LOGIN
// --------------------------------------------------

router.get('/admin/login', (req, res) => {
  res.render('admin/login', {
    error: null
  });
});


router.post('/admin/login', (req, res) => {
  const { password } = req.body;

  if (
    !process.env.ADMIN_PASSWORD ||
    !process.env.ADMIN_SESSION_SECRET
  ) {
    return res.status(500).send(
      'Admin environment variables are not configured.'
    );
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).render('admin/login', {
      error: 'Incorrect password.'
    });
  }

  const token = createAdminToken();

  res.cookie('mshub_admin', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.redirect('/admin/posts');
});


router.post('/admin/logout', requireAdmin, (req, res) => {
  res.clearCookie('mshub_admin');
  res.redirect('/admin/login');
});


// --------------------------------------------------
// ADMIN POSTS
// --------------------------------------------------

router.get('/admin/posts', requireAdmin, async (req, res, next) => {
  try {
    await connectDB();

    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin/posts', {
      posts
    });

  } catch (error) {
    next(error);
  }
});


// --------------------------------------------------
// NEW POST
// --------------------------------------------------

router.get('/admin/posts/new', requireAdmin, (req, res) => {
  res.render('admin/post-form', {
    post: null,
    error: null
  });
});


router.post('/admin/posts', requireAdmin, async (req, res, next) => {
  try {
    await connectDB();

    const fields = readPostFields(req.body);
    const error = validatePostFields(fields);

    if (error) {
      return res.status(400).render('admin/post-form', {
        post: { ...fields, tags: fields.tags.join(', ') },
        error
      });
    }

    let finalSlug = slugify(fields.slug || fields.title) || `post-${Date.now()}`;

    const existing = await Post.findOne({ slug: finalSlug });

    if (existing) {
      finalSlug = `${finalSlug}-${Date.now()}`;
    }

    const post = new Post({
      ...fields,
      slug: finalSlug,
      publishedAt: fields.status === 'published' ? new Date() : undefined
    });

    await post.save();

    res.redirect('/admin/posts');

  } catch (error) {
    next(error);
  }
});


// --------------------------------------------------
// EDIT POST
// --------------------------------------------------

router.get(
  '/admin/posts/:id/edit',
  requireAdmin,
  async (req, res, next) => {
    try {
      await connectDB();

      const post = await Post.findById(req.params.id).lean();

      if (!post) {
        return res.status(404).send('Post not found.');
      }

      res.render('admin/post-form', {
        post: {
          ...post,
          tags: Array.isArray(post.tags)
            ? post.tags.join(', ')
            : ''
        },
        error: null
      });

    } catch (error) {
      next(error);
    }
  }
);


router.post(
  '/admin/posts/:id',
  requireAdmin,
  async (req, res, next) => {
    try {
      await connectDB();

      const fields = readPostFields(req.body);
      const error = validatePostFields(fields);

      if (error) {
        return res.status(400).render('admin/post-form', {
          post: {
            ...fields,
            tags: fields.tags.join(', '),
            _id: req.params.id
          },
          error
        });
      }

      const post = await Post.findById(req.params.id);

      if (!post) {
        return res.status(404).send('Post not found.');
      }

      post.title = fields.title;
      post.slug = slugify(fields.slug || fields.title) || post.slug;
      post.excerpt = fields.excerpt;
      post.content = fields.content;
      post.category = fields.category;
      post.tags = fields.tags;
      post.featuredImage = fields.featuredImage;
      post.videoTitle = fields.videoTitle;
      post.videoUrl = fields.videoUrl;
      post.author = fields.author;
      post.seoTitle = fields.seoTitle;
      post.seoDescription = fields.seoDescription;

      if (fields.status === 'published' && post.status !== 'published') {
        post.publishedAt = new Date();
      }

      post.status = fields.status;

      await post.save();

      res.redirect('/admin/posts');

    } catch (error) {
      next(error);
    }
  }
);


// --------------------------------------------------
// DELETE POST
// --------------------------------------------------

router.post(
  '/admin/posts/:id/delete',
  requireAdmin,
  async (req, res, next) => {
    try {
      await connectDB();

      await Post.findByIdAndDelete(req.params.id);

      res.redirect('/admin/posts');

    } catch (error) {
      next(error);
    }
  }
);


// --------------------------------------------------
// Error handler
// --------------------------------------------------

router.use((err, req, res, next) => {
  console.error(err);

  res.status(500).send(
    'Something went wrong. Please try again later.'
  );
});


export default router;
