const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const crypto = require('crypto');

const app = express();
const PUBLIC_DIR = __dirname;
const DB_PATH = path.join(__dirname, 'apcsync.sqlite');
const PORT = process.env.PORT || 3000;

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Unable to open database:', err.message);
    process.exit(1);
  }
});

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDatabase() {
  await dbRun('PRAGMA foreign_keys = ON');

  await dbRun(`CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(role_id) REFERENCES roles(id)
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    floor TEXT,
    name TEXT NOT NULL,
    capacity INTEGER,
    features TEXT,
    status TEXT NOT NULL DEFAULT 'available'
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    description TEXT,
    visibility TEXT NOT NULL,
    visible_to TEXT,
    booking_id TEXT UNIQUE,
    cancelled INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(created_by) REFERENCES users(id),
    FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    requested_by TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    room_id TEXT NOT NULL,
    purpose TEXT,
    equipment TEXT,
    attachment_name TEXT,
    status TEXT NOT NULL,
    decision_made_by TEXT,
    decision_note TEXT,
    decided_at TEXT,
    ended INTEGER NOT NULL DEFAULT 0,
    event_id TEXT UNIQUE,
    FOREIGN KEY(requested_by) REFERENCES users(id),
    FOREIGN KEY(decision_made_by) REFERENCES users(id),
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE SET NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  const rolesCount = await dbGet('SELECT COUNT(*) AS count FROM roles');
  if (!rolesCount || rolesCount.count === 0) {
    await dbRun(`INSERT INTO roles (id, name, description) VALUES
      ('student', 'student', 'Student users with personal event and booking request access'),
      ('faculty', 'faculty', 'Faculty users with shared event creation and booking requests'),
      ('admin', 'admin', 'Admin users with booking approval and full event visibility')
    `);
  }

  const usersCount = await dbGet('SELECT COUNT(*) AS count FROM users');
  if (!usersCount || usersCount.count === 0) {
    const now = new Date().toISOString();
    const seedUsers = [
      ['u-student-001', 'someone@student.apc.edu.ph', 'demo_password_123', 'Student User', 'student', now],
      ['u-faculty-001', 'someone@apc.edu.ph', 'demo_password_123', 'Faculty Member', 'faculty', now],
      ['u-admin-001', 'admin@apc.edu.ph', 'demo_password_123', 'Admin User', 'admin', now]
    ];

    for (const [id, email, password, name, role, createdAt] of seedUsers) {
      await dbRun(`INSERT INTO users (id, email, password, name, role_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [
        id,
        email,
        password,
        name,
        role,
        createdAt
      ]);
    }
  }

  const roomsCount = await dbGet('SELECT COUNT(*) AS count FROM rooms');
  if (!roomsCount || roomsCount.count === 0) {
    const seedRooms = [
      ['rm-G01', 'G', 'Ground Floor Room 01', 40, ['projector', 'whiteboard'], 'available'],
      ['rm-G02', 'G', 'Ground Floor Room 02', 35, ['whiteboard'], 'available'],
      ['rm-101', '1', 'Room 101', 50, ['projector', 'whiteboard'], 'available'],
      ['rm-102', '1', 'Room 102', 45, ['projector'], 'available'],
      ['rm-201', '2', 'Room 201', 50, ['projector', 'audio_system'], 'available'],
      ['rm-202', '2', 'Room 202', 40, ['projector', 'whiteboard'], 'available'],
      ['rm-301', '3', 'Room 301', 45, ['projector'], 'available'],
      ['rm-302', '3', 'Room 302', 40, ['whiteboard'], 'available'],
      ['rm-401', '4', 'Room 401', 60, ['projector', 'audio_system'], 'available'],
      ['rm-402', '4', 'Room 402', 60, ['projector', 'whiteboard'], 'available']
    ];

    for (const [id, floor, name, capacity, features, status] of seedRooms) {
      await dbRun(`INSERT INTO rooms (id, floor, name, capacity, features, status) VALUES (?, ?, ?, ?, ?, ?)`, [
        id,
        floor,
        name,
        capacity,
        JSON.stringify(features),
        status
      ]);
    }
  }
}

