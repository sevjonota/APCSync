# APCSync FINAL DEMO SPECIFICATION
**Status: LOCKED** | Demo-only, 3 accounts, deterministic rules

---

## 1. DEMO ACCOUNTS (Immutable)
Only these 3 accounts exist in the demo:

| Role | Email | ID | Capabilities |
|------|-------|--|----|
| **Student** | `someone@student.apc.edu.ph` | `u-student-001` | View events (filtered), create/edit personal events, request room bookings |
| **Faculty** | `someone@apc.edu.ph` | `u-faculty-001` | Create institutional events, request/view bookings, see own events + all shared institutional |
| **Admin** | `admin@apc.edu.ph` | `u-admin-001` | Create institutional events, approve/reject bookings, view all events (except personal), manage rooms |

---

## 2. DATA MODELS

### 2.1 User
```json
{
  "id": "u-{role}-{number}",
  "email": "string (unique, immutable)",
  "role": "student" | "faculty" | "admin",
  "name": "string (display name)",
  "createdAt": "ISO 8601 timestamp"
}
```

**Example:**
```json
{
  "id": "u-student-001",
  "email": "someone@student.apc.edu.ph",
  "role": "student",
  "name": "John Student",
  "createdAt": "2026-05-01T10:00:00Z"
}
```

---

### 2.2 Event
```json
{
  "id": "ev-{timestamp}-{creatorRole}",
  "title": "string",
  "type": "required" | "optional" | "personal",
  "createdBy": "userId",
  "createdAt": "ISO 8601 timestamp",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM (24-hour)",
  "endTime": "HH:MM (24-hour)",
  "location": "string | null (room ID if applicable)",
  "description": "string | null",
  "visibility": "everyone" | "all_students" | "all_faculty" | "custom",
  "visibleTo": ["userId"] or null (only for custom visibility, max 3 users in demo),
  "bookingId": "string | null (only if created from approved booking)",
  "cancelled": false | {cancelledBy: userId, cancelledAt: timestamp, reason: string}
}
```

**Constraints:**
- `type === "personal"` → `visibility` must be NOT visible to anyone else (internal flag)
- `type === "required"` or `type === "optional"` → institutional event, `visibility` in {everyone, all_students, all_faculty, custom}
- `date >= today` (no past events allowed)
- `startTime < endTime`
- If `bookingId` is set, `location` must match the approved booking's room

**Examples:**

*Institutional Required Event:*
```json
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
```

*Personal Event (Student):*
```json
{
  "id": "ev-20260510-student-001",
  "title": "Study Group - Data Structures",
  "type": "personal",
  "createdBy": "u-student-001",
  "createdAt": "2026-05-10T15:00:00Z",
  "date": "2026-05-12",
  "startTime": "15:00",
  "endTime": "17:00",
  "location": "Library",
  "description": "Reviewing BST implementations",
  "visibility": "INTERNAL_PERSONAL_ONLY",
  "visibleTo": null,
  "bookingId": null,
  "cancelled": false
}
```

*Event Created from Approved Booking:*
```json
{
  "id": "ev-20260510-faculty-002",
  "title": "Discrete Math Lecture",
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
  "bookingId": "bk-20260510-faculty-001",
  "cancelled": false
}
```

---

### 2.3 Room
```json
{
  "id": "rm-{number}",
  "floor": "G" | "1" | "2" | "3" | "4",
  "name": "string (e.g., 'G01 - Lecture Hall')",
  "capacity": "number",
  "features": ["projector" | "whiteboard" | "audio_system"],
  "status": "available" | "maintenance"
}
```

**Example:**
```json
{
  "id": "rm-001",
  "floor": "1",
  "name": "Room 101 - Classroom A",
  "capacity": 50,
  "features": ["projector", "whiteboard"],
  "status": "available"
}
```

---

### 2.4 Booking
```json
{
  "id": "bk-{date}-{creatorRole}-{sequence}",
  "requestedBy": "userId (faculty only can request)",
  "requestedAt": "ISO 8601 timestamp",
  "date": "YYYY-MM-DD (single day only)",
  "startTime": "HH:MM (24-hour)",
  "endTime": "HH:MM (24-hour)",
  "roomId": "rm-{number}",
  "purpose": "string",
  "status": "pending" | "approved" | "rejected" | "cancelled",
  "decisionMadeby": "userId | null",
  "decisionNote": "string | null (e.g., 'Approved for semester', 'Not available on that date')",
  "decidedAt": "ISO 8601 timestamp | null",
  "ended": false | true (set to true after endTime passes, faculty cannot delete ended bookings)
}
```

**Constraints:**
- Only **faculty** can request bookings
- Only **admin** can approve/reject
- `date >= today`
- `startTime < endTime`
- Single day only (no multi-day bookings)
- `decisionMadeby` and `decisionNote` are required if status changes from "pending"
- Status transitions: `pending` → `approved` | `rejected` | `cancelled` (one-way)
- `approved` bookings override `pending` bookings for the same slot (no double-bookings)

**Example:**
```json
{
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
  "ended": false
}
```

---

## 3. ACCESS CONTROL MATRIX

### Create Events
| Action | Student | Faculty | Admin |
|--------|---------|---------|-------|
| **personal** | ✅ | ✅ | ✅ |
| **required/optional** | ❌ | ✅ | ✅ |

### Edit Events
- **Personal event**: Only creator can edit (if not cancelled)
- **Institutional event (required/optional)**: Only creator can edit (if not cancelled)
- **From booking**: Creator can edit until event ends; cannot delete

### Delete Events
- **Personal**: Creator only, any time
- **Institutional**: Creator only, before event date
- **From booking**: Not allowed (set `cancelled` instead)

