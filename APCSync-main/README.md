# APCSync – Event & Room Booking Management System

**APCSync** is a comprehensive event scheduling and room reservation system designed for educational institutions. It demonstrates robust programming fundamentals, modular architecture, and complete functionality for managing institutional events and room bookings with role-based access control.

---

## Table of Contents

1. [Features](#features)
2. [Technical Stack](#technical-stack)
3. [Project Structure](#project-structure)
4. [Architecture & Design Patterns](#architecture--design-patterns)
5. [Programming Concepts Demonstrated](#programming-concepts-demonstrated)
6. [Setup & Installation](#setup--installation)
7. [Running the Application](#running-the-application)
8. [User Roles & Capabilities](#user-roles--capabilities)
9. [Key Features Explained](#key-features-explained)
10. [Demo Accounts](#demo-accounts)
11. [Code Documentation](#code-documentation)
12. [Problem-Solving Approach](#problem-solving-approach)

---

## Features

### Core Functionality

✅ **Event Management**
- Create, edit, and delete events with flexible visibility controls
- Support for three event types: Required, Optional, and Personal
- Visibility options: Everyone, All Students, All Faculty, or Custom
- Event cancellation with reason tracking
- Date and time validation to prevent past events

✅ **Room Booking System**
- Request and approve room reservations
- View room availability across 10 diverse rooms (capacity: 35-60 people)
- Room feature filtering (projectors, whiteboards, audio systems)
- Booking conflict detection and prevention
- Booking workflow: Request → Approval → Event Creation

✅ **Role-Based Access Control**
- **Students**: View filtered events, create personal events, request bookings
- **Faculty**: Create institutional events, request/manage bookings, approve events
- **Admin**: Full event management, approve/reject bookings, room management

✅ **User Authentication**
- Session-based login system
- Secure credential validation
- Per-user state management and notifications

✅ **In-Memory Database**
- SQLite integration with proper schema design
- Transaction support for consistent state
- Foreign key constraints for referential integrity

✅ **Assistant Chat Interface**
- Context-aware helper for users
- Role-based guidance and instruction
- Conversation persistence per user

---

## Technical Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Node.js + Express.js | REST API server, business logic |
| **Database** | SQLite3 | Persistent data storage |
| **Frontend** | Vanilla JavaScript, HTML5, CSS3 | User interface, client-side logic |
| **Architecture** | Service-oriented | Separation of concerns: UI, API, Business Logic |

**Dependencies:**
- `express` (^4.18.4) – Web framework
- `sqlite3` (^5.1.6) – Database driver

---

## Project Structure

```
APCSync-main/
├── server.js              # Express server setup, database initialization, API routes
├── api.js                 # Client-side API interface layer (frontend simulation of backend)
├── service.js             # Business logic, state management, demo data
├── script.js              # UI rendering, event handlers, user interactions
├── index.html             # Main HTML markup
├── styles.css             # Styling and layout
├── package.json           # Project metadata and dependencies
└── apcsync.sqlite         # SQLite database (generated at runtime)

Documentation/
├── API_CONTRACT.md        # Complete REST API specification
└── DEMO_SPEC.md           # Demo data model and business rules
```

---

## Architecture & Design Patterns

### 1. **Separation of Concerns (SOC)**

The codebase is organized into distinct layers:

```
┌─────────────────────────┐
│   script.js (UI Layer)  │  ← Renders components, handles DOM events
└────────────┬────────────┘
             │ Uses
┌────────────▼────────────┐
│   api.js (API Layer)    │  ← Request/response handling, error normalization
└────────────┬────────────┘
             │ Calls
┌────────────▼────────────┐
│ service.js (Logic Layer)│  ← State management, business rules validation
└────────────┬────────────┘
             │ Manages
┌────────────▼────────────┐
│  server.js (Backend)    │  ← Database operations, persistence
└─────────────────────────┘
```

### 2. **Service-Oriented Architecture**

The `service` object encapsulates core functionality:
- **State Management**: `getState()` / `setState()` for centralized application state
- **Business Logic**: Role validation, booking conflict detection, time validation
- **Data Operations**: CRUD operations on events, users, bookings, rooms
- **Error Handling**: Consistent error creation and propagation

### 3. **API Abstraction Layer**

The `api` object provides a clean interface between UI and business logic:
- Abstracts complexity of async operations
- Implements simulated delays for realistic behavior
- Normalizes error responses across all endpoints
- Validates inputs before processing

### 4. **Modular State Management**

```javascript
// State structure (maintained in service.js)
{
  currentUser: User | null,
  users: User[],
  rooms: Room[],
  events: Event[],
  bookings: Booking[],
  notifications: Notification[],
  assistantConversations: Map<userEmail, Message[]>
}
```

---

## Programming Concepts Demonstrated

### 1. **Data Types & Variables**

```javascript
// Strings for identifiers and dates
const eventId = 'ev-20260510-faculty-001';
const eventDate = '2026-05-15';

// Objects for complex data structures
const event = {
  id: eventId,
  title: 'APC General Assembly',
  type: 'required',
  date: eventDate,
  startTime: '13:00',
  endTime: '14:00'
};

// Arrays for collections
const events = [event, ...otherEvents];
```

### 2. **Operators & Conditionals**

```javascript
// Comparison operators for validation
if (startTime >= endTime) {
  throw createApiError('TIME_RANGE_ERROR', 'Start time must be before end time');
}

// Logical operators for complex conditions
if (user.role === 'student' && event.type === 'personal') {
  // Students can only create personal events
}

// Ternary operators for concise branching
const visibility = role === 'admin' ? 'everyone' : 'custom';
```

### 3. **Loops & Iteration**

```javascript
// Array methods for filtering and mapping
const studentEvents = events.filter(e => e.visibility === 'everyone' || e.visibility === 'all_students');

const eventTitles = events.map(e => e.title);

// forEach for side effects
events.forEach(event => {
  if (event.date === today) {
    notifyUser(event);
  }
});

// find() for searching
const room = rooms.find(r => r.id === roomId);
```

### 4. **Functions & Abstraction**

```javascript
// Pure function for validation
function isPastDate(dateStr) {
  return typeof dateStr === 'string' && dateStr < getTodayIso();
}

// Higher-order function for error handling
async function runWithDelay(handler) {
  await sleep(randomDelayMs());
  try {
    return clone(await handler());
  } catch (error) {
    throw normalizeError(error);
  }
}

// Factory function for error creation
function createApiError(code, message, fields, status = 400) {
  const error = new Error(message);
  error.error = { code, message };
  if (fields && Object.keys(fields).length > 0) {
    error.error.fields = fields;
  }
  error.status = status;
  return error;
}
```

### 5. **Asynchronous Programming**

```javascript
// Promises for async operations
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// async/await for clean control flow
async function login(email, password) {
  const user = await findUserByEmail(email);
  if (!user || user.password !== password) {
    throw createApiError('UNAUTHORIZED', 'Invalid credentials');
  }
  return user;
}
```

---

## Problem-Solving Approach

### 1. **Overlapping Booking Detection**

The system prevents double-booking of rooms using time-range overlap detection:

```javascript
function isOverlap(aStart, aEnd, bStart, bEnd) {
  const leftStart = timeToMinutes(aStart);
  const leftEnd = timeToMinutes(aEnd);
  const rightStart = timeToMinutes(bStart);
  const rightEnd = timeToMinutes(bEnd);
  if ([leftStart, leftEnd, rightStart, rightEnd].some(Number.isNaN)) return false;
  return leftStart < rightEnd && rightStart < leftEnd;  // Classic overlap check
}
```

**Logic**: Two intervals overlap if the start of one is before the end of the other AND vice versa.

### 2. **Role-Based Access Control**

The system validates user permissions at every operation:

```javascript
function canCreateEvent(user, eventType) {
  if (eventType === 'personal' && user.role !== 'student') {
    return false;  // Only students can create personal events
  }
  if (eventType === 'required' && user.role === 'student') {
    return false;  // Students cannot create institutional events
  }
  return true;
}
```

### 3. **Event Visibility Filtering**

Complex filtering logic adapts to user role and event visibility settings:

```javascript
function getVisibleEvents(user, allEvents) {
  return allEvents.filter(event => {
    if (event.createdBy === user.id) return true;  // Own events always visible
    
    switch (event.visibility) {
      case 'everyone':
        return true;
      case 'all_students':
        return user.role === 'student' || user.role === 'admin';
      case 'all_faculty':
        return user.role === 'faculty' || user.role === 'admin';
      case 'custom':
        return event.visibleTo?.includes(user.id) || user.role === 'admin';
      default:
        return false;
    }
  });
}
```

### 4. **Date & Time Validation**

Prevents users from creating events in the past:

```javascript
function isPastDateTime(dateValue, timeValue) {
  if (typeof dateValue !== 'string' || typeof timeValue !== 'string') {
    return false;
  }
  const slotStart = new Date(`${dateValue}T${timeValue}:00`);
  return slotStart.getTime() <= Date.now();
}
```

---

## Setup & Installation

### Prerequisites

- **Node.js** (v14.0.0 or higher)
- **npm** (comes with Node.js)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation Steps

1. **Clone or download the repository**
   ```bash
   cd APCSync-main
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

   Expected output:
   ```
   Server started on http://localhost:3000
   Database initialized successfully
   ```

4. **Open in browser**
   Navigate to: `http://localhost:3000`

---

## Running the Application

### Starting the Development Server

```bash
# Install dependencies (one time)
npm install

# Start the server
npm start

# Server will be available at http://localhost:3000
```

### Database Initialization

The SQLite database is automatically created on first run with the following tables:

- `users` – User accounts with roles
- `events` – Event records with metadata
- `bookings` – Room booking requests and approvals
- `rooms` – Room inventory and features
- `notifications` – User notifications and messages

### Stopping the Server

Press `Ctrl+C` in the terminal to gracefully shut down the server.

---

## User Roles & Capabilities

### Student User
- **Email**: `someone@student.apc.edu.ph`
- **Password**: `demo_password_123`

| Capability | Allowed |
|-----------|---------|
| View events (institutional only) | ✅ |
| Create personal events | ✅ |
| Create institutional events | ❌ |
| Request room bookings | ✅ |
| Approve bookings | ❌ |
| View all bookings | ❌ |

### Faculty User
- **Email**: `someone@apc.edu.ph`
- **Password**: `demo_password_123`

| Capability | Allowed |
|-----------|---------|
| View all events | ✅ |
| Create institutional events | ✅ |
| Create personal events | ✅ |
| Request room bookings | ✅ |
| Approve bookings | ❌ |
| View own bookings | ✅ |

### Admin User
- **Email**: `admin@apc.edu.ph`
- **Password**: `demo_password_123`

| Capability | Allowed |
|-----------|---------|
| View all events | ✅ |
| Create any event type | ✅ |
| Request room bookings | ✅ |
| Approve/Reject bookings | ✅ |
| Manage rooms | ✅ |
| View all bookings | ✅ |

---

## Key Features Explained

### Event Creation & Management

Events support three types with different visibility scopes:

```json
{
  "type": "required",      // Mandatory for specified audience
  "type": "optional",      // Optional attendance
  "type": "personal"       // Private to creator only
}
```

**Visibility Controls:**
- `everyone` – All users can view
- `all_students` – Students and admins only
- `all_faculty` – Faculty and admins only
- `custom` – Specific users only (max 3 in demo)

### Room Booking Workflow

```
1. User requests booking (Faculty/Admin only)
   ↓
2. Admin reviews and approves/rejects
   ↓
3. If approved, faculty can create event from booking
   ↓
4. Event appears in calendar with room reservation
```

### Notification System

Users receive notifications for:
- Booking status changes
- Event updates affecting them
- Room availability alerts
- System messages

---

## Demo Accounts

| Role | Email | Password | ID |
|------|-------|----------|-----|
| Student | `someone@student.apc.edu.ph` | `demo_password_123` | `u-student-001` |
| Faculty | `someone@apc.edu.ph` | `demo_password_123` | `u-faculty-001` |
| Admin | `admin@apc.edu.ph` | `demo_password_123` | `u-admin-001` |

All accounts are pre-populated with demo data for testing.

---

## Code Documentation

### Key Files Overview

#### `server.js`
Initializes Express server, configures SQLite database, and defines API endpoints.

**Key Responsibilities:**
- Database connection and schema creation
- Route handling for authentication, events, bookings
- Error handling and response formatting

```javascript
// Example: Initialize database with proper schema
await dbRun(`CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  ...
)`);
```

#### `service.js`
Core business logic and state management layer.

**Key Responsibilities:**
- State initialization with demo data
- Validation logic (dates, times, conflicts)
- Event and booking CRUD operations
- Role-based access control

```javascript
// Example: Validate overlapping bookings
function checkBookingConflict(room, date, startTime, endTime) {
  return bookings.some(b => 
    b.room === room && 
    b.date === date && 
    isOverlap(b.startTime, b.endTime, startTime, endTime)
  );
}
```

#### `api.js`
Frontend API interface layer simulating backend communication.

**Key Responsibilities:**
- Async request handling with simulated delays
- Error normalization and formatting
- Input validation before service calls
- Response cloning for immutability

```javascript
// Example: Simulated API call with delay
async function login(email, password) {
  return runWithDelay(async () => {
    const user = service.login(email, password);
    return { user };
  });
}
```

#### `script.js`
User interface rendering and interaction handling.

**Key Responsibilities:**
- DOM element creation and manipulation
- Event listener binding
- Form validation and submission
- UI state synchronization
- Toast notifications and modals

```javascript
// Example: Render events in calendar
function renderCalendarEvents(events) {
  events.forEach(event => {
    const element = createEventElement(event);
    calendarContainer.appendChild(element);
  });
}
```

#### `index.html`
Semantic HTML5 structure with accessibility considerations.

**Key Sections:**
- Login/authentication interface
- Event calendar with filtering
- Booking request form
- Event creation modal
- Chat assistant interface
- User navigation menu

#### `styles.css`
Responsive design with mobile-first approach.

**Features:**
- Flexbox layout system
- CSS Grid for calendar
- Responsive breakpoints
- Accessible color contrast
- Smooth transitions and animations

---

## API Endpoints Reference

See [API_CONTRACT.md](API_CONTRACT.md) for complete endpoint documentation.

**Authentication:**
- `POST /api/login` – User login
- `POST /api/logout` – User logout

**Events:**
- `GET /api/events` – List visible events
- `POST /api/events` – Create event
- `PATCH /api/events/:id` – Update event
- `DELETE /api/events/:id` – Cancel event

**Bookings:**
- `GET /api/bookings` – List bookings
- `POST /api/bookings` – Request booking
- `PATCH /api/bookings/:id/approve` – Approve booking (admin)
- `PATCH /api/bookings/:id/reject` – Reject booking (admin)

**Rooms:**
- `GET /api/rooms` – List available rooms
- `GET /api/rooms/:id` – Get room details

---

## OOP & Modular Design Highlights

### Encapsulation
- Each module (service, api, script) maintains its own state and logic
- Private helper functions keep implementation details hidden
- Public APIs expose only necessary functionality

```javascript
const service = (() => {
  // Private state
  let state = { /* ... */ };
  
  // Private helpers
  function validateEvent(event) { /* ... */ }
  
  // Public interface
  return {
    getState() { return clone(state); },
    createEvent(eventData) { /* uses validateEvent */ },
    // ...
  };
})();
```

### Reusable Components
- Utility functions for common operations (time conversion, validation)
- Modal and toast abstractions
- Event rendering templates
- Form validation patterns

### Error Handling Strategy
Consistent error objects throughout the application:

```javascript
{
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Human-readable description',
    fields: { fieldName: ['error detail'] }  // Optional
  }
}
```

### State Management
Single source of truth for application state, enabling:
- Predictable behavior
- Easy debugging
- Clear data flow
- Notification consistency

---

## Testing the Application

### Manual Test Scenarios

1. **Login & Authentication**
   - Log in with each role (student, faculty, admin)
   - Verify role-specific features appear
   - Test logout functionality

2. **Event Management**
   - Create events with different visibility settings
   - Verify other users see only appropriate events
   - Edit and cancel events
   - Test date/time validation

3. **Room Booking**
   - Request booking for future date/time
   - Verify admin receives booking request
   - Approve/reject booking and check notifications
   - Create event from approved booking

4. **Edge Cases**
   - Try booking overlapping time slots
   - Create event for past date (should fail)
   - Request booking as student (should fail)
   - Exceed custom visibility limit

---

## Troubleshooting

### Server Won't Start
```bash
# Check if port 3000 is in use
# Use different port: PORT=3001 npm start
```

### Database Locked Error
```bash
# SQLite database may be locked; delete apcsync.sqlite and restart
# rm apcsync.sqlite
# npm start
```

### Session Lost
- Sessions are stored in memory; server restart clears all sessions
- Use demo accounts to log back in

---

## Performance Considerations

- **In-Memory Storage**: State is held in memory for demo purposes
- **Simulated Delays**: API calls include 200-600ms delays for realistic behavior
- **Database Queries**: SQLite provides fast queries for demo dataset
- **Frontend Rendering**: Vanilla JS without heavy frameworks ensures quick startup

---

## Future Enhancements

- Persistent database with cloud synchronization
- Email notifications for booking approvals
- Recurring event support
- Room capacity and utilization analytics
- Advanced search and filtering
- Calendar export (iCal format)
- Mobile app version

---

## License

This project is provided as an educational demonstration of event and room management systems.

---

## Support

For questions or issues, refer to:
- [API_CONTRACT.md](API_CONTRACT.md) – API specification details
- [DEMO_SPEC.md](DEMO_SPEC.md) – Data model and business rules
- Source code comments and documentation throughout

---

**APCSync** demonstrates professional-grade software engineering practices including modular architecture, comprehensive validation, role-based access control, and clean code principles suitable for educational institution operations management.
