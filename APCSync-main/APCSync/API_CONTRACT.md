# APCSync Backend REST API Contract
**Target: PHP + SQLite** | Demo-only, 3 accounts  
**Status: Specification (Backend-Ready)**

---

## 1. API BASE & CONVENTIONS

**Base URL:** `http://localhost/apcsync/api/` (or cloud equivalent)

**Authentication:** Session-based (HTTP-only cookies) or Bearer Token  
- Login creates session; all subsequent requests include session cookie or `Authorization: Bearer {token}`
- Token expiry: Optional (demo can be session-only)
- No refresh tokens in demo

**Headers (Required):**
```
Content-Type: application/json
Accept: application/json
```

**Timestamps:** All timestamps in ISO 8601 format (UTC)  
**Date Format:** YYYY-MM-DD  
**Time Format:** HH:MM (24-hour)

---

## 2. ERROR RESPONSE SHAPE (Consistent Across All Endpoints)

**HTTP Status Codes:**
- `200 OK` – Successful GET, POST, PATCH (with response body)
- `201 Created` – Successful POST (new resource created)
- `204 No Content` – Successful DELETE or PATCH (no body)
- `400 Bad Request` – Validation error, missing fields, invalid data type
- `401 Unauthorized` – Not logged in
- `403 Forbidden` – Logged in but lacks permission
- `404 Not Found` – Resource not found
- `409 Conflict` – Business logic conflict (e.g., overlapping approved booking)
- `422 Unprocessable Entity` – Semantic error (e.g., past date, invalid status transition)
- `500 Internal Server Error` – Unexpected server error

**Error Response Format (All Errors):**
```json
{
  "error": {
    "code": "string (machine-readable code)",
    "message": "string (human-readable message)",
    "fields": {
      "field_name": ["error_detail_1", "error_detail_2"]
    }
  }
}
```

**Note:** `fields` is optional (only present if validation errors on specific fields).

---

## 3. COMMON ERROR CODES

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `UNAUTHORIZED` | 401 | User not logged in |
| `FORBIDDEN` | 403 | User lacks permission for this action |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Missing/invalid fields |
| `PAST_DATE_ERROR` | 422 | Event/booking date is in the past |
| `TIME_RANGE_ERROR` | 422 | Start time >= end time |
| `OVERLAPPING_BOOKING` | 409 | Approved booking conflicts with requested slot |
| `INVALID_STATUS_TRANSITION` | 422 | Booking status change not allowed (e.g., approved → pending) |
| `BOOKING_ALREADY_ENDED` | 422 | Cannot modify booking after it has ended |
| `BOOKING_MISMATCH` | 422 | Event date/time/room doesn't match booking |
| `PERSONAL_EVENT_VISIBILITY` | 422 | Personal events cannot be shared |
| `ADMIN_CANNOT_CREATE_EVENT_FROM_BOOKING` | 403 | Only faculty can create event from booking |
| `STUDENT_CANNOT_REQUEST_BOOKING` | 403 | Only faculty can request bookings |
| `STUDENT_CANNOT_CREATE_SHARED_EVENT` | 403 | Students can only create personal events |
| `ONLY_ADMIN_CAN_APPROVE_BOOKINGS` | 403 | Only admin can approve/reject bookings |
| `DATABASE_ERROR` | 500 | Unexpected database failure |
| `INTERNAL_ERROR` | 500 | Other server error |

---

## 4. AUTHENTICATION ENDPOINTS

### 4.1 POST /api/login
**Public endpoint (no auth required)**

**Request:**
```json
{
  "email": "someone@student.apc.edu.ph",
  "password": "demo_password_123"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "u-student-001",
    "email": "someone@student.apc.edu.ph",
    "role": "student",
    "name": "John Student",
    "createdAt": "2026-05-01T10:00:00Z"
  },
  "token": "eyJhbGc..." (optional if using sessions)
}
```

**Error (401 Unauthorized):**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid email or password"
  }
}
```

**Validation (400 Bad Request):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email and password are required",
    "fields": {
      "email": ["Email is required"],
      "password": ["Password is required"]
    }
  }
}
```

---

### 4.2 POST /api/logout
**Authenticated endpoint**

**Request:** No body

**Response (204 No Content):** No body

**Error (401 Unauthorized):** Not logged in

---

### 4.3 GET /api/me
**Authenticated endpoint**