function buildError(status, code, message, fields = null) {
  const error = { error: { code, message } };
  if (fields && Object.keys(fields).length > 0) {
    error.error.fields = fields;
  }
  return { status, body: error };
}

function sendError(res, status, code, message, fields = null) {
  const payload = { error: { code, message } };
  if (fields && Object.keys(fields).length > 0) {
    payload.error.fields = fields;
  }
  return res.status(status).json(payload);
}

function normalizeTimeValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function ensureDateFormat(value) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    throw new Error('INVALID_DATE_FORMAT');
  }
}

function ensureTimeFormat(value) {
  if (!/^[0-9]{2}:[0-9]{2}$/.test(value)) {
    throw new Error('INVALID_TIME_FORMAT');
  }
}

function dateToIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatBoolean(value) {
  return value ? 1 : 0;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function buildEventResponse(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    createdBy: row.created_by,
    createdByEmail: row.created_by_email || null,
    createdAt: row.created_at,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    description: row.description,
    visibility: row.visibility,
    visibleTo: parseJsonArray(row.visible_to),
    bookingId: row.booking_id,
    cancelled: Boolean(row.cancelled)
  };
}

function buildBookingResponse(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    requestedBy: row.requested_by,
    requestedByEmail: row.requested_by_email || null,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    purpose: row.purpose,
    equipment: row.equipment,
    attachmentName: row.attachment_name,
    status: row.status,
    decidedBy: row.decision_made_by,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    createdAt: row.requested_at,
    updatedAt: row.updated_at,
    ended: Boolean(row.ended),
    eventId: row.event_id
  };
}

async function loadCurrentUser(token) {
  const session = await dbGet('SELECT user_id FROM auth_tokens WHERE token = ?', [token]);
  if (!session) return null;
  const user = await dbGet(`SELECT u.id, u.email, u.name, u.role_id AS role, u.created_at AS createdAt
    FROM users AS u
    WHERE u.id = ?`, [session.user_id]);
  return user || null;
}

async function requireAuth(req, res, next) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Not logged in');
  }

  const session = await dbGet('SELECT user_id FROM auth_tokens WHERE token = ?', [token]);
  if (!session) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  const user = await dbGet(`SELECT u.id, u.email, u.name, u.role_id AS role, u.created_at AS createdAt
    FROM users AS u
    WHERE u.id = ?`, [session.user_id]);

  if (!user) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  req.user = user;
  next();
}

function buildQueryParams(query) {
  const params = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    params[key] = String(value).trim();
  }
  return params;
}

function validateBookingSlot(date, startTime, endTime) {
  try {
    ensureDateFormat(date);
  } catch {
    return { field: 'date', message: 'Date must be in YYYY-MM-DD format' };
  }
  try {
    ensureTimeFormat(startTime);
    ensureTimeFormat(endTime);
  } catch {
    return { field: 'time', message: 'Time fields must be in HH:MM format' };
  }
  if (startTime >= endTime) {
    return { field: 'startTime', message: 'Start time must be before end time' };
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const requested = new Date(`${date}T${startTime}:00Z`);
  if (requested.getTime() < now.getTime()) {
    return { field: 'date', message: 'Booking date must be today or later' };
  }
  return null;
}

function validateEventPayload(payload, currentUser) {
  const type = String(payload.type || '').trim();
  const title = String(payload.title || '').trim();
  const date = String(payload.date || '').trim();
  const startTime = String(payload.startTime || payload.start_time || '').trim();
  const endTime = String(payload.endTime || payload.end_time || '').trim();
  const location = String(payload.location || '').trim();
  const description = String(payload.description || payload.notes || '').trim();
  const bookingId = payload.bookingId || payload.booking_id || null;

  const missingFields = {};
  if (!title) missingFields.title = ['Title is required'];
  if (!type) missingFields.type = ['Type is required'];
  if (!date) missingFields.date = ['Date is required'];
  if (!startTime) missingFields.startTime = ['Start time is required'];
  if (!endTime) missingFields.endTime = ['End time is required'];
  if (currentUser.role !== 'student' && !location) missingFields.location = ['Location is required'];
  if (!description) missingFields.description = ['Description is required'];

  if (Object.keys(missingFields).length > 0) {
    return { status: 400, code: 'VALIDATION_ERROR', fields: missingFields, message: 'Missing required fields' };
  }

  try {
    ensureDateFormat(date);
  } catch {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid date format', fields: { date: ['Date must be YYYY-MM-DD'] } };
  }
  try {
    ensureTimeFormat(startTime);
    ensureTimeFormat(endTime);
  } catch {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid time format', fields: { startTime: ['Time must be HH:MM'], endTime: ['Time must be HH:MM'] } };
  }
  if (startTime >= endTime) {
    return { status: 422, code: 'TIME_RANGE_ERROR', message: 'Start time must be before end time' };
  }

  if (currentUser.role === 'student' && type !== 'personal') {
    return { status: 403, code: 'STUDENT_CANNOT_CREATE_SHARED_EVENT', message: 'Students can only create personal events' };
  }

  return null;
}

async function createNotification(userId, title, message, metadata = null) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await dbRun(`INSERT INTO notifications (id, user_id, title, message, metadata, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`, [
    id,
    userId,
    title,
    message,
    metadata ? JSON.stringify(metadata) : null,
    createdAt
  ]);
}

