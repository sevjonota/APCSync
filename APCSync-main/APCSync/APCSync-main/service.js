// --- APCSync Frontend Service Layer ---
// Frontend-only prototype state holder (in-memory, no backend, no persistence).

const service = (() => {
    const STORAGE_KEY = 'apcsync.frontendState.v2';

    const demoUsers = [
        {
            id: 'u-student-001',
            email: 'someone@student.apc.edu.ph',
            role: 'student',
            name: 'Student User',
            createdAt: '2026-05-01T10:00:00Z'
        },
        {
            id: 'u-faculty-001',
            email: 'someone@apc.edu.ph',
            role: 'faculty',
            name: 'Faculty Member',
            createdAt: '2026-05-01T10:00:00Z'
        },
        {
            id: 'u-admin-001',
            email: 'admin@apc.edu.ph',
            role: 'admin',
            name: 'Admin User',
            createdAt: '2026-05-01T10:00:00Z'
        }
    ];

    const demoRooms = [
        { id: 'rm-G01', floor: 'G', name: 'Ground Floor Room 01', capacity: 40, features: ['projector', 'whiteboard'], status: 'available' },
        { id: 'rm-G02', floor: 'G', name: 'Ground Floor Room 02', capacity: 35, features: ['whiteboard'], status: 'available' },
        { id: 'rm-101', floor: '1', name: 'Room 101', capacity: 50, features: ['projector', 'whiteboard'], status: 'available' },
        { id: 'rm-102', floor: '1', name: 'Room 102', capacity: 45, features: ['projector'], status: 'available' },
        { id: 'rm-201', floor: '2', name: 'Room 201', capacity: 50, features: ['projector', 'audio_system'], status: 'available' },
        { id: 'rm-202', floor: '2', name: 'Room 202', capacity: 40, features: ['projector', 'whiteboard'], status: 'available' },
        { id: 'rm-301', floor: '3', name: 'Room 301', capacity: 45, features: ['projector'], status: 'available' },
        { id: 'rm-302', floor: '3', name: 'Room 302', capacity: 40, features: ['whiteboard'], status: 'available' },
        { id: 'rm-401', floor: '4', name: 'Room 401', capacity: 60, features: ['projector', 'audio_system'], status: 'available' },
        { id: 'rm-402', floor: '4', name: 'Room 402', capacity: 60, features: ['projector', 'whiteboard'], status: 'available' }
    ];

    const personalSeedTemplates = {
        'someone@student.apc.edu.ph': {
            '2026-05-12': [
                {
                    id: 'ev-1003',
                    title: 'Study Group - Data Structures',
                    type: 'personal',
                    createdBy: 'u-student-001',
                    createdAt: '2026-05-10T15:00:00Z',
                    visibility: 'INTERNAL_PERSONAL_ONLY',
                    visibleTo: null,
                    bookingId: null,
                    startTime: '15:00',
                    endTime: '17:00',
                    location: 'Library',
                    notes: 'Reviewing BST implementations and preparing for the quiz.',
                    cancelled: false
                }
            ]
        },
        'someone@apc.edu.ph': {
            '2026-05-18': [
                {
                    id: 'ev-2003',
                    title: 'Prep Meeting',
                    type: 'personal',
                    createdBy: 'u-faculty-001',
                    createdAt: '2026-05-10T10:00:00Z',
                    visibility: 'INTERNAL_PERSONAL_ONLY',
                    visibleTo: null,
                    bookingId: null,
                    startTime: '10:00',
                    endTime: '11:00',
                    location: 'Faculty Lounge',
                    notes: 'Prepare lecture notes and check attendance sheets.',
                    cancelled: false
                }
            ]
        },
        'admin@apc.edu.ph': {
            '2026-05-11': [
                {
                    id: 'ev-3003',
                    title: 'Calendar Review',
                    type: 'personal',
                    createdBy: 'u-admin-001',
                    createdAt: '2026-05-10T08:30:00Z',
                    visibility: 'INTERNAL_PERSONAL_ONLY',
                    visibleTo: null,
                    bookingId: null,
                    startTime: '09:00',
                    endTime: '10:00',
                    location: 'Admin Office',
                    notes: 'Review all shared events and booking queues.',
                    cancelled: false
                }
            ]
        }
    };

    const initialState = {
        user: {
            id: 'u-student-001',
            email: 'someone@student.apc.edu.ph',
            role: 'student',
            name: 'Student User'
        },
        users: demoUsers,
        rooms: demoRooms,
        bookingsById: {},
        institutionalEvents: {
            '2026-05-06': [
                {
                    id: 'ev-1001',
                    title: 'APC General Assembly',
                    type: 'required',
                    createdBy: 'u-faculty-001',
                    createdAt: '2026-05-01T09:00:00Z',
                    dashboardVisible: true,
                    visibility: 'everyone',
                    visibleTo: null,
                    bookingId: null,
                    startTime: '13:00',
                    endTime: '14:00',
                    location: 'Multi-Purpose Hall',
                    notes: 'Mandatory general assembly for all APC students.',
                    cancelled: false
                }
            ],
            '2026-05-09': [
                {
                    id: 'ev-1002',
                    title: 'Data Structures Lecture',
                    type: 'optional',
                    createdBy: 'u-faculty-001',
                    createdAt: '2026-05-01T10:00:00Z',
                    visibility: 'all_students',
                    visibleTo: null,
                    bookingId: null,
                    startTime: '14:30',
                    endTime: '16:00',
                    location: 'Room 402',
                    notes: 'Topic: Implementing Binary Search Trees.',
                    cancelled: false
                }
            ]
        },
        personalEventsByUser: {},
        seededPersonalUsers: {},
        notifications: []
    };

    function normalizeState(rawState) {
        const nextState = rawState && typeof rawState === 'object' ? rawState : {};
        return {
            ...clone(initialState),
            ...nextState,
            user: { ...clone(initialState.user), ...(nextState.user || {}) },
            users: Array.isArray(nextState.users) ? nextState.users : clone(initialState.users),
            rooms: Array.isArray(nextState.rooms) ? nextState.rooms : clone(initialState.rooms),
            bookingsById: nextState.bookingsById && typeof nextState.bookingsById === 'object' ? nextState.bookingsById : {},
            institutionalEvents: nextState.institutionalEvents && typeof nextState.institutionalEvents === 'object'
                ? nextState.institutionalEvents
                : clone(initialState.institutionalEvents),
            personalEventsByUser: nextState.personalEventsByUser && typeof nextState.personalEventsByUser === 'object'
                ? nextState.personalEventsByUser
                : {},
            seededPersonalUsers: nextState.seededPersonalUsers && typeof nextState.seededPersonalUsers === 'object'
                ? nextState.seededPersonalUsers
                : {},
            notifications: Array.isArray(nextState.notifications) ? nextState.notifications : []
        };
    }

    let nextEventId = 2000;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function slugifyRoomKey(value) {
        return String(value || 'room')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'room';
    }

    function getRoomDisplayName(element) {
        return String(element?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim() || 'Room';
    }

    function syncRoomsFromMap() {
        if (typeof document === 'undefined') return state.rooms || [];

        const discovered = Array.from(document.querySelectorAll('.floor-map-wrapper .room, .floor-map-wrapper .nested-room')).map((element, index) => {
            const mapElement = element.closest('.floor-map-wrapper');
            const floorLabel = mapElement?.id ? mapElement.id.replace(/^map-/, '') : 'map';
            const generatedId = `rm-${slugifyRoomKey(floorLabel)}-${String(index + 1).padStart(3, '0')}`;
            const roomId = element.dataset.roomId || element.getAttribute('data-room-id') || generatedId;
            const roomName = getRoomDisplayName(element);

            element.dataset.roomId = roomId;
            element.classList.add('booking-room');

            if (!element.dataset.roomLabel) {
                element.dataset.roomLabel = roomName;
            }

            return {
                id: roomId,
                floor: floorLabel,
                name: roomName,
                capacity: 40,
                features: [],
                status: 'available'
            };
        });

        const roomIndex = new Map();
        [...(state.rooms || []), ...discovered].forEach((room) => {
            if (!roomIndex.has(room.id)) {
                roomIndex.set(room.id, room);
            }
        });

        const mergedRooms = Array.from(roomIndex.values());
        state.rooms = mergedRooms;
        return mergedRooms;
    }

    function loadState() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return normalizeState();
            return normalizeState(JSON.parse(stored));
        } catch {
            return normalizeState();
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Frontend-only prototype: ignore storage failures.
        }
    }

    let state = loadState();

    function getState() {
        syncRoomsFromMap();
        return clone(state);
    }

    function setState(nextState) {
        state = normalizeState(nextState);
        syncRoomsFromMap();
        saveState();
        return clone(state);
    }

    function getUserKey() {
        const email = state.user?.email?.trim().toLowerCase();
        return email || null;
    }

    function ensurePersonalSeedForUser(userKey) {
        if (!userKey) return;

        if (!state.personalEventsByUser[userKey]) {
            const seed = clone(personalSeedTemplates[userKey] || {});
            Object.keys(seed).forEach((dateKey) => {
                seed[dateKey] = seed[dateKey].map((eventData, index) => ({
                    ...eventData,
                    id: `${eventData.id}-${userKey}-${index}`
                }));
            });
            state.personalEventsByUser[userKey] = seed;
        }

        if (!state.seededPersonalUsers[userKey]) {
            state.seededPersonalUsers[userKey] = true;
            saveState();
        }
    }

    function getInstitutionalEvents() {
        return state.institutionalEvents;
    }

    function getRooms() {
        syncRoomsFromMap();
        return clone(state.rooms || []);
    }

    function getBookings() {
        return clone(state.bookingsById || {});
    }

    function getUsers() {
        return clone(state.users || []);
    }

    function getPersonalEvents() {
        const userKey = getUserKey();
        if (!userKey) return {};
        ensurePersonalSeedForUser(userKey);
        return state.personalEventsByUser[userKey] || {};
    }

    function getEventScopes() {
        const userKey = getUserKey();
        return {
            userKey,
            institutionalEvents: state.institutionalEvents,
            personalEvents: userKey ? (state.personalEventsByUser[userKey] || {}) : {}
        };
    }

    function getTodayIso() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function isDateAllowed(dateStr) {
        return typeof dateStr === 'string' && dateStr >= getTodayIso();
    }

    function getUser() {
        return clone(state.user);
    }

    function setUser(userData) {
        state.user = { ...state.user, ...userData };
        const userKey = getUserKey();
        if (userKey) ensurePersonalSeedForUser(userKey);
        saveState();
        return clone(state.user);
    }

    function getEvents() {
        const { institutionalEvents, personalEvents } = getEventScopes();
        return clone({
            ...institutionalEvents,
            ...personalEvents
        });
    }

    function addEvent(date, eventData) {
        if (!isDateAllowed(date)) return null;

        const targetIsPersonal = eventData.type === 'personal';
        const targetUserKey = getUserKey();
        const targetStore = targetIsPersonal && targetUserKey
            ? (state.personalEventsByUser[targetUserKey] || (state.personalEventsByUser[targetUserKey] = {}))
            : state.institutionalEvents;

        if (!targetStore[date]) targetStore[date] = [];
        const created = {
            id: eventData.id || `ev-${nextEventId++}`,
            title: eventData.title,
            type: eventData.type || 'optional',
            dashboardVisible: !!eventData.dashboardVisible,
            visibleTo: eventData.visibleTo || '',
            startTime: eventData.startTime || '',
            endTime: eventData.endTime || '',
            location: eventData.location || '',
            notes: eventData.notes || ''
        };
        targetStore[date].push(created);
        saveState();
        return clone(created);
    }

    function updateEvent(eventId, updatedData) {
        const userKey = getUserKey();
        const stores = [state.institutionalEvents];
        if (userKey && state.personalEventsByUser[userKey]) {
            stores.push(state.personalEventsByUser[userKey]);
        }

        let existingStore = null;
        let existingDate = null;
        let eventIndex = -1;

        stores.forEach((store) => {
            Object.keys(store).forEach((dateKey) => {
                const idx = store[dateKey].findIndex((ev) => ev.id === eventId);
                if (idx !== -1) {
                    existingStore = store;
                    existingDate = dateKey;
                    eventIndex = idx;
                }
            });
        });

        if (!existingStore || !existingDate || eventIndex === -1) return null;

        const current = existingStore[existingDate][eventIndex];
        const targetDate = updatedData.date || existingDate;
        if (!isDateAllowed(targetDate)) return null;

        const updated = {
            ...current,
            ...updatedData,
            id: eventId
        };
        delete updated.date;

        const sourceIsPersonal = existingStore !== state.institutionalEvents;
        const targetIsPersonal = updated.type === 'personal';

        if (sourceIsPersonal && !targetIsPersonal) {
            existingStore[existingDate].splice(eventIndex, 1);
            if (existingStore[existingDate].length === 0) delete existingStore[existingDate];
            if (!state.institutionalEvents[targetDate]) state.institutionalEvents[targetDate] = [];
            state.institutionalEvents[targetDate].push(updated);
        } else if (!sourceIsPersonal && targetIsPersonal) {
            existingStore[existingDate].splice(eventIndex, 1);
            if (existingStore[existingDate].length === 0) delete existingStore[existingDate];
            const personalStore = userKey ? (state.personalEventsByUser[userKey] || (state.personalEventsByUser[userKey] = {})) : state.institutionalEvents;
            if (!personalStore[targetDate]) personalStore[targetDate] = [];
            personalStore[targetDate].push(updated);
        } else if (targetDate === existingDate) {
            existingStore[existingDate][eventIndex] = updated;
        } else {
            existingStore[existingDate].splice(eventIndex, 1);
            if (existingStore[existingDate].length === 0) delete existingStore[existingDate];
            if (!existingStore[targetDate]) existingStore[targetDate] = [];
            existingStore[targetDate].push(updated);
        }

        saveState();
        return clone(updated);
    }

    function deleteEvent(eventId) {
        let deleted = false;
        const stores = [state.institutionalEvents];
        const userKey = getUserKey();
        if (userKey && state.personalEventsByUser[userKey]) {
            stores.push(state.personalEventsByUser[userKey]);
        }

        stores.forEach((store) => {
            Object.keys(store).forEach((dateKey) => {
                const before = store[dateKey].length;
                store[dateKey] = store[dateKey].filter((ev) => ev.id !== eventId);
                if (store[dateKey].length !== before) deleted = true;
                if (store[dateKey].length === 0) delete store[dateKey];
            });
        });

        if (deleted) saveState();
        return deleted;
    }

    // Notifications helpers (persisted in state.notifications)
    function getNotifications() {
        const s = getState();
        return Array.isArray(s.notifications) ? clone(s.notifications) : [];
    }

    function addNotification(payload) {
        const stateLocal = getState();
        if (!Array.isArray(stateLocal.notifications)) stateLocal.notifications = [];
        const id = `nt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const note = {
            id,
            type: String(payload?.type || 'info'),
            message: String(payload?.message || ''),
            data: payload?.data || null,
            unread: payload?.unread !== false,
            createdAt: new Date().toISOString()
        };
        stateLocal.notifications.unshift(note);
        setState(stateLocal);
        return clone(note);
    }

    function markAllNotificationsRead() {
        const stateLocal = getState();
        if (!Array.isArray(stateLocal.notifications)) return false;
        stateLocal.notifications = stateLocal.notifications.map(n => ({ ...n, unread: false }));
        setState(stateLocal);
        return true;
    }

    return {
        getState,
        setState,
        getUser,
        setUser,
        getUsers,
        getRooms,
        getBookings,
        getEvents,
        addEvent,
        updateEvent,
        deleteEvent,
        // Notifications
        getNotifications,
        addNotification,
        markAllNotificationsRead
    };
})();
window.service = service;