**Request:** No body

**Response (200 OK):**
```json
{
  "user": {
    "id": "u-student-001",
    "email": "someone@student.apc.edu.ph",
    "role": "student",
    "name": "John Student",
    "createdAt": "2026-05-01T10:00:00Z"
  }
}
```

**Error (401 Unauthorized):** Not logged in

---

## 5. EVENT ENDPOINTS

### 5.1 GET /api/events
**Authenticated endpoint**  
**Query Parameters:**
- `type` (optional): `"personal"` | `"required"` | `"optional"` | all if omitted
- `date_from` (optional): YYYY-MM-DD (inclusive)
- `date_to` (optional): YYYY-MM-DD (inclusive)
- `booking_id` (optional): Filter events by booking ID

**Request:** No body

**Response (200 OK):**
```json
{
  "events": [
    {
      "id": "ev-20260510-faculty-001",
      "title": "APC General Assembly",
      "type": "required",
      "createdBy": "u-faculty-001",
      "createdAt": "2026-05-01T09:00:00Z",
      "date": "2026-05-15",
      "startTime": "13:00",
      "endTime": "14:00",
      "location": null,
      "description": "Mandatory assembly for all students",
      "visibility": "everyone",
      "visibleTo": null,
      "bookingId": null,
      "cancelled": false
    }
  ]
}
```

**Visibility Filtering (Built-in to backend):**
- **Student**: Gets all institutional events visible to them + their personal events
- **Faculty**: Gets all institutional events visible to them + their personal events
- **Admin**: Gets all institutional events (NOT personal events)

**Error (401 Unauthorized):** Not logged in

---

### 5.2 POST /api/events
**Authenticated endpoint**  
**Permission:**
- **Student**: Can create `type: "personal"` only
- **Faculty**: Can create `type: "personal"` or `type: "required"` or `type: "optional"`
- **Admin**: Can create `type: "personal"` or `type: "required"` or `type: "optional"`

**Request:**
```json
{
  "title": "Data Structures Lecture",
  "type": "optional",
  "date": "2026-05-20",
  "startTime": "14:00",
  "endTime": "16:00",
  "location": "rm-002",
  "description": "Covering graph theory",
  "visibility": "all_students",
  "visibleTo": null,
  "bookingId": null
}
```

**Response (201 Created):**
```json
{
  "event": {
    "id": "ev-20260510-faculty-002",
    "title": "Data Structures Lecture",
    "type": "optional",
    "createdBy": "u-faculty-001",
    "createdAt": "2026-05-10T16:30:00Z",
    "date": "2026-05-20",
    "startTime": "14:00",
    "endTime": "16:00",
    "location": "rm-002",
    "description": "Covering graph theory",
    "visibility": "all_students",
    "visibleTo": null,
    "bookingId": null,
    "cancelled": false
  }
}
```

**Validation Errors (400 Bad Request):**

*Missing required fields:*
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required fields",
    "fields": {
      "title": ["Title is required"],
      "type": ["Type is required"],
      "date": ["Date is required"],
      "startTime": ["Start time is required"],
      "endTime": ["End time is required"]
    }
  }
}
```

*Time range error:*
```json
{
  "error": {
    "code": "TIME_RANGE_ERROR",
    "message": "Start time must be before end time",
    "fields": {
      "startTime": ["Start time (14:00) is not before end time (16:00)"]
    }
  }
}
```

*Past date error:*
```json
{
  "error": {
    "code": "PAST_DATE_ERROR",
    "message": "Event date cannot be in the past",
    "fields": {
      "date": ["Date (2026-05-08) is before today (2026-05-10)"]
    }
  }
}
```

*Personal event with visibility:*
```json
{
  "error": {
    "code": "PERSONAL_EVENT_VISIBILITY",
    "message": "Personal events cannot have shared visibility",
    "fields": {
      "visibility": ["Personal events must have visibility: INTERNAL_PERSONAL_ONLY"]
    }
  }
}
```

**Permission Errors (403 Forbidden):**

*Student creating shared event:*
```json
{
  "error": {
    "code": "STUDENT_CANNOT_CREATE_SHARED_EVENT",
    "message": "Students can only create personal events"
  }
}
```

**Error (401 Unauthorized):** Not logged in

---

### 5.3 GET /api/events/{id}
**Authenticated endpoint**  
**Permission:** User must have visibility for this event

**Request:** No body

**Response (200 OK):**
```json
{
  "event": {
    "id": "ev-20260510-faculty-001",
    "title": "APC General Assembly",
    "type": "required",
    "createdBy": "u-faculty-001",
    "createdAt": "2026-05-01T09:00:00Z",
    "date": "2026-05-15",
    "startTime": "13:00",
    "endTime": "14:00",
    "location": null,
    "description": "Mandatory assembly for all students",
    "visibility": "everyone",
    "visibleTo": null,
    "bookingId": null,
    "cancelled": false
  }
}
```

**Error (404 Not Found):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Event not found or you don't have permission to view it"
  }
}
```