app.use(express.json());

app.post('/api/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '').trim();
  if (!email || !password) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Email and password are required', {
      email: email ? [] : ['Email is required'],
      password: password ? [] : ['Password is required']
    });
  }

  const user = await dbGet('SELECT id, email, password, name, role_id AS role, created_at AS createdAt FROM users WHERE lower(email) = ?', [email]);
  if (!user || user.password !== password) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  const token = crypto.randomBytes(32).toString('hex');
  await dbRun('INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)', [token, user.id, new Date().toISOString()]);

  return res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name, createdAt: user.createdAt }, token });
});

app.post('/api/logout', requireAuth, async (req, res) => {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (token) {
    await dbRun('DELETE FROM auth_tokens WHERE token = ?', [token]);
  }
  return res.status(204).send();
});

app.get('/api/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

app.get('/api/rooms', requireAuth, async (req, res) => {
  const params = buildQueryParams(req.query);
  let rooms = [];
  const roomRows = await dbAll('SELECT * FROM rooms ORDER BY floor, name');
  for (const row of roomRows) {
    if (params.floor && String(row.floor) !== params.floor) continue;
    const room = {
      id: row.id,
      floor: row.floor,
      name: row.name,
      capacity: row.capacity,
      features: parseJsonArray(row.features) || [],
      status: row.status
    };

    if (params.date && params.start_time && params.end_time) {
      const relatedBookings = await dbAll(`SELECT status, start_time, end_time FROM bookings WHERE room_id = ? AND date = ?`, [row.id, params.date]);
      const hasApproved = relatedBookings.some((booking) => booking.status === 'approved' && overlaps(booking.start_time, booking.end_time, params.start_time, params.end_time));
      const hasPending = relatedBookings.some((booking) => booking.status === 'pending' && overlaps(booking.start_time, booking.end_time, params.start_time, params.end_time));
      room.availableSlots = [{ startTime: params.start_time, endTime: params.end_time, status: hasApproved ? 'approved' : hasPending ? 'pending' : 'available' }];
    }

    rooms.push(room);
  }

  return res.json({ rooms });
});

app.get('/api/events', requireAuth, async (req, res) => {
  const params = buildQueryParams(req.query);
  const rows = await dbAll('SELECT * FROM events');
  const events = rows.map((row) => ({ ...row, visibleTo: parseJsonArray(row.visible_to) }));

  const currentUser = req.user;
  const visibleEvents = events.filter((event) => {
    if (event.type === 'personal') {
      return event.created_by === currentUser.id;
    }
    if (currentUser.role === 'admin') {
      return event.type !== 'personal';
    }
    if (event.visibility === 'everyone') {
      return true;
    }
    if (event.visibility === 'all_students' && currentUser.role === 'student') {
      return true;
    }
    if (event.visibility === 'all_faculty' && currentUser.role === 'faculty') {
      return true;
    }
    if (event.visibility === 'custom' && Array.isArray(event.visibleTo)) {
      return event.visibleTo.includes(currentUser.id);
    }
    return false;
  });

  let filtered = visibleEvents;
  if (params.type) {
    filtered = filtered.filter((event) => event.type === params.type);
  }
  if (params.date_from) {
    filtered = filtered.filter((event) => event.date >= params.date_from);
  }
  if (params.date_to) {
    filtered = filtered.filter((event) => event.date <= params.date_to);
  }
  if (params.booking_id) {
    filtered = filtered.filter((event) => event.booking_id === params.booking_id);
  }

  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.start_time !== b.start_time) return a.start_time < b.start_time ? -1 : 1;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });

  return res.json({ events: filtered.map(buildEventResponse) });
});