### View Events (Visibility Filtering)
- **Personal events**: Only the creator sees them (system hides from all others)
- **Institutional events**:
  - `visibility === "everyone"` → All 3 users see it
  - `visibility === "all_students"` → Student + Faculty see it (admin sees all except personal)
  - `visibility === "all_faculty"` → Faculty only (admin sees all except personal)
  - `visibility === "custom"` → Only users in `visibleTo` array see it (admin sees all except personal)

### Request Bookings
- **Faculty only** can request
- **Student**: ❌ Cannot request bookings

### Approve/Reject Bookings
- **Admin only**
- Sets `status`, `decisionMadeby`, `decisionNote`, `decidedAt`

### Create Event from Booking
- **Faculty** who requested the booking only
- **After booking is approved**
- **Must match**: date, startTime, endTime, roomId
- Sets `bookingId` on the event

---

## 4. VISIBILITY FILTERING LOGIC

**Current Date: 2026-05-10**

### For Student Login
```
Show in Calendar/Dashboard:
- All institutional events (required/optional) visible to them based on visibility rules
- Their own personal events
- Upcoming events (date >= today) only

Hide:
- Personal events created by others
- Events marked as "all_faculty" only
- Events with custom visibility that exclude them
```

### For Faculty Login
```
Show in Calendar/Dashboard:
- All institutional events (required/optional) visible to them
- Their own personal events
- All bookings they requested
- Events created from their approved bookings

Hide:
- Personal events created by others
- Events marked as "all_students" only (but they see their own)
```

### For Admin Login
```
Show in Calendar/Dashboard:
- All institutional events (required/optional)
- All bookings (to manage)
- All events created from bookings

Hide:
- ALL personal events (no matter who created them)
```

---

## 5. BOOKING WORKFLOW (Step-by-Step)

### Step 1: Faculty Requests Booking
- Faculty selects date, time (startTime/endTime), room on booking map
- System creates `Booking` with `status: "pending"`
- Faculty can cancel or modify while pending

### Step 2: Admin Reviews
- Admin sees all pending bookings
- Admin approves/rejects with `decisionNote`
- Sets `decidedAt` timestamp

### Step 3: Faculty Creates Event (Only After Approval)
- Faculty creates event with `type: "required"` or `type: "optional"`
- **Must enter**:
  - `date`, `startTime`, `endTime` (must exactly match booking)
  - `roomId` (must exactly match booking)
  - `title`, `description`, `visibility`
- **System automatically sets**: `bookingId: booking.id`
- Faculty cannot create event if booking is rejected/cancelled

### Step 4: Event Executes
- Event is visible to selected audience during the scheduled time
- At `endTime`, system sets `booking.ended = true`
- Faculty can no longer delete this booking/event

### Key Rules:
- ✅ **Approved overrides Pending**: If slot is booked (approved), pending requests for same slot are blocked
- ✅ **Rejected never blocks**: Rejected bookings don't prevent other bookings for same slot
- ✅ **Single event per booking**: Faculty creates exactly one event tied to booking (bookingId)
- ✅ **Exact match required**: Event time/room must match approved booking exactly
- ✅ **Single-day only**: No multi-day bookings or events

---

## 6. ROOM BOOKING MAP CONTEXT

### Map Display Rules
- **Date selection**: Faculty picks date (single day, >= today)
- **Floor selection**: Faculty picks floor (G, 1, 2, 3, 4)
- **Time filter**: Faculty sees available time slots based on:
  - Approved bookings (block slots)
  - Pending bookings (show but not blocking)
  - Available room slots (show green)
- **On click**: Faculty can:
  - Request booking for that room + time slot
  - View pending/approved bookings for that room on that date

### Visual States:
- 🟢 **Green (Available)**: No approved bookings, can request
- 🟡 **Yellow (Pending)**: Pending booking exists, can still request (will override if approved first)
- 🔴 **Red (Approved/Blocked)**: Approved booking exists, cannot request same slot

---

## 7. DATA CONSISTENCY RULES (Invariants)

1. **No past events**: All events/bookings have `date >= today`
2. **No overlaps (approved)**: No two approved bookings for same room + overlapping time
3. **Time valid**: `startTime < endTime` for all events/bookings
4. **Booking match**: If event has `bookingId`, its date/time/room must exactly match booking
5. **Personal visibility**: Personal events are only for creator (not queryable by others)
6. **User exists**: `createdBy`, `visibleTo[]`, `decisionMadeby` reference valid users from demo accounts only
7. **One-way status**: Booking status can only progress: `pending` → {`approved` | `rejected` | `cancelled`}
8. **Ended invariant**: Once `booking.ended = true`, cannot be modified

---

## 8. DEMO SEED DATA

### Rooms (10 total, across 5 floors)
```
rm-G01, rm-G02 (Floor G)
rm-101, rm-102 (Floor 1)
rm-201, rm-202 (Floor 2)
rm-301, rm-302 (Floor 3)
rm-401, rm-402 (Floor 4)
```

### Pre-loaded Events (Read-only institutional)
- 2026-05-15: APC General Assembly (everyone)
- 2026-05-20: Data Structures Lecture (all_students)

### Pre-loaded Personal Events (Per User)
- Student: One personal event (Study Group on 2026-05-12)
- Faculty: One personal event (Prep Meeting on 2026-05-18)
- Admin: One personal event (Calendar review on 2026-05-11)

---

## 9. OUT OF SCOPE (Not implemented in demo)

- Recurring events
- Multi-day bookings
- External calendar sync
- Email notifications
- User profile management (roles hardcoded by email)
- Custom time zones (all UTC/local)
- Room changes mid-event
- Booking cancellation by admin
- Event cloning/templates

---

**END SPEC**