**Error (401 Unauthorized):** Not logged in

---

### 5.4 PUT /api/events/{id}
**Authenticated endpoint**  
**Permission:** Only creator can edit their own event; not allowed if event is cancelled

**Request:**
```json
{
  "title": "Updated Title",
  "date": "2026-05-21",
  "startTime": "15:00",
  "endTime": "17:00",
  "location": "rm-003",
  "description": "Updated description",
  "visibility": "all_faculty"
}
```

**Response (200 OK):** Full updated event object (same schema as GET)

**Validation Errors (same as POST /api/events)**

**Permission Error (403 Forbidden):**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to edit this event"
  }
}
```

**Error (404 Not Found):** Event doesn't exist

---

### 5.5 DELETE /api/events/{id}
**Authenticated endpoint**  
**Permission:**
- Only creator can delete
- Cannot delete if event has `bookingId` (must cancel instead)
- Cannot delete if event date is today or in the past (event already executed)

**Request:** No body

**Response (204 No Content):** No body

**Permission Error (403 Forbidden):**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to delete this event"
  }
}
```

**Error (422 Unprocessable Entity):**
```json
{
  "error": {
    "code": "BOOKING_MISMATCH",
    "message": "Cannot delete event that is tied to a booking; cancel it instead"
  }
}
```

**Error (404 Not Found):** Event doesn't exist

---

## 6. ROOM ENDPOINTS

### 6.1 GET /api/rooms
**Authenticated endpoint**  
**Query Parameters:**
- `floor` (optional): `"G"` | `"1"` | `"2"` | `"3"` | `"4"` (single floor)
- `date` (optional): YYYY-MM-DD (show availability for this date)
- `start_time` (optional): HH:MM (require both start_time and end_time)
- `end_time` (optional): HH:MM

**Request:** No body

**Response (200 OK):**
```json
{
  "rooms": [
    {
      "id": "rm-001",
      "floor": "1",
      "name": "Room 101 - Classroom A",
      "capacity": 50,
      "features": ["projector", "whiteboard"],
      "status": "available",
      "availableSlots": [
        {
          "startTime": "08:00",
          "endTime": "10:00",
          "status": "available"
        },
        {
          "startTime": "10:00",
          "endTime": "14:00",
          "status": "pending"
        },
        {
          "startTime": "14:00",
          "endTime": "16:00",
          "status": "approved"
        }
      ]
    }
  ]
}
```

**Note:** `availableSlots` only returned if `date`, `start_time`, `end_time` query params provided.  
Slot `status` values:
- `"available"` – No bookings for this slot
- `"pending"` – Pending booking exists
- `"approved"` – Approved booking exists (slot blocked)

**Error (401 Unauthorized):** Not logged in

---

## 7. BOOKING ENDPOINTS

### 7.1 POST /api/bookings
**Authenticated endpoint**  
**Permission:** Faculty only (students cannot request)

**Request:**
```json
{
  "date": "2026-05-20",
  "startTime": "14:00",
  "endTime": "16:00",
  "roomId": "rm-002",
  "purpose": "Discrete Math Lecture - Graph Theory"
}
```

**Response (201 Created):**
```json
{
  "booking": {
    "id": "bk-20260520-faculty-001",
    "requestedBy": "u-faculty-001",
    "requestedAt": "2026-05-10T14:00:00Z",
    "date": "2026-05-20",
    "startTime": "14:00",
    "endTime": "16:00",
    "roomId": "rm-002",
    "purpose": "Discrete Math Lecture - Graph Theory",
    "status": "pending",
    "decisionMadeby": null,
    "decisionNote": null,
    "decidedAt": null,
    "ended": false,
    "eventId": null
  }
}
```

**Validation Errors (400 Bad Request):**