app.post('/api/events', requireAuth, async (req, res) => {
  const currentUser = req.user;
  const body = req.body || {};
  const validation = validateEventPayload(body, currentUser);
  if (validation) {
    return sendError(res, validation.status, validation.code, validation.message, validation.fields);
  }

  const type = String(body.type || '').trim();
  const title = String(body.title || '').trim();
  const date = String(body.date || '').trim();
  const startTime = String(body.startTime || body.start_time || '').trim();
  const endTime = String(body.endTime || body.end_time || '').trim();
  const location = String(body.location || '').trim();
  const description = String(body.description || body.notes || '').trim();
  const bookingId = body.bookingId || body.booking_id || null;
  const visibility = String(body.visibility || (type === 'personal' ? 'INTERNAL_PERSONAL_ONLY' : 'everyone')).trim();
  const visibleToValues = parseJsonArray(body.visibleTo);

  if (type === 'personal' && visibility !== 'INTERNAL_PERSONAL_ONLY') {
    return sendError(res, 422, 'PERSONAL_EVENT_VISIBILITY', 'Personal events cannot be shared');
  }

  if (visibility === 'custom' && (!Array.isArray(visibleToValues) || visibleToValues.length === 0)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Custom visibility requires at least one user', { visibleTo: ['At least one user must be selected for custom visibility'] });
  }

  let linkedBooking = null;
  if (bookingId) {
    linkedBooking = await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!linkedBooking) {
      return sendError(res, 404, 'NOT_FOUND', 'Booking not found');
    }
    if (currentUser.role !== 'faculty') {
      return sendError(res, 403, 'ADMIN_CANNOT_CREATE_EVENT_FROM_BOOKING', 'Only the faculty requester can create an event from a booking');
    }
    if (linkedBooking.status !== 'approved') {
      return sendError(res, 422, 'INVALID_STATUS_TRANSITION', 'Event can only be created from an approved booking');
    }
    if (linkedBooking.requested_by !== currentUser.id) {
      return sendError(res, 403, 'FORBIDDEN', 'Only the booking requester can create the linked event');
    }
    if (linkedBooking.event_id) {
      return sendError(res, 422, 'INVALID_STATUS_TRANSITION', 'Booking already has a linked event');
    }
    if (linkedBooking.date !== date || linkedBooking.start_time !== startTime || linkedBooking.end_time !== endTime || linkedBooking.room_id !== location) {
      return sendError(res, 422, 'BOOKING_MISMATCH', 'Event date, time, and room must exactly match the approved booking');
    }
  }

  const eventId = `ev-${Date.now()}-${currentUser.role}`;
  const visibleToJson = visibility === 'custom' ? JSON.stringify(visibleToValues || []) : null;
  const createdAt = new Date().toISOString();

  await dbRun(`INSERT INTO events (id, title, type, created_by, created_at, date, start_time, end_time, location, description, visibility, visible_to, booking_id, cancelled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`, [
    eventId,
    title,
    type,
    currentUser.id,
    createdAt,
    date,
    startTime,
    endTime,
    location || null,
    description,
    visibility,
    visibleToJson,
    bookingId
  ]);

  if (linkedBooking) {
    await dbRun('UPDATE bookings SET event_id = ? WHERE id = ?', [eventId, bookingId]);
  }

  const eventRecord = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);
  return res.status(201).json({ event: buildEventResponse(eventRecord) });
});

