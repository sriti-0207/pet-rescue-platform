const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('./models');

// In production, set this via an environment variable instead.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_EXPIRY = '8h';

/**
 * Public self-signup — ADOPTERS ONLY.
 * Admin and Foster accounts are never created here; they only exist because
 * they were seeded directly into the database (see server.js seeding block).
 */
async function signupAdopter({ username, password }) {
  if (!username || !password) {
    throw new Error('Username and password are required.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const existing = await User.findOne({ where: { username } });
  if (existing) {
    throw new Error('That username is already taken.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ username, passwordHash, role: 'adopter' });
  return user;
}

/**
 * Login for ALL roles (admin, foster, adopter).
 * Admin/foster accounts must already exist in the DB — they were handed
 * their username (DB id) and password out-of-band by whoever set up the system.
 */
async function login({ username, password }) {
  if (!username || !password) {
    throw new Error('Username and password are required.');
  }

  const user = await User.findOne({ where: { username } });
  if (!user) {
    throw new Error('Invalid credentials.');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials.');
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role, fosterId: user.fosterId || null },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  return { token, user: { id: user.id, username: user.username, role: user.role, fosterId: user.fosterId || null } };
}

/** Express middleware: requires a valid JWT, attaches req.user */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

/** Express middleware factory: requires req.user.role to be one of `roles` */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { signupAdopter, login, authenticate, authorize, JWT_SECRET };