*Missing fields:*
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required fields",
    "fields": {
      "date": ["Date is required"],
      "startTime": ["Start time is required"],
      "endTime": ["End time is required"],
      "roomId": ["Room ID is required"],
      "purpose": ["Purpose is required"]
    }
  }
}
```

*Time range error:*
```json
{
  "error": {
    "code": "TIME_RANGE_ERROR",
    "message": "Start time must be before end time"
  }
}
```

*Past date error:*
```json
{
  "error": {
    "code": "PAST_DATE_ERROR",
    "message": "Booking date cannot be in the past"
  }
}
```

**Permission Error (403 Forbidden):**
```json
{
  "error": {
    "code": "STUDENT_CANNOT_REQUEST_BOOKING",
    "message": "Only faculty members can request bookings"
  }
}
```

**Business Logic Error (409 Conflict):**

*Overlapping approved booking:*
```json
{
  "error": {
    "code": "OVERLAPPING_BOOKING",
    "message": "Room rm-002 is already booked for overlapping time on 2026-05-20",
    "fields": {
      "conflict": {
        "bookingId": "bk-20260520-faculty-002",
        "requestedBy": "u-faculty-002",
        "startTime": "14:30",
        "endTime": "15:30",
        "status": "approved"
      }
    }
  }
}
```

**Error (404 Not Found):** Room doesn't exist

**Error (401 Unauthorized):** Not logged in

---

### 7.2 GET /api/bookings
**Authenticated endpoint**  
**Query Parameters:**
- `mine=1` (optional): Only return bookings requested by current user
- `status` (optional): `"pending"` | `"approved"` | `"rejected"` | `"cancelled"` (admin can filter)
- `room_id` (optional): Filter by room
- `date_from` (optional): YYYY-MM-DD
- `date_to` (optional): YYYY-MM-DD

**Permission:**
- **Faculty**: Can see their own bookings + all shared info (but no other faculty's pending bookings)
- **Admin**: Can see all bookings
- **Student**: Cannot see any bookings (403 Forbidden)

**Request:** No body

**Response (200 OK):**
```json
{
  "bookings": [
    {
      "id": "bk-20260520-faculty-001",
      "requestedBy": "u-faculty-001",
      "requestedAt": "2026-05-10T14:00:00Z",
      "date": "2026-05-20",
      "startTime": "14:00",
      "endTime": "16:00",
      "roomId": "rm-002",
      "purpose": "Discrete Math Lecture - Graph Theory",
      "status": "pending",
      "decisionMadeby": null,
      "decisionNote": null,
      "decidedAt": null,
      "ended": false,
      "eventId": null
    }
  ]
}
```

**Permission Error (403 Forbidden):**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Students cannot view bookings"
  }
}
```

**Error (401 Unauthorized):** Not logged in

---

### 7.3 GET /api/bookings/{id}
**Authenticated endpoint**  
**Permission:**
- Faculty can view their own bookings
- Admin can view any booking
- Student cannot view any booking

**Request:** No body

**Response (200 OK):**
```json
{
  "booking": {
    "id": "bk-20260520-faculty-001",
    "requestedBy": "u-faculty-001",
    "requestedAt": "2026-05-10T14:00:00Z",
    "date": "2026-05-20",
    "startTime": "14:00",
    "endTime": "16:00",
    "roomId": "rm-002",
    "purpose": "Discrete Math Lecture - Graph Theory",
    "status": "approved",
    "decisionMadeby": "u-admin-001",
    "decisionNote": "Approved for semester",
    "decidedAt": "2026-05-10T14:30:00Z",
    "ended": false,
    "eventId": "ev-20260510-faculty-002"
  }
}
```

**Error (404 Not Found):** Booking doesn't exist or no permission

**Error (401 Unauthorized):** Not logged in

---

### 7.4 PATCH /api/bookings/{id}
**Authenticated endpoint**  
**Actions:**
- **Approve** (admin only): Set `status: "approved"`, `decisionMadeby`, `decisionNote`
- **Reject** (admin only): Set `status: "rejected"`, `decisionMadeby`, `decisionNote`
- **Cancel** (faculty only, if pending): Set `status: "cancelled"`

**Request (Approve/Reject):**
```json
{
  "action": "approve",
  "decisionNote": "Approved for semester"
}
```

**Request (Cancel):**
```json
{
  "action": "cancel"
}
```