app.put('/api/events/:id', requireAuth, async (req, res) => {
  const currentUser = req.user;
  const eventId = req.params.id;
  const body = req.body || {};
  const event = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return sendError(res, 404, 'NOT_FOUND', 'Event not found');
  }
  if (event.created_by !== currentUser.id) {
    return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to edit this event');
  }

  const type = String(body.type || event.type).trim();
  const title = String(body.title || event.title).trim();
  const date = String(body.date || event.date).trim();
  const startTime = String(body.startTime || body.start_time || event.start_time).trim();
  const endTime = String(body.endTime || body.end_time || event.end_time).trim();
  const location = String(body.location || event.location || '').trim();
  const description = String(body.description || body.notes || event.description || '').trim();
  const visibility = String(body.visibility || event.visibility).trim();
  const visibleToValues = parseJsonArray(body.visibleTo) || parseJsonArray(event.visible_to);
  const bookingId = event.booking_id;

  if (event.booking_id && (date !== event.date || startTime !== event.start_time || endTime !== event.end_time || location !== (event.location || ''))) {
    return sendError(res, 422, 'BOOKING_LOCKED', 'Cannot edit date, time, or room for events linked to bookings. Only title, notes, and visibility can be modified.');
  }

  if (currentUser.role === 'student' && type !== 'personal') {
    return sendError(res, 403, 'STUDENT_CANNOT_CREATE_SHARED_EVENT', 'Students can only create personal events');
  }
  if (type === 'personal' && visibility !== 'INTERNAL_PERSONAL_ONLY') {
    return sendError(res, 422, 'PERSONAL_EVENT_VISIBILITY', 'Personal events cannot be shared');
  }
  if (visibility === 'custom' && (!Array.isArray(visibleToValues) || visibleToValues.length === 0)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Custom visibility requires at least one user', { visibleTo: ['At least one user must be selected for custom visibility'] });
  }

  try {
    ensureDateFormat(date);
    ensureTimeFormat(startTime);
    ensureTimeFormat(endTime);
  } catch {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid date or time format');
  }
  if (startTime >= endTime) {
    return sendError(res, 422, 'TIME_RANGE_ERROR', 'Start time must be before end time');
  }

  const visibleToJson = visibility === 'custom' ? JSON.stringify(visibleToValues || []) : null;
  await dbRun(`UPDATE events SET title = ?, type = ?, date = ?, start_time = ?, end_time = ?, location = ?, description = ?, visibility = ?, visible_to = ? WHERE id = ?`, [
    title,
    type,
    date,
    startTime,
    endTime,
    location || null,
    description,
    visibility,
    visibleToJson,
    eventId
  ]);

  const updatedEvent = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);
  return res.json({ event: buildEventResponse(updatedEvent) });
});

app.delete('/api/events/:id', requireAuth, async (req, res) => {
  const currentUser = req.user;
  const eventId = req.params.id;
  const event = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return sendError(res, 404, 'NOT_FOUND', 'Event not found');
  }
  if (event.created_by !== currentUser.id) {
    return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to delete this event');
  }
  if (event.booking_id) {
    return sendError(res, 422, 'BOOKING_MISMATCH', 'Cannot delete an event tied to a booking; cancel the booking instead');
  }

  await dbRun('DELETE FROM events WHERE id = ?', [eventId]);
  return res.status(204).send();
});

