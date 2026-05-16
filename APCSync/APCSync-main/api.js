window.api = (() => {
    const MIN_DELAY_MS = 200;
    const MAX_DELAY_MS = 600;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function randomDelayMs() {
        return Math.floor(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
    }

    function sleep(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function createApiError(code, message, fields, status = 400) {
        const error = new Error(message);
        error.error = { code, message };
        if (fields && Object.keys(fields).length > 0) {
            error.error.fields = fields;
        }
        error.status = status;
        return error;
    }

    function normalizeError(error) {
        if (error && error.error) {
            return error;
        }
        return createApiError('INTERNAL_ERROR', 'Unexpected error', undefined, 500);
    }

    async function runWithDelay(handler) {
        await sleep(randomDelayMs());
        try {
            return clone(await handler());
        } catch (error) {
            throw normalizeError(error);
        }
    }

    function getState() {
        return service.getState();
    }

    function setState(nextState) {
        return service.setState(nextState);
    }

    function getTodayIso() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function isPastDate(dateStr) {
        return typeof dateStr === 'string' && dateStr < getTodayIso();
    }

    function isInvalidTimeRange(startTime, endTime) {
        return !startTime || !endTime || startTime >= endTime;
    }

    function timeToMinutes(timeValue) {
        const [hours, minutes] = String(timeValue || '').split(':').map(Number);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) return NaN;
        return hours * 60 + minutes;
    }

    function isOverlap(aStart, aEnd, bStart, bEnd) {
        const leftStart = timeToMinutes(aStart);
        const leftEnd = timeToMinutes(aEnd);
        const rightStart = timeToMinutes(bStart);
        const rightEnd = timeToMinutes(bEnd);
        if ([leftStart, leftEnd, rightStart, rightEnd].some(Number.isNaN)) return false;
        return leftStart < rightEnd && rightStart < leftEnd;
    }

    function getDemoUsers(state) {
        return Array.isArray(state.users) ? state.users : [];
    }

    function findUserReference(state, reference) {
        if (!reference) return null;
        const normalized = String(reference).trim().toLowerCase();
        return getDemoUsers(state).find((user) => user.id.toLowerCase() === normalized || user.email.toLowerCase() === normalized) || null;
    }

    function getLoggedInUser(state) {
        if (!state.user?.email) return null;
        return findUserReference(state, state.user.email) || state.user;
    }

    function requireAuth(state) {
        const currentUser = getLoggedInUser(state);
        if (!currentUser) {
            throw createApiError('UNAUTHORIZED', 'You are not logged in', undefined, 401);
        }
        return currentUser;
    }

    function isAdmin(user) {
        return user?.role === 'admin';
    }

    function isFaculty(user) {
        return user?.role === 'faculty';
    }

    function isStudent(user) {
        return user?.role === 'student';
    }

    function getAllBookings(state) {
        return Object.values(state.bookingsById || {});
    }

    function getBookingRoomId(bookingData) {
        return bookingData?.roomId ?? bookingData?.room_id ?? null;
    }

    function getBookingStartTime(bookingData) {
        return bookingData?.startTime ?? bookingData?.start_time ?? null;
    }

    function getBookingEndTime(bookingData) {
        return bookingData?.endTime ?? bookingData?.end_time ?? null;
    }

    function getBookingDate(bookingData) {
        return bookingData?.date ?? null;
    }

    function getBookingStatus(bookingData) {
        return bookingData?.status ?? null;
    }

    function getRoomById(state, roomId) {
        return (state.rooms || []).find((room) => room.id === roomId) || null;
    }

    function getRoomNameById(state, roomId) {
        const room = getRoomById(state, roomId);
        return room?.name || roomId;
    }

    function findApprovedBookingsForUserInSlot(state, date, startTime, endTime, currentUser) {
        if (!currentUser || !isFaculty(currentUser)) return [];
        return getAllBookings(state).filter((booking) => {
            const bookingDate = getBookingDate(booking);
            const bookingStart = getBookingStartTime(booking);
            const bookingEnd = getBookingEndTime(booking);
            const bookingStatus = getBookingStatus(booking);
            const requestedBy = booking.requestedBy || booking.requested_by || '';
            return (
                bookingStatus === 'approved' &&
                requestedBy === currentUser.id &&
                bookingDate === date &&
                bookingStart === startTime &&
                bookingEnd === endTime
            );
        });
    }

    function getEventsFromState(state) {
        const institutionalEvents = [];
        Object.keys(state.institutionalEvents || {}).forEach((dateKey) => {
            (state.institutionalEvents[dateKey] || []).forEach((eventData) => {
                institutionalEvents.push({ ...eventData, date: eventData.date || dateKey });
            });
        });

        const personalEvents = [];
        Object.keys(state.personalEventsByUser || {}).forEach((userKey) => {
            Object.keys(state.personalEventsByUser[userKey] || {}).forEach((dateKey) => {
                (state.personalEventsByUser[userKey][dateKey] || []).forEach((eventData) => {
                    personalEvents.push({ ...eventData, date: eventData.date || dateKey, ownerEmail: userKey });
                });
            });
        });

        return { institutionalEvents, personalEvents };
    }

    function normalizeEventVisibility(payloadType, visibility, visibleTo, currentUser) {
        if (payloadType === 'personal') {
            return { visibility: 'INTERNAL_PERSONAL_ONLY', visibleTo: null };
        }

        const rawVisibility = String(visibility || '').trim();
        const normalized = rawVisibility.toLowerCase().replace(/\s+/g, '_');

        if (normalized === 'everyone' || normalized === 'all_students' || normalized === 'all_faculty' || normalized === 'custom') {
            if (normalized === 'custom') {
                const resolvedVisibleTo = normalizeVisibleToList(visibleTo, currentUser);
                return { visibility: 'custom', visibleTo: resolvedVisibleTo };
            }
            return { visibility: normalized, visibleTo: null };
        }

        if (Array.isArray(visibleTo) || typeof visibleTo === 'string') {
            return { visibility: 'custom', visibleTo: normalizeVisibleToList(visibleTo, currentUser) };
        }

        return { visibility: 'everyone', visibleTo: null };
    }

    function normalizeVisibleToList(rawValue, currentUser) {
        const state = getState();
        const values = Array.isArray(rawValue)
            ? rawValue
            : String(rawValue || '')
                .split(/[\n,;]/)
                .map((item) => item.trim())
                .filter(Boolean);

        const resolved = values
            .map((item) => findUserReference(state, item) || null)
            .filter(Boolean)
            .map((user) => user.id);

        const uniqueResolved = [...new Set(resolved)];
        if (currentUser?.role === 'student' && uniqueResolved.length > 0) {
            return uniqueResolved;
        }
        return uniqueResolved;
    }

    function mapEventForClient(eventData) {
        return {
            ...clone(eventData),
            bookingId: eventData.bookingId ?? eventData.booking_id ?? null,
            booking_id: eventData.booking_id ?? eventData.bookingId ?? null,
            visibleTo: Array.isArray(eventData.visibleTo)
                ? eventData.visibleTo.join(', ')
                : eventData.visibleTo ?? null
        };
    }

    function mapBookingForClient(bookingData) {
        const roomId = bookingData.roomId ?? bookingData.room_id ?? null;
        const requestedBy = bookingData.requestedBy ?? bookingData.requested_by ?? null;
        const requestedByEmail = bookingData.requestedByEmail ?? bookingData.requested_by_email ?? null;
        const startTime = bookingData.startTime ?? bookingData.start_time ?? null;
        const endTime = bookingData.endTime ?? bookingData.end_time ?? null;
        const attachmentName = bookingData.attachmentName ?? bookingData.attachment_name ?? null;
        const decidedBy = bookingData.decidedBy ?? bookingData.decided_by ?? null;
        const decidedAt = bookingData.decidedAt ?? bookingData.decided_at ?? null;
        const decisionNote = bookingData.decisionNote ?? bookingData.decision_note ?? null;
        const createdAt = bookingData.createdAt ?? bookingData.created_at ?? null;
        const updatedAt = bookingData.updatedAt ?? bookingData.updated_at ?? null;
        const eventId = bookingData.eventId ?? bookingData.event_id ?? null;

        return {
            ...clone(bookingData),
            roomId,
            room_id: roomId,
            requestedBy,
            requested_by: requestedBy,
            requestedByEmail,
            requested_by_email: requestedByEmail,
            startTime,
            start_time: startTime,
            endTime,
            end_time: endTime,
            attachmentName,
            attachment_name: attachmentName,
            decidedBy,
            decided_by: decidedBy,
            decidedAt,
            decided_at: decidedAt,
            decisionNote,
            decision_note: decisionNote,
            createdAt,
            created_at: createdAt,
            updatedAt,
            updated_at: updatedAt,
            eventId,
            event_id: eventId
        };
    }

    function sortEvents(events) {
        return [...events].sort((left, right) => {
            if (left.date !== right.date) return left.date < right.date ? -1 : 1;
            if ((left.startTime || '') !== (right.startTime || '')) return (left.startTime || '') < (right.startTime || '') ? -1 : 1;
            return String(left.title || '').localeCompare(String(right.title || ''));
        });
    }

    function sortBookings(bookings) {
        return [...bookings].sort((left, right) => {
            if (left.date !== right.date) return left.date < right.date ? -1 : 1;
            if ((left.startTime || '') !== (right.startTime || '')) return (left.startTime || '') < (right.startTime || '') ? -1 : 1;
            return String(left.id || '').localeCompare(String(right.id || ''));
        });
    }

    function bookingIsEnded(bookingData) {
        const bookingDate = getBookingDate(bookingData);
        const bookingEndTime = getBookingEndTime(bookingData);
        if (!bookingDate || !bookingEndTime) return false;
        const now = new Date();
        const endMoment = new Date(`${bookingDate}T${bookingEndTime}:00`);
        return endMoment.getTime() <= now.getTime();
    }

    function syncEndedBookings(state) {
        let changed = false;
        Object.keys(state.bookingsById || {}).forEach((bookingId) => {
            const bookingData = state.bookingsById[bookingId];
            const nextEnded = bookingIsEnded(bookingData);
            if (bookingData.ended !== nextEnded) {
                bookingData.ended = nextEnded;
                if (nextEnded && bookingData.status !== 'completed') {
                    bookingData.status = 'completed';
                    bookingData.updated_at = new Date().toISOString();
                }
                changed = true;
            }
        });
        if (changed) {
            setState(state);
        }
        return state;
    }

    function findEventLocation(state, eventId) {
        const { institutionalEvents, personalEvents } = getEventsFromState(state);

        for (const dateKey of Object.keys(state.institutionalEvents || {})) {
            const index = (state.institutionalEvents[dateKey] || []).findIndex((eventData) => eventData.id === eventId);
            if (index !== -1) {
                return { storeType: 'institutional', dateKey, index, event: state.institutionalEvents[dateKey][index] };
            }
        }

        const currentUser = getLoggedInUser(state);
        if (currentUser?.email && state.personalEventsByUser?.[currentUser.email]) {
            for (const dateKey of Object.keys(state.personalEventsByUser[currentUser.email] || {})) {
                const index = (state.personalEventsByUser[currentUser.email][dateKey] || []).findIndex((eventData) => eventData.id === eventId);
                if (index !== -1) {
                    return { storeType: 'personal', ownerEmail: currentUser.email, dateKey, index, event: state.personalEventsByUser[currentUser.email][dateKey][index] };
                }
            }
        }

        return { storeType: null, dateKey: null, index: -1, event: null, institutionalEvents, personalEvents };
    }

    function canViewInstitutionalEvent(eventData, currentUser) {
        if (isAdmin(currentUser)) return true;
        const visibility = eventData.visibility || (eventData.visibleTo ? 'custom' : 'everyone');
        if (visibility === 'everyone') return true;
        if (visibility === 'all_students') return isStudent(currentUser) || isFaculty(currentUser);
        if (visibility === 'all_faculty') return isFaculty(currentUser);
        if (visibility === 'custom') {
            const visibleTo = Array.isArray(eventData.visibleTo)
                ? eventData.visibleTo
                : String(eventData.visibleTo || '')
                    .split(/[\n,;]/)
                    .map((item) => item.trim())
                    .filter(Boolean);
            return visibleTo.includes(currentUser.id) || visibleTo.includes(currentUser.email);
        }
        return false;
    }

    function canCurrentUserSeeEvent(eventData, currentUser) {
        if (!eventData) return false;
        if (eventData.type === 'personal') {
            if (isAdmin(currentUser)) return false;
            const eventOwner = eventData.createdBy;
            return eventOwner === currentUser.id || eventOwner === currentUser.email;
        }
        return canViewInstitutionalEvent(eventData, currentUser);
    }

    function ensureDateAllowed(dateValue) {
        if (typeof dateValue !== 'string' || dateValue.length === 0) {
            throw createApiError('VALIDATION_ERROR', 'Date is required', { date: ['Date is required'] }, 400);
        }
        if (isPastDate(dateValue)) {
            throw createApiError('PAST_DATE_ERROR', 'Date cannot be in the past', { date: [`Date (${dateValue}) is before today (${getTodayIso()})`] }, 422);
        }
    }

    function ensureTimeAllowed(startTime, endTime) {
        if (isInvalidTimeRange(startTime, endTime)) {
            throw createApiError('TIME_RANGE_ERROR', 'Start time must be before end time', {
                startTime: [`Start time (${startTime || 'missing'}) must be before end time (${endTime || 'missing'})`],
                endTime: [`End time (${endTime || 'missing'}) must be after start time (${startTime || 'missing'})`]
            }, 422);
        }
    }

    function ensureBookingConflictFree(state, bookingCandidate, ignoreBookingId = null) {
        const bookings = getAllBookings(state).filter((bookingData) => bookingData.id !== ignoreBookingId && bookingData.status === 'approved');
        const conflictingBooking = bookings.find((bookingData) => {
            if (getBookingRoomId(bookingData) !== getBookingRoomId(bookingCandidate)) return false;
            if (getBookingDate(bookingData) !== getBookingDate(bookingCandidate)) return false;
            return isOverlap(getBookingStartTime(bookingData), getBookingEndTime(bookingData), getBookingStartTime(bookingCandidate), getBookingEndTime(bookingCandidate));
        });

        if (conflictingBooking) {
            throw createApiError('OVERLAPPING_BOOKING', `Room ${bookingCandidate.roomId} is already booked for overlapping time on ${bookingCandidate.date}`, {
                conflict: {
                    bookingId: conflictingBooking.id,
                    requestedBy: conflictingBooking.requestedBy,
                    startTime: conflictingBooking.startTime,
                    endTime: conflictingBooking.endTime,
                    status: conflictingBooking.status
                }
            }, 409);
        }
    }

    async function login(credentials) {
        return runWithDelay(() => {
            const state = getState();
            const email = String(credentials?.email || '').trim().toLowerCase();
            const password = String(credentials?.password || '').trim();

            if (!email || !password) {
                throw createApiError('VALIDATION_ERROR', 'Email and password are required', {
                    email: email ? [] : ['Email is required'],
                    password: password ? [] : ['Password is required']
                }, 400);
            }

            const user = findUserReference(state, email);
            if (!user) {
                throw createApiError('UNAUTHORIZED', 'Invalid email or password', undefined, 401);
            }

            state.user = {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                createdAt: user.createdAt
            };
            setState(state);
            return { user: state.user };
        });
    }

    async function logout() {
        return runWithDelay(() => {
            const state = getState();
            state.user = {
                id: 'local-user',
                email: '',
                role: 'student',
                name: 'Student Name'
            };
            setState(state);
            return null;
        });
    }

    async function getMe() {
        return runWithDelay(() => {
            const state = getState();
            const currentUser = requireAuth(state);
            return {
                user: {
                    id: currentUser.id,
                    email: currentUser.email,
                    role: currentUser.role,
                    name: currentUser.name,
                    createdAt: currentUser.createdAt || null
                }
            };
        });
    }

    async function listEvents(filters = {}) {
        return runWithDelay(() => {
            const state = syncEndedBookings(getState());
            const currentUser = requireAuth(state);
            const allEvents = getEventsFromState(state);
            let visibleEvents = [];

            if (isAdmin(currentUser)) {
                visibleEvents = allEvents.institutionalEvents.filter((eventData) => eventData.type !== 'personal');
            } else {
                visibleEvents = allEvents.institutionalEvents.filter((eventData) => canViewInstitutionalEvent(eventData, currentUser));
                visibleEvents.push(...allEvents.personalEvents.filter((eventData) => {
                    const ownerEmail = eventData.ownerEmail || eventData.createdByEmail || currentUser.email;
                    return ownerEmail === currentUser.email || eventData.createdBy === currentUser.id;
                }));
            }

            if (filters.type) {
                visibleEvents = visibleEvents.filter((eventData) => eventData.type === filters.type);
            }
            if (filters.date_from) {
                visibleEvents = visibleEvents.filter((eventData) => eventData.date >= filters.date_from);
            }
            if (filters.date_to) {
                visibleEvents = visibleEvents.filter((eventData) => eventData.date <= filters.date_to);
            }
            if (filters.booking_id) {
                visibleEvents = visibleEvents.filter((eventData) => (eventData.bookingId || eventData.booking_id || null) === filters.booking_id);
            }

            return {
                events: sortEvents(visibleEvents).map(mapEventForClient)
            };
        });
    }

    async function createEvent(payload) {
        return runWithDelay(() => {
            const state = getState();
            const currentUser = requireAuth(state);
            const type = String(payload?.type || '').trim();
            const title = String(payload?.title || '').trim();
            const date = String(payload?.date || '').trim();
            const startTime = String(payload?.startTime || '').trim();
            const endTime = String(payload?.endTime || '').trim();
            const location = String(payload?.location || '').trim();
            const description = String(payload?.description || payload?.notes || '').trim();
            const bookingId = payload?.bookingId ? String(payload.bookingId).trim() : null;

            const locationRequired = !isStudent(currentUser);
            if (!title || !type || !date || !startTime || !endTime || (locationRequired && !location) || !description) {
                throw createApiError('VALIDATION_ERROR', 'Missing required fields', {
                    title: title ? [] : ['Title is required'],
                    type: type ? [] : ['Type is required'],
                    date: date ? [] : ['Date is required'],
                    startTime: startTime ? [] : ['Start time is required'],
                    endTime: endTime ? [] : ['End time is required'],
                    location: locationRequired ? (location ? [] : ['Location is required']) : [],
                    description: description ? [] : ['Description is required']
                }, 400);
            }

            ensureDateAllowed(date);
            ensureTimeAllowed(startTime, endTime);

            if (isStudent(currentUser) && type !== 'personal') {
                throw createApiError('STUDENT_CANNOT_CREATE_SHARED_EVENT', 'Students can only create personal events', undefined, 403);
            }

            const normalizedVisibility = normalizeEventVisibility(type, payload?.visibility, payload?.visibleTo, currentUser);
            if (type === 'personal' && normalizedVisibility.visibility !== 'INTERNAL_PERSONAL_ONLY') {
                throw createApiError('PERSONAL_EVENT_VISIBILITY', 'Personal events cannot be shared', {
                    visibility: ['Personal events must have visibility: INTERNAL_PERSONAL_ONLY']
                }, 422);
            }

            if (type !== 'personal' && normalizedVisibility.visibility === 'custom' && (!normalizedVisibility.visibleTo || normalizedVisibility.visibleTo.length === 0)) {
                throw createApiError('VALIDATION_ERROR', 'Custom visibility requires at least one user', {
                    visibleTo: ['At least one demo user must be selected for custom visibility']
                }, 400);
            }

            // Faculty creating non-personal events MUST have an approved booking that matches the event details
            if (isFaculty(currentUser) && type !== 'personal') {
                if (!bookingId) {
                    throw createApiError('BOOKING_REQUIRED', 'Faculty can only create shared events from approved bookings', undefined, 422);
                }
            }

            let linkedBooking = null;
            if (bookingId) {
                if (!isFaculty(currentUser)) {
                    throw createApiError('ADMIN_CANNOT_CREATE_EVENT_FROM_BOOKING', 'Only the faculty requester can create an event from a booking', undefined, 403);
                }
                linkedBooking = state.bookingsById?.[bookingId] || null;
                if (!linkedBooking) {
                    throw createApiError('NOT_FOUND', 'Booking not found', undefined, 404);
                }
                if (getBookingStatus(linkedBooking) !== 'approved') {
                    throw createApiError('INVALID_STATUS_TRANSITION', 'Event can only be created from an approved booking', undefined, 422);
                }
                const bookingRequester = linkedBooking.requestedBy || linkedBooking.requested_by || null;
                if (bookingRequester !== currentUser.id) {
                    throw createApiError('FORBIDDEN', 'Only the booking requester can create the linked event', undefined, 403);
                }
                if (linkedBooking.event_id || linkedBooking.eventId) {
                    throw createApiError('INVALID_STATUS_TRANSITION', 'Booking already has a linked event', undefined, 422);
                }
                const bookingDate = getBookingDate(linkedBooking);
                const bookingStart = getBookingStartTime(linkedBooking);
                const bookingEnd = getBookingEndTime(linkedBooking);
                const bookingRoomId = getBookingRoomId(linkedBooking);
                if (bookingDate !== date || bookingStart !== startTime || bookingEnd !== endTime || bookingRoomId !== location) {
                    throw createApiError('BOOKING_MISMATCH', 'Event date, time, and room must exactly match the approved booking', undefined, 422);
                }
            }

            const eventId = payload?.id || `ev-${Date.now()}-${currentUser.role}`;
            const eventRecord = {
                id: eventId,
                title,
                type,
                createdBy: currentUser.id,
                createdByEmail: currentUser.email,
                createdAt: new Date().toISOString(),
                date,
                startTime,
                endTime,
                location,
                description,
                notes: description,
                visibility: normalizedVisibility.visibility,
                visibleTo: normalizedVisibility.visibleTo,
                bookingId,
                booking_id: bookingId,
                cancelled: false
            };

            if (type === 'personal') {
                const personalStore = state.personalEventsByUser[currentUser.email] || (state.personalEventsByUser[currentUser.email] = {});
                if (!personalStore[date]) personalStore[date] = [];
                personalStore[date].push(eventRecord);
            } else {
                if (!state.institutionalEvents[date]) state.institutionalEvents[date] = [];
                state.institutionalEvents[date].push(eventRecord);
            }

            if (linkedBooking) {
                linkedBooking.event_id = eventId;
                linkedBooking.eventId = eventId;
            }

            setState(state);
            return { event: mapEventForClient(eventRecord) };
        });
    }

    async function updateEvent(eventId, payload) {
        return runWithDelay(() => {
            const state = getState();
            const currentUser = requireAuth(state);
            const locationInfo = findEventLocation(state, eventId);
            if (!locationInfo.event) {
                throw createApiError('NOT_FOUND', 'Event not found', undefined, 404);
            }

            const eventRecord = locationInfo.event;
            if (eventRecord.createdBy !== currentUser.id && eventRecord.createdByEmail !== currentUser.email) {
                throw createApiError('FORBIDDEN', 'You do not have permission to edit this event', undefined, 403);
            }

            // Check if event is linked to a booking - if so, prevent editing date/time/room
            const bookingId = eventRecord.bookingId || eventRecord.booking_id || null;
            if (bookingId) {
                const attemptedDate = String(payload?.date || eventRecord.date || '').trim();
                const attemptedStartTime = String(payload?.startTime || eventRecord.startTime || '').trim();
                const attemptedEndTime = String(payload?.endTime || eventRecord.endTime || '').trim();
                const attemptedLocation = String(payload?.location || eventRecord.location || '').trim();

                if (attemptedDate !== eventRecord.date || attemptedStartTime !== eventRecord.startTime || attemptedEndTime !== eventRecord.endTime || attemptedLocation !== eventRecord.location) {
                    throw createApiError('BOOKING_LOCKED', 'Cannot edit date, time, or room for events linked to bookings. Only title, notes, and visibility can be modified.', undefined, 422);
                }
            }

            const nextType = String(payload?.type || eventRecord.type || '').trim();
            const nextDate = String(payload?.date || eventRecord.date || '').trim();
            const nextStartTime = String(payload?.startTime || eventRecord.startTime || '').trim();
            const nextEndTime = String(payload?.endTime || eventRecord.endTime || '').trim();
            const nextLocation = String(payload?.location || eventRecord.location || '').trim();
            const nextTitle = String(payload?.title || eventRecord.title || '').trim();
            const nextDescription = String(payload?.description || payload?.notes || eventRecord.description || eventRecord.notes || '').trim();

            ensureDateAllowed(nextDate);
            ensureTimeAllowed(nextStartTime, nextEndTime);

            if (isStudent(currentUser) && nextType !== 'personal') {
                throw createApiError('STUDENT_CANNOT_CREATE_SHARED_EVENT', 'Students can only create personal events', undefined, 403);
            }

            const normalizedVisibility = normalizeEventVisibility(nextType, payload?.visibility ?? eventRecord.visibility, payload?.visibleTo ?? eventRecord.visibleTo, currentUser);
            if (nextType === 'personal' && normalizedVisibility.visibility !== 'INTERNAL_PERSONAL_ONLY') {
                throw createApiError('PERSONAL_EVENT_VISIBILITY', 'Personal events cannot be shared', {
                    visibility: ['Personal events must have visibility: INTERNAL_PERSONAL_ONLY']
                }, 422);
            }

            if (bookingId) {
                const linkedBooking = state.bookingsById?.[bookingId] || null;
                if (!linkedBooking) {
                    throw createApiError('NOT_FOUND', 'Linked booking not found', undefined, 404);
                }
                const bookingDate = getBookingDate(linkedBooking);
                const bookingStart = getBookingStartTime(linkedBooking);
                const bookingEnd = getBookingEndTime(linkedBooking);
                const bookingRoomId = getBookingRoomId(linkedBooking);
                if (bookingDate !== nextDate || bookingStart !== nextStartTime || bookingEnd !== nextEndTime || bookingRoomId !== nextLocation) {
                    throw createApiError('BOOKING_MISMATCH', 'Linked event must exactly match its approved booking', undefined, 422);
                }
            }

            const nextEvent = {
                ...eventRecord,
                title: nextTitle,
                type: nextType,
                date: nextDate,
                startTime: nextStartTime,
                endTime: nextEndTime,
                location: nextLocation,
                description: nextDescription,
                notes: nextDescription,
                visibility: normalizedVisibility.visibility,
                visibleTo: normalizedVisibility.visibleTo,
                bookingId,
                booking_id: bookingId
            };

            if (locationInfo.storeType === 'personal') {
                const store = state.personalEventsByUser[locationInfo.ownerEmail];
                if (!store[nextDate]) store[nextDate] = [];
                if (locationInfo.dateKey !== nextDate) {
                    store[locationInfo.dateKey].splice(locationInfo.index, 1);
                    if (store[locationInfo.dateKey].length === 0) delete store[locationInfo.dateKey];
                    store[nextDate].push(nextEvent);
                } else {
                    store[locationInfo.dateKey][locationInfo.index] = nextEvent;
                }
            } else {
                if (!state.institutionalEvents[nextDate]) state.institutionalEvents[nextDate] = [];
                if (locationInfo.dateKey !== nextDate) {
                    state.institutionalEvents[locationInfo.dateKey].splice(locationInfo.index, 1);
                    if (state.institutionalEvents[locationInfo.dateKey].length === 0) delete state.institutionalEvents[locationInfo.dateKey];
                    state.institutionalEvents[nextDate].push(nextEvent);
                } else {
                    state.institutionalEvents[locationInfo.dateKey][locationInfo.index] = nextEvent;
                }
            }

            if (bookingId) {
                const booking = state.bookingsById[bookingId];
                booking.event_id = eventId;
                booking.eventId = eventId;
            }

            setState(state);
            return { event: mapEventForClient(nextEvent) };
        });
    }

    async function deleteEvent(eventId) {
        return runWithDelay(() => {
            const state = getState();
            const currentUser = requireAuth(state);
            const locationInfo = findEventLocation(state, eventId);
            if (!locationInfo.event) {
                throw createApiError('NOT_FOUND', 'Event not found', undefined, 404);
            }

            const eventRecord = locationInfo.event;
            if (eventRecord.createdBy !== currentUser.id && eventRecord.createdByEmail !== currentUser.email) {
                throw createApiError('FORBIDDEN', 'You do not have permission to delete this event', undefined, 403);
            }

            if (eventRecord.bookingId || eventRecord.booking_id) {
                throw createApiError('BOOKING_MISMATCH', 'Cannot delete an event tied to a booking; cancel the booking instead', undefined, 422);
            }

            if (locationInfo.storeType === 'personal') {
                const store = state.personalEventsByUser[locationInfo.ownerEmail];
                store[locationInfo.dateKey].splice(locationInfo.index, 1);
                if (store[locationInfo.dateKey].length === 0) delete store[locationInfo.dateKey];
            } else {
                state.institutionalEvents[locationInfo.dateKey].splice(locationInfo.index, 1);
                if (state.institutionalEvents[locationInfo.dateKey].length === 0) delete state.institutionalEvents[locationInfo.dateKey];
            }

            setState(state);
            return null;
        });
    }

    async function listRooms(filters = {}) {
        return runWithDelay(() => {
            const state = syncEndedBookings(getState());
            requireAuth(state);

            let rooms = clone(state.rooms || []);
            if (filters.floor) {
                rooms = rooms.filter((room) => room.floor === filters.floor);
            }

            if (filters.date && filters.start_time && filters.end_time) {
                rooms = rooms.map((room) => {
                    const relatedBookings = getAllBookings(state).filter((booking) => getBookingRoomId(booking) === room.id && getBookingDate(booking) === filters.date);
                    const hasApproved = relatedBookings.some((booking) => getBookingStatus(booking) === 'approved' && isOverlap(getBookingStartTime(booking), getBookingEndTime(booking), filters.start_time, filters.end_time));
                    const hasPending = relatedBookings.some((booking) => getBookingStatus(booking) === 'pending' && isOverlap(getBookingStartTime(booking), getBookingEndTime(booking), filters.start_time, filters.end_time));
                    let slotStatus = 'available';
                    if (hasApproved) slotStatus = 'approved';
                    else if (hasPending) slotStatus = 'pending';

                    return {
                        ...room,
                        availableSlots: [
                            {
                                startTime: filters.start_time,
                                endTime: filters.end_time,
                                status: slotStatus
                            }
                        ]
                    };
                });
            }

            return { rooms };
        });
    }

    async function createBooking(payload) {
        return runWithDelay(() => {
            const state = getState();
            const currentUser = requireAuth(state);
            if (!isFaculty(currentUser)) {
                throw createApiError('STUDENT_CANNOT_REQUEST_BOOKING', 'Only faculty members can request bookings', undefined, 403);
            }

            const date = String(payload?.date || payload?.booking_date || '').trim();
            const startTime = String(payload?.startTime || payload?.start_time || '').trim();
            const endTime = String(payload?.endTime || payload?.end_time || '').trim();
            const roomId = String(payload?.roomId || payload?.room_id || '').trim();
            const purpose = String(payload?.purpose || '').trim();
            const attachmentName = String(payload?.attachmentName || payload?.attachment_name || '').trim();
            const eventId = String(payload?.eventId || payload?.event_id || '').trim() || null;

            if (!date || !startTime || !endTime || !roomId || !purpose) {
                throw createApiError('VALIDATION_ERROR', 'Missing required fields', {
                    date: date ? [] : ['Date is required'],
                    startTime: startTime ? [] : ['Start time is required'],
                    endTime: endTime ? [] : ['End time is required'],
                    roomId: roomId ? [] : ['Room ID is required'],
                    purpose: purpose ? [] : ['Purpose is required']
                }, 400);
            }

            ensureDateAllowed(date);
            ensureTimeAllowed(startTime, endTime);

            if (!getRoomById(state, roomId)) {
                throw createApiError('NOT_FOUND', 'Room not found', undefined, 404);
            }

            ensureBookingConflictFree(state, { date, startTime, endTime, roomId });

            const bookingId = `bk-${date.replace(/-/g, '')}-${currentUser.role}-${String(Object.keys(state.bookingsById || {}).length + 1).padStart(3, '0')}`;
            const nowIso = new Date().toISOString();
            const bookingRecord = {
                id: bookingId,
                room_id: roomId,
                requested_by: currentUser.id,
                requested_by_email: currentUser.email,
                date,
                start_time: startTime,
                end_time: endTime,
                purpose,
                attachment_name: attachmentName || null,
                status: 'pending',
                decided_by: null,
                decided_at: null,
                decision_note: null,
                created_at: nowIso,
                updated_at: nowIso,
                ended: false,
                event_id: eventId
            };

            state.bookingsById[bookingId] = bookingRecord;
            setState(state);
            return { booking: mapBookingForClient(bookingRecord) };
        });
    }

    async function listBookings(filters = {}) {
        return runWithDelay(() => {
            const state = syncEndedBookings(getState());
            const currentUser = requireAuth(state);
            const bookings = getAllBookings(state).map(mapBookingForClient);

            if (isStudent(currentUser)) {
                throw createApiError('FORBIDDEN', 'Students cannot view bookings', undefined, 403);
            }

            let visibleBookings = bookings;
            if (isFaculty(currentUser)) {
                visibleBookings = visibleBookings.filter((booking) => booking.requestedBy === currentUser.id);
            }
            if (filters.mine === '1' || filters.mine === 1 || filters.mine === true) {
                visibleBookings = visibleBookings.filter((booking) => booking.requestedBy === currentUser.id);
            }
            if (filters.status) {
                visibleBookings = visibleBookings.filter((booking) => booking.status === filters.status);
            }
            if (filters.room_id) {
                visibleBookings = visibleBookings.filter((booking) => booking.roomId === filters.room_id);
            }
            if (filters.date_from) {
                visibleBookings = visibleBookings.filter((booking) => booking.date >= filters.date_from);
            }
            if (filters.date_to) {
                visibleBookings = visibleBookings.filter((booking) => booking.date <= filters.date_to);
            }

            return { bookings: sortBookings(visibleBookings) };
        });
    }

    async function updateBookingStatus(bookingId, payload) {
        return runWithDelay(() => {
            const state = syncEndedBookings(getState());
            const currentUser = requireAuth(state);
            const booking = state.bookingsById?.[bookingId] || null;
            if (!booking) {
                throw createApiError('NOT_FOUND', 'Booking not found', undefined, 404);
            }

            const action = String(payload?.action || '').trim().toLowerCase();
            const decisionNote = String(payload?.decisionNote || payload?.decision_note || '').trim();

            if (booking.ended) {
                throw createApiError('BOOKING_ALREADY_ENDED', 'Cannot modify booking that has already ended', undefined, 422);
            }

            if (action === 'approve' || action === 'reject') {
                if (!isAdmin(currentUser)) {
                    throw createApiError('ONLY_ADMIN_CAN_APPROVE_BOOKINGS', 'Only admin can approve or reject bookings', undefined, 403);
                }
                if (booking.status !== 'pending') {
                    throw createApiError('INVALID_STATUS_TRANSITION', `Cannot transition from '${booking.status}' to '${action === 'approve' ? 'approved' : 'rejected'}'`, undefined, 422);
                }
                if (action === 'approve') {
                    ensureBookingConflictFree(state, booking, bookingId);
                    booking.status = 'approved';
                } else {
                    booking.status = 'rejected';
                }
                booking.decided_by = currentUser.id;
                booking.decision_note = decisionNote || null;
                booking.decided_at = new Date().toISOString();
                booking.updated_at = booking.decided_at;
            } else if (action === 'cancel') {
                const requesterMatches = booking.requested_by === currentUser.id || booking.requestedBy === currentUser.id;
                if (!requesterMatches && !isAdmin(currentUser)) {
                    throw createApiError('FORBIDDEN', 'Only the requester or admin can cancel a booking', undefined, 403);
                }
                if (booking.status !== 'pending' && booking.status !== 'approved') {
                    throw createApiError('INVALID_STATUS_TRANSITION', `Cannot transition from '${booking.status}' to 'cancelled'`, undefined, 422);
                }
                if (booking.status === 'approved' && (booking.event_id || booking.eventId)) {
                    const linkedEventId = booking.event_id || booking.eventId;
                    const eventLocation = findEventLocation(state, linkedEventId);
                    if (eventLocation.event) {
                        eventLocation.event.bookingId = null;
                        eventLocation.event.booking_id = null;
                    }
                    booking.eventId = null;
                    booking.event_id = null;
                }
                booking.status = 'cancelled';
                booking.decided_by = currentUser.id;
                booking.decision_note = decisionNote || booking.decision_note || 'Cancelled';
                booking.decided_at = new Date().toISOString();
                booking.updated_at = booking.decided_at;
            } else {
                throw createApiError('VALIDATION_ERROR', "Action must be 'approve', 'reject', or 'cancel'", {
                    action: [`Invalid action: '${action || 'missing'}'`]
                }, 400);
            }

            setState(state);
            return { booking: mapBookingForClient(booking) };
        });
    }

    return {
        login,
        logout,
        getMe,
        listEvents,
        createEvent,
        updateEvent,
        deleteEvent,
        listRooms,
        createBooking,
        listBookings,
        updateBookingStatus,
        getRoomNameById: (roomId) => {
            const state = getState();
            return getRoomNameById(state, roomId);
        },
        findApprovedBookingsForUserInSlot: (date, startTime, endTime) => {
            const state = getState();
            const currentUser = getLoggedInUser(state);
            return runWithDelay(() => findApprovedBookingsForUserInSlot(state, date, startTime, endTime, currentUser)).then(result => {
                if (Array.isArray(result)) return result;
                return [];
            }).catch(() => []);
        }
    };
})();