**Response (200 OK):**
```json
{
  "booking": {
    "id": "bk-20260520-faculty-001",
    "requestedBy": "u-faculty-001",
    "requestedAt": "2026-05-10T14:00:00Z",
    "date": "2026-05-20",
    "startTime": "14:00",
    "endTime": "16:00",
    "roomId": "rm-002",
    "purpose": "Discrete Math Lecture - Graph Theory",
    "status": "approved",
    "decisionMadeby": "u-admin-001",
    "decisionNote": "Approved for semester",
    "decidedAt": "2026-05-10T14:30:00Z",
    "ended": false,
    "eventId": null
  }
}
```

**Validation Errors (400 Bad Request):**

*Invalid action:*
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Action must be 'approve', 'reject', or 'cancel'",
    "fields": {
      "action": ["Invalid action: 'invalid_action'"]
    }
  }
}
```

*Missing decision note:*
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Decision note is required for approve/reject",
    "fields": {
      "decisionNote": ["Decision note is required"]
    }
  }
}
```

**Permission Errors (403 Forbidden):**

*Student trying to approve:*
```json
{
  "error": {
    "code": "ONLY_ADMIN_CAN_APPROVE_BOOKINGS",
    "message": "Only admin can approve or reject bookings"
  }
}
```

*Faculty trying to approve own booking:*
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only admin can approve or reject bookings"
  }
}
```

**Business Logic Errors (422 Unprocessable Entity):**

*Invalid status transition:*
```json
{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Cannot transition from 'approved' to 'pending'"
  }
}
```

*Booking already ended:*
```json
{
  "error": {
    "code": "BOOKING_ALREADY_ENDED",
    "message": "Cannot modify booking that has already ended"
  }
}
```

**Error (404 Not Found):** Booking doesn't exist

**Error (401 Unauthorized):** Not logged in

---

## 8. BOOKING-EVENT LINK SPECIFICATION

### 8.1 Booking-Event Relationship

**Fields in Database:**

**Bookings Table:**
```sql
CREATE TABLE bookings (
  id VARCHAR(255) PRIMARY KEY,
  requested_by VARCHAR(255) NOT NULL,
  requested_at DATETIME NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room_id VARCHAR(255) NOT NULL,
  purpose TEXT,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL,
  decision_made_by VARCHAR(255),
  decision_note TEXT,
  decided_at DATETIME,
  ended BOOLEAN DEFAULT FALSE,
  event_id VARCHAR(255) UNIQUE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);
```

**Events Table:**
```sql
CREATE TABLE events (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  type ENUM('required', 'optional', 'personal') NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location VARCHAR(255),
  description TEXT,
  visibility ENUM('everyone', 'all_students', 'all_faculty', 'custom') NOT NULL,
  visible_to JSON,
  booking_id VARCHAR(255) UNIQUE,
  cancelled BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);