app.post('/api/bookings', requireAuth, async (req, res) => {
  const currentUser = req.user;
  const body = req.body || {};
  if (currentUser.role !== 'faculty') {
    return sendError(res, 403, 'STUDENT_CANNOT_REQUEST_BOOKING', 'Only faculty members can request bookings');
  }

  const date = String(body.date || body.booking_date || '').trim();
  const startTime = String(body.startTime || body.start_time || '').trim();
  const endTime = String(body.endTime || body.end_time || '').trim();
  const roomId = String(body.roomId || body.room_id || '').trim();
  const purpose = String(body.purpose || '').trim();
  const equipment = String(body.equipment || '').trim();
  const attachmentName = String(body.attachmentName || body.attachment_name || '').trim();

  const missing = {};
  if (!date) missing.date = ['Date is required'];
  if (!startTime) missing.startTime = ['Start time is required'];
  if (!endTime) missing.endTime = ['End time is required'];
  if (!roomId) missing.roomId = ['Room ID is required'];
  if (!purpose) missing.purpose = ['Purpose is required'];
  if (!equipment) missing.equipment = ['Equipment is required'];
  if (Object.keys(missing).length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Missing required fields', missing);
  }

  const validationError = validateBookingSlot(date, startTime, endTime);
  if (validationError) {
    return sendError(res, 422, 'PAST_DATE_ERROR', validationError.message, { [validationError.field]: [validationError.message] });
  }

  const room = await dbGet('SELECT id FROM rooms WHERE id = ?', [roomId]);
  if (!room) {
    return sendError(res, 404, 'NOT_FOUND', 'Room not found');
  }

  const conflicting = await dbAll(`SELECT id FROM bookings WHERE room_id = ? AND date = ? AND status = 'approved' AND NOT (end_time <= ? OR start_time >= ?)`, [roomId, date, startTime, endTime]);
  if (conflicting.length > 0) {
    return sendError(res, 409, 'OVERLAPPING_BOOKING', `Room ${roomId} is already booked for an overlapping approved slot`);
  }

  const bookingId = `bk-${date.replace(/-/g, '')}-${currentUser.role}-${String(Date.now())}`;
  const now = new Date().toISOString();
  await dbRun(`INSERT INTO bookings (id, requested_by, requested_at, date, start_time, end_time, room_id, purpose, equipment, attachment_name, status, ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`, [
    bookingId,
    currentUser.id,
    now,
    date,
    startTime,
    endTime,
    roomId,
    purpose,
    equipment,
    attachmentName || null
  ]);

  const booking = await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  await createNotification('u-admin-001', 'New booking request', `Booking ${bookingId} was requested for room ${roomId} on ${date}.`, { bookingId });
  return res.status(201).json({ booking: buildBookingResponse(booking) });
});

app.get('/api/bookings', requireAuth, async (req, res) => {
  const currentUser = req.user;
  if (currentUser.role === 'student') {
    return sendError(res, 403, 'FORBIDDEN', 'Students cannot view bookings');
  }

  const params = buildQueryParams(req.query);
  let rows = [];
  if (currentUser.role === 'admin') {
    rows = await dbAll('SELECT * FROM bookings');
  } else {
    rows = await dbAll('SELECT * FROM bookings WHERE requested_by = ?', [currentUser.id]);
  }

  let bookings = rows;
  if (params.mine === '1' || params.mine === 'true') {
    bookings = bookings.filter((booking) => booking.requested_by === currentUser.id);
  }
  if (params.status) {
    bookings = bookings.filter((booking) => booking.status === params.status);
  }
  if (params.room_id) {
    bookings = bookings.filter((booking) => booking.room_id === params.room_id);
  }
  if (params.date_from) {
    bookings = bookings.filter((booking) => booking.date >= params.date_from);
  }
  if (params.date_to) {
    bookings = bookings.filter((booking) => booking.date <= params.date_to);
  }

  bookings.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.start_time !== b.start_time) return a.start_time < b.start_time ? -1 : 1;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return res.json({ bookings: bookings.map(buildBookingResponse) });
});

app.patch('/api/bookings/:id', requireAuth, async (req, res) => {
  const currentUser = req.user;
  const bookingId = req.params.id;
  const body = req.body || {};
  const booking = await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) {
    return sendError(res, 404, 'NOT_FOUND', 'Booking not found');
  }

  if (booking.ended) {
    return sendError(res, 422, 'BOOKING_ALREADY_ENDED', 'Cannot modify booking that has already ended');
  }

  const action = String(body.action || '').trim().toLowerCase();
  const decisionNote = String(body.decisionNote || body.decision_note || '').trim() || null;

  if (action === 'approve' || action === 'reject') {
    if (currentUser.role !== 'admin') {
      return sendError(res, 403, 'ONLY_ADMIN_CAN_APPROVE_BOOKINGS', 'Only admin can approve or reject bookings');
    }
    if (booking.status !== 'pending') {
      return sendError(res, 422, 'INVALID_STATUS_TRANSITION', `Cannot transition from '${booking.status}' to '${action === 'approve' ? 'approved' : 'rejected'}'`);
    }
    if (action === 'approve') {
      const conflicts = await dbAll(`SELECT id FROM bookings WHERE room_id = ? AND date = ? AND status = 'approved' AND id != ? AND NOT (end_time <= ? OR start_time >= ?)`, [booking.room_id, booking.date, bookingId, booking.start_time, booking.end_time]);
      if (conflicts.length > 0) {
        return sendError(res, 409, 'OVERLAPPING_BOOKING', `Room ${booking.room_id} is already booked for an overlapping approved slot`);
      }
      booking.status = 'approved';
    } else {
      booking.status = 'rejected';
    }
    booking.decision_made_by = currentUser.id;
    booking.decision_note = decisionNote;
    booking.decided_at = new Date().toISOString();
    booking.updated_at = booking.decided_at;
  } else if (action === 'cancel') {
    const isRequester = booking.requested_by === currentUser.id;
    if (!isRequester && currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Only the requester or admin can cancel a booking');
    }
    if (booking.status !== 'pending' && booking.status !== 'approved') {
      return sendError(res, 422, 'INVALID_STATUS_TRANSITION', `Cannot transition from '${booking.status}' to 'cancelled'`);
    }
    if (booking.status === 'approved' && booking.event_id) {
      await dbRun('UPDATE events SET booking_id = NULL WHERE id = ?', [booking.event_id]);
      booking.event_id = null;
    }
    booking.status = 'cancelled';
    booking.decision_made_by = currentUser.id;
    booking.decision_note = decisionNote || booking.decision_note || 'Cancelled';
    booking.decided_at = new Date().toISOString();
    booking.updated_at = booking.decided_at;
  } else if (!action && decisionNote !== null) {
    if (currentUser.role !== 'admin') {
      return sendError(res, 403, 'ONLY_ADMIN_CAN_SAVE_NOTE', 'Only admin can save notes on bookings');
    }
    booking.decision_note = decisionNote;
    booking.updated_at = new Date().toISOString();
  } else {
    return sendError(res, 400, 'VALIDATION_ERROR', "Action must be 'approve', 'reject', or 'cancel'", { action: ['Invalid action'] });
  }

  await dbRun(`UPDATE bookings SET status = ?, decision_made_by = ?, decision_note = ?, decided_at = ?, updated_at = ?, event_id = ? WHERE id = ?`, [
    booking.status,
    booking.decision_made_by,
    booking.decision_note,
    booking.decided_at,
    booking.updated_at,
    booking.event_id,
    bookingId
  ]);

  const updatedBooking = await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (currentUser.role === 'admin') {
    const owner = await dbGet('SELECT id FROM users WHERE id = ?', [booking.requested_by]);
    if (owner) {
      await createNotification(owner.id, `Booking ${booking.status}`, `Your booking request ${bookingId} was ${booking.status}.`, { bookingId });
    }
  }

  return res.json({ booking: buildBookingResponse(updatedBooking) });
});

app.get('/api/notifications', requireAuth, async (req, res) => {
  const notifications = await dbAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  const mapped = notifications.map((row) => ({
    id: row.id,
    title: row.title,
    message: row.message,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    read: Boolean(row.read),
    createdAt: row.created_at
  }));
  return res.json({ notifications: mapped });
});

app.post('/api/notifications/mark-read', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const updates = ids.filter((id) => typeof id === 'string');
  for (const id of updates) {
    await dbRun('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [id, req.user.id]);
  }
  return res.status(204).send();
});

app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`APCSync server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Unable to initialize database:', err);
    process.exit(1);
  });