```

### 8.2 Linking Rules

**Creating Event from Approved Booking (Faculty):**
1. Faculty provides `booking_id` in POST /api/events request
2. System validates:
   - Booking status is `"approved"`
   - Booking `requestedBy` matches current user (faculty)
   - Event `date`, `startTime`, `endTime` exactly match booking
   - Event `location` (room ID) exactly matches booking `roomId`
3. System sets:
   - `event.booking_id = booking.id`
   - `booking.event_id = event.id`
4. Both records now linked bidirectionally

**Constraint:** Only one event per booking (unique constraint on `event_id` in bookings table)

**Unlinking on Delete (Cascading):**
- If event is deleted: Set `booking.event_id = NULL` (booking persists)
- If booking is deleted: Set `event.booking_id = NULL` (event persists, becomes orphaned)

**Status Checks After Event Creation:**
- Cannot create another event for same booking
- Booking status remains `"approved"`
- Once `booking.ended = true`, both cannot be modified

---

## 9. PERMISSION MATRIX (Quick Reference)

| Action | Student | Faculty | Admin |
|--------|---------|---------|-------|
| **POST /api/events (personal)** | ✅ | ✅ | ✅ |
| **POST /api/events (required/optional)** | ❌ | ✅ | ✅ |
| **PUT /api/events/{id}** | Own personal only | Own events | Own events |
| **DELETE /api/events/{id}** | Own personal | Own events (before date) | Own events (before date) |
| **GET /api/bookings** | ❌ 403 | Own bookings | All bookings |
| **POST /api/bookings** | ❌ 403 | ✅ | ❌ 403 |
| **PATCH /api/bookings/{id}** (approve/reject) | ❌ | ❌ | ✅ |
| **PATCH /api/bookings/{id}** (cancel) | ❌ | Own booking if pending | Own booking if pending |

---

## 10. VALIDATION RULES (Backend)

**Dates:**
- All dates must be >= today (2026-05-10)
- Format: YYYY-MM-DD

**Times:**
- Format: HH:MM (24-hour)
- `startTime < endTime` (strict inequality)

**Overlapping:**
- Approved bookings for same room cannot overlap
- Pending bookings can overlap (not blocking)
- When approving a pending booking, check no other approved bookings conflict

**Event-Booking Link:**
- If `booking_id` is set, `date`, `startTime`, `endTime`, `location` must exactly match
- Cannot create multiple events for same booking
- Cannot change these fields after linking

**Visibility:**
- Personal events: `visibility` must be `"INTERNAL_PERSONAL_ONLY"`; `visibleTo` must be `null`
- Institutional events: `visibility` in {`"everyone"`, `"all_students"`, `"all_faculty"`, `"custom"`}
- Custom visibility: `visibleTo` array contains user IDs (max 3 in demo)

**Status Transitions (Bookings):**
- `pending` → {`approved`, `rejected`, `cancelled`} ✅
- `approved` → {`cancelled`} ✅ (but only if not ended)
- `rejected` → any ❌
- `cancelled` → any ❌

---

## 11. RESPONSE PAGINATION (Optional for Future)

All GET endpoints with multiple results should support pagination:

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `per_page` (optional): Items per page (default: 50, max: 100)

**Response (with pagination):**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 127,
    "pages": 3
  }
}
```

**Note:** Not required for demo (all data is small).

---

## 12. EXAMPLE WORKFLOWS

### Workflow 1: Faculty Books Room & Creates Event

**Step 1:** Faculty requests booking
```
POST /api/bookings
{
  "date": "2026-05-20",
  "startTime": "14:00",
  "endTime": "16:00",
  "roomId": "rm-002",
  "purpose": "Discrete Math Lecture"
}
→ 201 Created
booking.id = "bk-20260520-faculty-001"
booking.status = "pending"
```

**Step 2:** Admin approves booking
```
PATCH /api/bookings/bk-20260520-faculty-001
{
  "action": "approve",
  "decisionNote": "Approved for semester"
}
→ 200 OK
booking.status = "approved"
booking.eventId = null (still no event)
```

**Step 3:** Faculty creates event from booking
```
POST /api/events
{
  "title": "Discrete Math Lecture",
  "type": "optional",
  "date": "2026-05-20",
  "startTime": "14:00",
  "endTime": "16:00",
  "location": "rm-002",
  "description": "Graph Theory",
  "visibility": "all_students",
  "bookingId": "bk-20260520-faculty-001"
}
→ 201 Created
event.id = "ev-20260510-faculty-002"
event.bookingId = "bk-20260520-faculty-001"
booking.eventId = "ev-20260510-faculty-002" (updated)
```

### Workflow 2: Student Views Calendar (Visibility Filter)

**GET /api/events**

Backend filters based on student's role:
- Returns all `visibility: "everyone"` events
- Returns all `visibility: "all_students"` events
- Excludes `visibility: "all_faculty"` events
- Excludes `visibility: "custom"` events where student not in `visibleTo`
- Returns only their own personal events
- Admin sees NO personal events from anyone

---

## 13. NOTES FOR BACKEND IMPLEMENTATION

1. **Session Management:** Consider using HTTP-only cookies (secure) or JWT tokens with refresh logic
2. **Database:** SQLite constraints should enforce:
   - `date >= today` (CHECK constraint)
   - `startTime < endTime` (CHECK constraint)
   - Unique `event_id` in bookings table
   - Unique `booking_id` in events table
3. **Concurrency:** For overlapping booking check, use database transactions
4. **Timestamps:** Store all times in UTC; client handles display timezone
5. **Error Logging:** Log all 500 errors with stack trace for debugging
6. **CORS:** If frontend is on different domain, configure CORS headers
7. **Rate Limiting:** Consider rate limiting for login attempts (not required for demo)
8. **SQL Injection:** Use prepared statements for all queries

---

**END API CONTRACT**
