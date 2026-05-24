document.addEventListener('DOMContentLoaded', async () => {

    const api = window.api;
    const toastContainer = document.getElementById('app-toast-container');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalMessage = document.getElementById('confirm-modal-message');
    const confirmModalClose = document.getElementById('confirm-modal-close');
    const confirmModalCancel = document.getElementById('confirm-modal-cancel');
    const confirmModalConfirm = document.getElementById('confirm-modal-confirm');
    const passwordInput = document.getElementById('password');
    let currentUser = null;
    let pendingConfirmResolve = null;

    function getApiErrorMessage(error, fallback = 'Something went wrong.') {
        return error?.error?.message || error?.message || fallback;
    }

    function applyCurrentUser(user) {
        currentUser = user || null;
        const profileNameEl = document.getElementById('user-profile-name');
        if (profileNameEl) {
            profileNameEl.textContent = currentUser?.name || '';
        }
        applyRoleUi(currentUser?.role || 'student');
    }

    function parseVisibilityPayload(eventType, visibleScope, customUserList) {
        if (eventType === 'personal') {
            return { visibility: 'INTERNAL_PERSONAL_ONLY', visibleTo: null };
        }

        const scope = String(visibleScope || 'everyone').trim().toLowerCase();
        if (scope === 'everyone' || scope === 'all_students' || scope === 'all_faculty') {
            return { visibility: scope, visibleTo: null };
        }

        // Custom visibility: include selected user IDs
        const visibleTo = Array.isArray(customUserList) ? customUserList : [];
        return {
            visibility: 'custom',
            visibleTo: visibleTo.length > 0 ? visibleTo : null
        };
    }

    function groupEventsByDate(events) {
        const groupedEvents = {};
        events.forEach((eventData) => {
            const dateKey = eventData.date;
            if (!groupedEvents[dateKey]) groupedEvents[dateKey] = [];
            groupedEvents[dateKey].push(eventData);
        });

        Object.keys(groupedEvents).forEach((dateKey) => {
            groupedEvents[dateKey].sort((left, right) => {
                if ((left.startTime || '') !== (right.startTime || '')) return (left.startTime || '') < (right.startTime || '') ? -1 : 1;
                return String(left.title || '').localeCompare(String(right.title || ''));
            });
        });

        return groupedEvents;
    }

    function buildUiEventCache(events) {
        Object.keys(eventDetailsData).forEach(key => delete eventDetailsData[key]);

        events.forEach((ev) => {
            const eventKey = String(ev.id);
            const visibleToValue = Array.isArray(ev.visibleTo) ? ev.visibleTo.join(', ') : (ev.visibleTo || '');
            const date = ev.date || '';
            const [year, month, day] = date.split('-');
            const eventDate = date ? new Date(year, month - 1, day) : new Date();
            eventDate.setHours(0, 0, 0, 0);
            const eventDateFormatted = date
                ? eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '';

            eventDetailsData[eventKey] = {
                id: ev.id,
                title: ev.title,
                time: `${eventDateFormatted}, ${ev.startTime} - ${ev.endTime}`,
                location: ev.location,
                description: ev.description || ev.notes || 'No details provided.',
                type: ev.type || 'optional',
                createdBy: ev.createdBy || ev.created_by || null,
                dashboardVisible: !!ev.dashboardVisible,
                visibleTo: visibleToValue,
                visibility: ev.visibility || '',
                visibleToList: Array.isArray(ev.visibleTo) ? ev.visibleTo : (typeof ev.visibleTo === 'string' ? [ev.visibleTo] : []),
                bookingId: ev.bookingId || ev.booking_id || null,
                date,
                startTime: ev.startTime || ev.start_time,
                endTime: ev.endTime || ev.end_time,
                photos: eventPhotoCache[ev.id] || []
            };
        });
    }

    async function loadVisibleEvents() {
        const response = await api.listEvents();
        const events = response.events || [];
        buildUiEventCache(events);
        return groupEventsByDate(events);
    }

    async function refreshViews() {
        const eventsByDate = await loadVisibleEvents();
        await Promise.all([
            renderCalendarV2(eventsByDate),
            renderDashboard(eventsByDate),
            renderBookingSection()
        ]);
    }

    async function bootstrapSession() {
        try {
            const response = await api.getMe();
            applyCurrentUser(response.user);
            loginView.classList.add('hidden');
            loginView.classList.remove('active');
            appWrapper.classList.remove('hidden');
            appWrapper.classList.add('active');
            return true;
        } catch {
            currentUser = null;
            applyRoleUi('student');
            const profileNameEl = document.getElementById('user-profile-name');
            if (profileNameEl) profileNameEl.textContent = '';
            loginView.classList.remove('hidden');
            loginView.classList.add('active');
            appWrapper.classList.add('hidden');
            appWrapper.classList.remove('active');
            return false;
        }
    }

    function showNotice(message, type = 'info') {
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `app-toast ${type}`;
        const iconClass = type === 'error' ? 'fa-circle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
        toast.innerHTML = `<i class="fas ${iconClass}"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));

        window.setTimeout(() => {
            toast.classList.remove('visible');
            window.setTimeout(() => toast.remove(), 180);
        }, 3200);
    }

    function closeConfirmModal(result = false) {
        if (confirmModal) confirmModal.classList.add('hidden');
        if (pendingConfirmResolve) {
            pendingConfirmResolve(result);
            pendingConfirmResolve = null;
        }
    }

    function showConfirm(message) {
        return new Promise(resolve => {
            pendingConfirmResolve = resolve;
            if (confirmModalMessage) confirmModalMessage.textContent = message;
            if (confirmModal) confirmModal.classList.remove('hidden');
        });
    }

    if (confirmModalClose) confirmModalClose.addEventListener('click', () => closeConfirmModal(false));
    if (confirmModalCancel) confirmModalCancel.addEventListener('click', () => closeConfirmModal(false));
    if (confirmModalConfirm) confirmModalConfirm.addEventListener('click', () => closeConfirmModal(true));
    if (confirmModal) {
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) closeConfirmModal(false);
        });
    }

    // Privacy Policy Modal Handler
    const privacyModal = document.getElementById('privacy-modal');
    const privacyLink = document.getElementById('privacy-link');
    const privacyModalClose = document.getElementById('privacy-modal-close');
    const privacyModalAccept = document.getElementById('privacy-modal-accept');

    function closePrivacyModal() {
        if (privacyModal) privacyModal.classList.add('hidden');
    }

    if (privacyLink) {
        privacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (privacyModal) privacyModal.classList.remove('hidden');
        });
    }

    if (privacyModalClose) {
        privacyModalClose.addEventListener('click', closePrivacyModal);
    }

    if (privacyModalAccept) {
        privacyModalAccept.addEventListener('click', closePrivacyModal);
    }

    if (privacyModal) {
        privacyModal.addEventListener('click', (e) => {
            if (e.target === privacyModal) closePrivacyModal();
        });
    }

    // 1. Navigation Flow Logic
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const navLinks = document.querySelectorAll('.nav-link[data-target]');
    const sections = document.querySelectorAll('.content-section');

    function navigateTo(targetId) {
        const user = currentUser;
        if (user && user.role === 'admin' && ['calendar','my-schedule'].includes(targetId)) {
            showNotice('Admin users do not access the student schedule pages.', 'error');
            targetId = 'dashboard';
        }
        if (targetId === 'booking' && user && user.role === 'student') {
            showNotice('Room booking is restricted to faculty members only.', 'error');
            targetId = 'dashboard';
        }

        // Update sidebar active states
        navItems.forEach(item => {
            if (item.dataset.target === targetId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update content sections visibility
        sections.forEach(section => {
            if (section.id === targetId) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });
        
        // Scroll the content area to the top
        document.querySelector('.content-area').scrollTo(0, 0);
    }

    // Attach listeners to Sidebar and Inner UI links
    navItems.forEach(item => item.addEventListener('click', e => { e.preventDefault(); navigateTo(item.dataset.target); }));
    navLinks.forEach(link => link.addEventListener('click', e => { e.preventDefault(); navigateTo(link.dataset.target); }));

    // 2. Frontend-Only Authentication Flow (UI role simulation)
    const loginForm = document.getElementById('login-form');
    const loginView = document.getElementById('login-view');
    const appWrapper = document.getElementById('app-wrapper');
    const btnLogout = document.getElementById('btn-logout');
    const emailInput = document.getElementById('email');
    const bookingNavItem = document.querySelector('.nav-item[data-target="booking"]');

    function applyRoleUi(role) {
        // Booking navigation: hidden for students
        if (bookingNavItem) {
            bookingNavItem.classList.toggle('hidden', role === 'student');
            if (role === 'student' && document.querySelector('.content-section.active')?.id === 'booking') {
                navigateTo('dashboard');
            }
        }

        // Admin-specific nav: hide student-only pages for admin
        const calendarNavItem = document.querySelector('.nav-item[data-target="calendar"]');
        const scheduleNavItem = document.querySelector('.nav-item[data-target="my-schedule"]');
        if (calendarNavItem) calendarNavItem.classList.toggle('hidden', role === 'admin');
        if (scheduleNavItem) scheduleNavItem.classList.toggle('hidden', role === 'admin');

        // Add Event buttons: hide for admin
        const addBtns = [document.getElementById('btn-add-calendar-event'), document.getElementById('btn-add-calendar-event-dash')];
        addBtns.forEach(btn => {
            if (!btn) return;
            btn.classList.toggle('hidden', role === 'admin');
        });

        // Admin Approvals nav: show only for admin
        const adminNav = document.querySelector('.nav-item[data-target="admin-approvals"]');
        if (adminNav) adminNav.classList.toggle('hidden', role !== 'admin');

        if (bookingRequestPanel) {
            bookingRequestPanel.classList.toggle('hidden', role !== 'faculty');
        }
        if (bookingMyBookingsPanel) {
            bookingMyBookingsPanel.classList.toggle('hidden', role !== 'faculty');
        }

        const activeSectionId = document.querySelector('.content-section.active')?.id;
        if (role === 'admin' && ['calendar','my-schedule'].includes(activeSectionId)) {
            navigateTo('dashboard');
        }

        // Event-type enforcement UI: students always see personal type
        if (eventTypeSelect && eventInviteFields) {
            if (role === 'student') {
                eventTypeSelect.value = 'personal';
                eventTypeSelect.disabled = true;
                eventInviteFields.classList.add('hidden');
            } else {
                eventTypeSelect.disabled = false;
                eventInviteFields.classList.remove('hidden');
            }
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value.trim() : '';
        if (!email || !password) {
            showNotice('Please enter your email and password.', 'error');
            return;
        }

        try {
            const response = await api.login({ email, password });
            applyCurrentUser(response.user);

            loginView.classList.add('hidden');
            loginView.classList.remove('active');
            appWrapper.classList.remove('hidden');
            appWrapper.classList.add('active');
            await refreshViews();
            navigateTo('dashboard');
        } catch (error) {
            showNotice(getApiErrorMessage(error, 'Unable to sign in.'), 'error');
        }
    });

    btnLogout.addEventListener('click', async (e) => {
        e.preventDefault();

        await api.logout();
        currentUser = null;
        applyRoleUi('student');
        const profileNameEl = document.getElementById('user-profile-name');
        if (profileNameEl) profileNameEl.textContent = '';

        appWrapper.classList.add('hidden');
        appWrapper.classList.remove('active');
        loginView.classList.remove('hidden');
        loginView.classList.add('active');
    });

    // 3. Interactive visual polish elements
    // Active toggles in toolbar
    const viewToggles = document.querySelectorAll('.view-toggles button');
    viewToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 5. Interactive Schedule Details Logic
    const scheduleDetailsPane = document.getElementById('schedule-details-pane');
    const photoViewerModal = document.getElementById('photo-viewer-modal');
    const photoViewerImage = document.getElementById('photo-viewer-image');
    const closePhotoViewer = document.getElementById('close-photo-viewer');

    const eventDetailsData = {};
    const eventPhotoCache = {};
    let selectedEventPhotos = [];
    let selectedDefaultPhotoKey = null;

    // Default themes switched to photo backgrounds (placeholder public images).
    // Replace these `src` values with local image paths if you prefer bundling assets.
    const defaultEventPhotos = [
        {
            key: 'Theme1',
            name: 'Theme1',
            src: 'https://images.theconversation.com/files/45159/original/rptgtpxd-1396254731.jpg?ixlib=rb-4.1.0&q=45&auto=format&w=754&fit=clip'
        },
        {
            key: 'Theme2',
            name: 'Theme2',
            src: 'https://static.vecteezy.com/system/resources/thumbnails/029/332/550/small/ai-generative-party-scene-from-a-festive-night-club-with-happy-people-and-friends-sony-a7s-realistic-image-free-photo.jpg'
        },
        {
            key: 'Theme3',
            name: 'Theme3',
            src: 'https://images.squarespace-cdn.com/content/v1/581a64823e00be2eafea8d8e/1677285208122-IK7EZGUHWOCTRMDR0NWS/unsplash-image-LQ1t-8Ms5PY.jpg'
        }
    ];

    function loadPhotoCache() {
        try {
            const json = localStorage.getItem('apcsync.eventPhotoCache');
            if (json) {
                const parsed = JSON.parse(json);
                if (parsed && typeof parsed === 'object') {
                    Object.assign(eventPhotoCache, parsed);
                }
            }
        } catch (err) {
            console.warn('Unable to load saved event photos:', err);
        }
    }

    function savePhotoCache() {
        try {
            localStorage.setItem('apcsync.eventPhotoCache', JSON.stringify(eventPhotoCache));
        } catch (err) {
            console.warn('Unable to save event photos:', err);
        }
    }

    loadPhotoCache();

    function renderScheduleDetails(eventId) {
        const data = eventDetailsData[eventId];
        if (!data) return;

        scheduleDetailsPane.innerHTML = `
            <div style="text-align: left; width: 100%;">
                <h2 style="color: var(--navy-blue); margin-bottom: 1rem;">${data.title}</h2>
                <div style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary);">
                    <i class="far fa-clock" style="color: var(--gold-dark); width: 20px;"></i>
                    <span>${data.time}</span>
                </div>
                <div style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary);">
                    <i class="fas fa-map-marker-alt" style="color: var(--gold-dark); width: 20px;"></i>
                    <span>${data.location}</span>
                </div>
                <hr style="border: 0; border-top: 1px solid var(--border-color); margin-bottom: 1.5rem;">
                <div>
                    <h4 style="margin-bottom: 0.5rem; color: var(--text-primary);">Event Details</h4>
                    <p style="color: var(--text-secondary); line-height: 1.6;">${data.description}</p>
                </div>
                ${data.photos && data.photos.length ? `
                    <div style="margin-top: 1.5rem;">
                        <div class="photo-preview-grid">
                            ${data.photos.map(photo => `<img src="${photo.src}" alt="${photo.name}" class="photo-preview-item">`).join('')}
                        </div>
                    </div>
                ` : ''}
                <div style="margin-top: 2rem; display: flex; gap: 0.5rem;">
                    <button class="btn-blue btn-sm" id="btn-edit-schedule-event" data-event-id="${eventId}">Edit</button>
                    <button class="btn-outline btn-sm" id="btn-delete-schedule-event" data-event-id="${eventId}">Delete</button>
                </div>
            </div>
        `;
    }

    function renderScheduleDetailsPlaceholder() {
        if (!scheduleDetailsPane) return;
        scheduleDetailsPane.innerHTML = `
            <div class="placeholder-content" style="border: none; background: transparent; text-align: center; padding: 2rem;">
                <i class="far fa-eye mb-2" style="font-size: 2rem; color: var(--gold-dark);"></i>
                <h3>Select an event</h3>
                <p class="mt-2 text-muted">Click an event from the timeline to view its complete details and requirements.</p>
            </div>
        `;
    }

    function openPhotoViewer(src) {
        if (!photoViewerModal || !photoViewerImage) return;
        photoViewerImage.src = src;
        photoViewerModal.classList.remove('hidden');
    }

    function closePhotoViewerModal() {
        if (!photoViewerModal || !photoViewerImage) return;
        photoViewerModal.classList.add('hidden');
        photoViewerImage.src = '';
    }

    if (scheduleDetailsPane) {
        scheduleDetailsPane.addEventListener('click', (e) => {
            const targetImg = e.target.closest('.photo-preview-item');
            if (!targetImg) return;
            openPhotoViewer(targetImg.src);
        });
    }

    if (closePhotoViewer) {
        closePhotoViewer.addEventListener('click', closePhotoViewerModal);
    }

    // 6. Edit Personal Event Logic
    const personalEventModal = document.getElementById('personal-event-modal');
    const closePersonalModalElements = document.querySelectorAll('#close-personal-modal, #btn-cancel-personal-event');
    const btnSavePersonalEvent = document.getElementById('btn-save-personal-event');

    function closePersonalModal() {
        personalEventModal.classList.add('hidden');
    }

    closePersonalModalElements.forEach(el => el.addEventListener('click', closePersonalModal));

    btnSavePersonalEvent.addEventListener('click', () => {
        btnSavePersonalEvent.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...';
        setTimeout(() => {
            btnSavePersonalEvent.innerHTML = '<i class="fas fa-check mr-2"></i> Saved';
            setTimeout(() => {
                closePersonalModal();
                // Reset button text for the next time the modal is opened
                btnSavePersonalEvent.innerHTML = 'Save Changes';
            }, 600);
        }, 800);
    });

    personalEventModal.addEventListener('click', (e) => {
        if (e.target === personalEventModal) {
            closePersonalModal();
        }
    });

    const addPePhotosButton = document.getElementById('btn-add-pe-photos');
    const addPePhotosInput = document.getElementById('add-pe-photos');
    const addPePhotosInfo = document.getElementById('add-pe-photos-info');

    if (addPePhotosButton && addPePhotosInput) {
        addPePhotosButton.addEventListener('click', () => addPePhotosInput.click());
        addPePhotosInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (addPePhotosInfo) {
                addPePhotosInfo.textContent = files.length
                    ? `${files.length} photo${files.length === 1 ? '' : 's'} selected`
                    : 'No photos selected.';
            }
        });
    }

    scheduleDetailsPane.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btn-edit-personal-event') {
            const eventId = e.target.dataset.eventId;
            const data = eventDetailsData[eventId];

            if (data) {
                document.getElementById('edit-pe-title').value = data.title;
                document.getElementById('edit-pe-time').value = data.time;
                document.getElementById('edit-pe-location').value = data.location;
                document.getElementById('edit-pe-description').value = data.description;
                
                personalEventModal.classList.remove('hidden');
            }
        }
    });

    // 7. (Deprecated) Add Personal Event Logic
    // Removed to share logic with the main Calendar Add Event Modal

    // 8. Calendar V2 - Full Interactive Logic
    const calendarDaysContainer = document.getElementById('calendar-days');
    const monthYearDisplay = document.getElementById('calendar-month-year');
    const btnPrevMonth = document.getElementById('btn-prev-month');
    const btnNextMonth = document.getElementById('btn-next-month');
    const calendarEventModal = document.getElementById('calendar-event-modal');
    const closeCalendarModal = document.getElementById('close-calendar-modal');
    const cancelCalendarEvent = document.getElementById('btn-cancel-calendar-event');
    const saveCalendarEvent = document.getElementById('btn-save-calendar-event');
    const eventForm = document.getElementById('calendar-event-form');
    const eventDateField = document.getElementById('event-date');
    const btnAddCalendarEvent = document.getElementById('btn-add-calendar-event');
    const visibleScopeSelect = document.getElementById('event-visible-scope');
    const customUsersDiv = document.getElementById('event-custom-users');

    const todayRef = new Date();
    todayRef.setHours(0, 0, 0, 0);
    const todayIso = `${todayRef.getFullYear()}-${String(todayRef.getMonth() + 1).padStart(2, '0')}-${String(todayRef.getDate()).padStart(2, '0')}`;
    const bookingDateField = document.getElementById('booking-date');
    const bookingStartTimeField = document.getElementById('booking-start-time');
    const bookingEndTimeField = document.getElementById('booking-end-time');
    const bookingPurposeField = document.getElementById('booking-purpose');
    const bookingEquipmentField = document.getElementById('booking-equipment');
    const bookingAttachmentFileInput = document.getElementById('booking-attachment-file');
    const bookingAttachmentButton = document.getElementById('booking-attachment-button');
    const bookingAttachmentField = document.getElementById('booking-attachment-name');
    const bookingAttachmentHint = document.getElementById('booking-attachment-hint');
    const bookingFormError = document.getElementById('booking-form-error');
    const bookingRequestPanel = document.getElementById('booking-request-panel');
    const bookingAvailabilityNote = document.getElementById('booking-availability-note');
    const bookingRefreshBtn = document.getElementById('btn-refresh-booking-map');
    const bookingClearSelectionBtn = document.getElementById('btn-clear-room-selection');
    const bookingRequestBtn = document.getElementById('btn-request-booking');
    const bookingMyBookingsPanel = document.getElementById('my-bookings-panel');
    const bookingMyBookingsList = document.getElementById('my-bookings-list');
    const bookingRoomNameEl = document.getElementById('popup-room-name');
    const bookingRoomTypeEl = document.getElementById('popup-room-type');
    const bookingRoomStatusEl = document.getElementById('popup-room-status');
    const bookingRoomInfoEl = document.getElementById('popup-room-info');
    const bookingRoomSummary = document.getElementById('booking-room-summary');
    const bookingRoomPhoto = document.getElementById('booking-room-photo');
    const bookingRoomPhotoGallery = document.getElementById('booking-room-photo-gallery');
    const bookingMapContainer = document.querySelector('.booking-map-container');
    
    const ROOM_PHOTO_MAP = {
        '615': [
            {
                src: '../png/615a.png',
                alt: 'Room 615 front view',
                
            },
            {
                src: '../png/615b.png',
                alt: 'Room 615 rear view',
                
            }
        ],
        '609c': [
            {
                src: '../png/609Ca.png',
                alt: 'Room 609C layout',
                
            },
            {
                src: '../png/609Cb.png',
                alt: 'Room 609C side view',
                
            }
        ],
        '309': [
            {
                src: '../png/309a.png',
                alt: 'Room 309 overview',
                
            },
            {
                src: '../png/309b.png',
                alt: 'Room 309 seating view',
                
            }
        ],
        '216': [
            {
                src: '../png/216a.png',
                alt: 'Room 216 overview',
                
            },
            {
                src: '../png/216b.png',
                alt: 'Room 216 lecture view',
                
            }
        ]
    };

    function normalizeRoomLabel(roomLabel) {
        return String(roomLabel || '')
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9]/gi, '')
            .toLowerCase();
    }

    function getRoomLabelForElement(roomElement) {
        if (!roomElement) return '';
        const datasetLabel = String(roomElement.dataset?.roomLabel || '').trim();
        if (datasetLabel) {
            return datasetLabel;
        }
        return String(roomElement.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getRoomPhotosForLabel(roomLabel) {
        const normalized = normalizeRoomLabel(roomLabel);
        return ROOM_PHOTO_MAP[normalized] || [];
    }

    // Define restricted room labels (case-insensitive matching)
    // Note: includes typo "documentaion" as it appears in HTML
    const RESTRICTED_ROOM_LABELS = new Set([
        'clinic',
        'admissions',
        'accounting',
        'finance',
        'faculty area',
        'server room',
        'itro 501',
        'human resource office',
        'documentaion',
        'apc center',
        'technical library',
        'library office',
        'logistics',
        'bmo 1013'
    ].map(label => label.toLowerCase().trim()));
    
    // Create a version without spaces to handle hidden element text extraction
    // (hidden elements with <br> tags don't produce spaces in textContent)
    const RESTRICTED_ROOM_LABELS_NO_SPACES = new Set(
        Array.from(RESTRICTED_ROOM_LABELS).map(label => label.replace(/\s+/g, ''))
    );
    
    console.log('📋 RESTRICTED_ROOM_LABELS contains:', Array.from(RESTRICTED_ROOM_LABELS));
    console.log('📋 RESTRICTED_ROOM_LABELS_NO_SPACES contains:', Array.from(RESTRICTED_ROOM_LABELS_NO_SPACES));
    
    function isRestrictedRoom(roomElement) {
        // For nested rooms, check both nested children
        if (roomElement.classList.contains('nested-room')) {
            const nestedTop = roomElement.querySelector('.nested-top')?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
            const nestedBottom = roomElement.querySelector('.nested-bottom')?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
            const isRestricted = RESTRICTED_ROOM_LABELS.has(nestedTop) || RESTRICTED_ROOM_LABELS.has(nestedBottom);
            console.log(`  Nested room: ${nestedTop} / ${nestedBottom} -> ${isRestricted}`);
            return isRestricted;
        }
        
        const roomLabel = roomElement?.dataset?.roomLabel || roomElement?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const normalized = roomLabel.toLowerCase().trim();
        const normalizedNoSpaces = normalized.replace(/\s+/g, '');
        
        // Check both with spaces (normal case) and without spaces (hidden element case)
        const isRestricted = RESTRICTED_ROOM_LABELS.has(normalized) || RESTRICTED_ROOM_LABELS_NO_SPACES.has(normalizedNoSpaces);
        
        if (isRestricted || roomLabel.includes('Server') || roomLabel.includes('ITRO') || roomLabel.includes('Human') || roomLabel.includes('Apc') || roomLabel.includes('BMO')) {
            console.log(`  Room: "${roomLabel}" -> normalized: "${normalized}" -> no-space: "${normalizedNoSpaces}" -> restricted: ${isRestricted}`);
        }
        return isRestricted;
    }
    
    const bookingRoomElements = initializeBookingMapRooms();
    let latestBookingRooms = [];
    let currentBookingRoomElement = null;
    let currentBookingSlotStatus = 'available';
    let currentMonth = todayRef.getMonth();
    let currentYear = todayRef.getFullYear();

    function getBookingSlotValues() {
        return {
            date: bookingDateField?.value || '',
            start_time: bookingStartTimeField?.value || '',
            end_time: bookingEndTimeField?.value || ''
        };
    }

    function setBookingFormError(message) {
        if (!bookingFormError) return;
        const text = String(message || '').trim();
        bookingFormError.textContent = text;
        bookingFormError.classList.toggle('hidden', !text);
    }

    function clearBookingAttachmentSelection() {
        if (bookingAttachmentFileInput) {
            bookingAttachmentFileInput.value = '';
        }
        if (bookingAttachmentField) {
            bookingAttachmentField.value = '';
        }
        if (bookingAttachmentHint) {
            bookingAttachmentHint.textContent = 'Upload a supporting memo, permit, or image. The filename will be saved with your booking.';
        }
    }

    function syncBookingAttachmentSelection(file) {
        if (bookingAttachmentField) {
            bookingAttachmentField.value = file?.name || '';
        }
        if (bookingAttachmentHint) {
            bookingAttachmentHint.textContent = file
                ? `Selected file: ${file.name}`
                : 'Upload a supporting memo, permit, or image. The filename will be saved with your booking.';
        }
    }

    function initializeBookingMapRooms() {
        const roomTiles = Array.from(document.querySelectorAll('.floor-map-wrapper .room, .floor-map-wrapper .nested-room'));
        console.log('🔍 Found', roomTiles.length, 'room tiles total');
        
        const restrictedRooms = [];
        
        roomTiles.forEach((roomElement, index) => {
            const mapElement = roomElement.closest('.floor-map-wrapper');
            const floorLabel = mapElement?.id ? mapElement.id.replace(/^map-/, '') : 'map';
            if (!roomElement.dataset.roomId) {
                const roomKey = floorLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
                roomElement.dataset.roomId = `rm-${roomKey}-${String(index + 1).padStart(3, '0')}`;
            }

            if (!roomElement.dataset.roomLabel) {
                // For nested rooms, get the combined label
                if (roomElement.classList.contains('nested-room')) {
                    const nestedTop = roomElement.querySelector('.nested-top')?.textContent?.replace(/\s+/g, ' ').trim() || '';
                    const nestedBottom = roomElement.querySelector('.nested-bottom')?.textContent?.replace(/\s+/g, ' ').trim() || '';
                    roomElement.dataset.roomLabel = `${nestedTop} / ${nestedBottom}`;
                } else {
                    roomElement.dataset.roomLabel = roomElement.textContent?.replace(/\s+/g, ' ').trim() || 'Room';
                }
            }
            
            // Check if this is a restricted room and mark it immediately
            const isRestricted = isRestrictedRoom(roomElement);
            if (isRestricted) {
                restrictedRooms.push(roomElement.dataset.roomLabel);
                roomElement.dataset.bookingStatus = 'restricted';
                roomElement.classList.add('restricted');
            } else {
                roomElement.dataset.bookingStatus = 'available';
                roomElement.classList.add('available');
            }

            roomElement.classList.add('booking-room');
            roomElement.setAttribute('role', 'button');
            roomElement.setAttribute('tabindex', '0');
            roomElement.setAttribute('aria-pressed', 'false');
            roomElement.setAttribute('aria-label', `Select ${roomElement.dataset.roomLabel}`);
            
            // Only set cursor pointer for non-restricted rooms
            if (!isRestricted) {
                roomElement.style.cursor = 'pointer';
            }

            // Add event listeners
            roomElement.addEventListener('click', (e) => {
                e.stopPropagation();
                selectBookingRoom(roomElement);
            });

            roomElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectBookingRoom(roomElement);
                }
            });
        });
        
        console.log('✅ Restricted rooms marked:', restrictedRooms);
        return roomTiles;
    }

    function getRoomAvailabilityClass(status) {
        if (status === 'approved') return 'booked';
        if (status === 'pending') return 'pending';
        if (status === 'restricted') return 'restricted';
        return 'available';
    }

    function clearBookingRoomSelection() {
        if (currentBookingRoomElement) {
            currentBookingRoomElement.classList.remove('selected');
            currentBookingRoomElement.setAttribute('aria-pressed', 'false');
        }
        currentBookingRoomElement = null;
        currentBookingSlotStatus = 'available';
        if (bookingRoomSummary) bookingRoomSummary.classList.add('hidden');
        if (bookingRequestBtn) {
            bookingRequestBtn.disabled = true;
        }
    }

    function updateBookingPopup(roomElement, status, roomRecord) {
        if (!bookingRoomSummary || !bookingRoomNameEl || !bookingRoomTypeEl || !bookingRoomStatusEl || !bookingRoomInfoEl) return;

        const roomId = roomElement?.dataset?.roomId || '';
        const roomLabel = getRoomLabelForElement(roomElement) || 'Room';
        bookingRoomNameEl.textContent = roomLabel;
        bookingRoomTypeEl.textContent = roomRecord?.name || roomId || 'Selected room';
        bookingRoomStatusEl.className = status === 'approved' ? 'status-booked' : status === 'pending' ? 'status-pending' : 'status-available';
        bookingRoomStatusEl.textContent = status === 'approved' ? 'Booked' : status === 'pending' ? 'Pending' : 'Available';
        bookingRoomInfoEl.textContent = status === 'approved'
            ? 'This room is unavailable for the selected slot.'
            : status === 'pending'
                ? 'A pending request overlaps this slot, but it can still be requested.'
                : 'This room is available for the selected slot.';

        const roomPhotos = getRoomPhotosForLabel(roomLabel).slice(0, 2);
        if (bookingRoomPhoto && bookingRoomPhotoGallery) {
            if (roomPhotos.length > 0) {
                bookingRoomPhoto.classList.remove('hidden');
                bookingRoomPhotoGallery.innerHTML = roomPhotos.map((photo, index) => `
                    <img src="${photo.src}" alt="${photo.alt || `${roomLabel} photo ${index + 1}`}" class="room-gallery-item">
                `).join('');
            } else {
                bookingRoomPhoto.classList.add('hidden');
                bookingRoomPhotoGallery.innerHTML = '';
            }
        }

        // Hide or show the Cancel Booking button based on status
        const cancelBtn = document.getElementById('btn-cancel-booking');
        if (cancelBtn) {
            if (status === 'pending') {
                cancelBtn.classList.remove('hidden');
            } else {
                cancelBtn.classList.add('hidden');
            }
        }

        bookingRoomSummary.classList.remove('hidden');
    }

    if (bookingRoomPhotoGallery) {
        bookingRoomPhotoGallery.addEventListener('click', (e) => {
            const clickedImage = e.target.closest('.room-gallery-item');
            if (!clickedImage) return;
            openPhotoViewer(clickedImage.src);
        });
    }

    function isBlockingBookingStatus(status) {
        return status === 'approved' || status === 'booked' || status === 'reserved';
    }

    function canRequestBooking(status, slotReady) {
        return Boolean(currentUser && currentUser.role === 'faculty' && slotReady && !isBlockingBookingStatus(status));
    }

    async function refreshBookingAvailability() {
        const slotValues = getBookingSlotValues();
        const isSlotReady = slotValues.date && slotValues.start_time && slotValues.end_time && slotValues.start_time < slotValues.end_time;
        const roomStatusMap = new Map();

        if (bookingAvailabilityNote) {
            bookingAvailabilityNote.textContent = isSlotReady
                ? `Showing availability for ${slotValues.date} ${slotValues.start_time} - ${slotValues.end_time}`
                : 'Choose a valid date and time range to color the map.';
        }

        if (isSlotReady) {
            try {
                const response = await api.listRooms({
                    date: slotValues.date,
                    start_time: slotValues.start_time,
                    end_time: slotValues.end_time
                });

                latestBookingRooms = response.rooms || [];
                latestBookingRooms.forEach((room) => {
                    const slot = room.availableSlots?.[0];
                    roomStatusMap.set(room.id, slot?.status || 'available');
                });
            } catch (error) {
                showNotice(getApiErrorMessage(error, 'Unable to load room availability.'), 'error');
            }
        }

        bookingRoomElements.forEach((roomElement) => {
            const roomId = roomElement.dataset.roomId;
            // Don't override restricted status
            if (isRestrictedRoom(roomElement)) {
                roomElement.dataset.bookingStatus = 'restricted';
            } else {
                const status = isSlotReady ? (roomStatusMap.get(roomId) || 'available') : 'available';
                roomElement.dataset.bookingStatus = status;
            }
            roomElement.classList.remove('available', 'pending', 'booked', 'reserved', 'completed', 'restricted');
            roomElement.classList.add(getRoomAvailabilityClass(roomElement.dataset.bookingStatus));
        });

        if (currentBookingRoomElement) {
            const selectedRoomId = currentBookingRoomElement.dataset.roomId;
            const selectedStatus = isSlotReady ? (roomStatusMap.get(selectedRoomId) || 'available') : 'available';
            currentBookingSlotStatus = selectedStatus;
            updateBookingPopup(currentBookingRoomElement, selectedStatus, latestBookingRooms.find((room) => room.id === selectedRoomId) || null);
            if (canRequestBooking(selectedStatus, isSlotReady)) {
                bookingRequestBtn?.removeAttribute('disabled');
            } else {
                bookingRequestBtn?.setAttribute('disabled', 'disabled');
            }
        }
    }

    async function renderMyBookings() {
        if (!bookingMyBookingsPanel || !bookingMyBookingsList) return;

        if (!currentUser || currentUser.role !== 'faculty') {
            bookingMyBookingsPanel.classList.add('hidden');
            bookingMyBookingsList.innerHTML = '';
            return;
        }

        bookingMyBookingsPanel.classList.remove('hidden');

        try {
            const response = await api.listBookings({ mine: 1 });
            const bookings = response.bookings || [];
            if (bookings.length === 0) {
                bookingMyBookingsList.innerHTML = '<div class="empty-state" style="padding: 1rem; border: none; background: transparent;"><p>No booking requests yet.</p></div>';
                return;
            }

            bookingMyBookingsList.innerHTML = bookings.map((booking) => {
                const canCancel = booking.status === 'pending' || booking.status === 'approved';
                return `
                    <div class="booking-list-item" data-booking-id="${booking.id}">
                        <div>
                            <strong>${booking.roomId}</strong>
                            <div class="text-muted">${formatDateLabel(booking.date)} ${formatTimeLabel(booking.startTime)} - ${formatTimeLabel(booking.endTime)}</div>
                            <div class="text-muted">${booking.purpose || ''}</div>
                            ${booking.equipment ? `<div class="text-muted">Equipment: ${booking.equipment}</div>` : ''}
                            ${booking.attachmentName ? `<div class="text-muted">Attachment: ${booking.attachmentName}</div>` : ''}
                        </div>
                        <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                            <span class="booking-status-tag ${booking.status}">${booking.status}</span>
                            <button class="btn-outline btn-xs btn-cancel-booking" data-booking-id="${booking.id}" ${canCancel ? '' : 'disabled'}>Cancel</button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            bookingMyBookingsList.innerHTML = `<div class="empty-state" style="padding: 1rem; border: none; background: transparent;"><p>${getApiErrorMessage(error, 'Unable to load your bookings.')}</p></div>`;
        }
    }

    async function renderBookingSection() {
        if (bookingDateField && !bookingDateField.value) {
            bookingDateField.min = todayIso;
            bookingDateField.value = todayIso;
        }
        if (bookingStartTimeField && !bookingStartTimeField.value) bookingStartTimeField.value = '08:00';
        if (bookingEndTimeField && !bookingEndTimeField.value) bookingEndTimeField.value = '09:00';

        if (bookingRequestPanel) {
            bookingRequestPanel.classList.toggle('hidden', !currentUser || currentUser.role !== 'faculty');
        }

        if (bookingRoomSummary) {
            bookingRoomSummary?.classList.add('hidden');
        }

        if (bookingRequestBtn) {
            bookingRequestBtn.disabled = !currentUser || currentUser.role !== 'faculty';
        }

        await Promise.all([refreshBookingAvailability(), renderMyBookings()]);
    }

    function isCurrentOrFutureMonth(month, year) {
        const viewMonthStart = new Date(year, month, 1);
        const currentMonthStart = new Date(todayRef.getFullYear(), todayRef.getMonth(), 1);
        return viewMonthStart.getTime() >= currentMonthStart.getTime();
    }

    let calendarTypeFilter = 'all';

    function shouldShowOnDashboard(eventData, diffDays) {
        return diffDays >= 0 || !!eventData?.dashboardVisible;
    }

    function passesCalendarFilter(eventData) {
        return calendarTypeFilter === 'all' || eventData.type === calendarTypeFilter;
    }

    function updateFilterButtonLabel() {
        const filterButton = document.getElementById('btn-filter-events');
        if (!filterButton) return;
        const label = calendarTypeFilter === 'all'
            ? 'Filter'
            : `Filter: ${calendarTypeFilter.charAt(0).toUpperCase() + calendarTypeFilter.slice(1)}`;
        filterButton.innerHTML = `<i class="fas fa-filter mr-2"></i> ${label}`;
    }

    async function renderCalendarV2(eventsByDate = null) {
        if (!calendarDaysContainer || !monthYearDisplay) return;

        const events = eventsByDate || await loadVisibleEvents();

        calendarDaysContainer.innerHTML = '';
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        monthYearDisplay.textContent = `${monthNames[currentMonth]} ${currentYear}`;

        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        // Keep navigation on the current month and later only.
        btnPrevMonth.disabled = currentMonth === todayRef.getMonth() && currentYear === todayRef.getFullYear();
        btnNextMonth.disabled = false;

        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('calendar-day-cube', 'other-month');
            calendarDaysContainer.appendChild(emptyCell);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('calendar-day-cube');
            dayCell.dataset.date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            const dayNumber = document.createElement('div');
            dayNumber.classList.add('day-number');
            dayNumber.textContent = day;
            dayCell.appendChild(dayNumber);

            const dateStr = dayCell.dataset.date;
            const filteredDayEvents = (events[dateStr] || []).filter(ev => passesCalendarFilter(ev));

            if (filteredDayEvents.length > 0) {
                const indicatorContainer = document.createElement('div');
                indicatorContainer.classList.add('cal-event-stack');

                const maxVisible = 2;
                const dayEvents = filteredDayEvents;
                const visibleEvents = dayEvents.slice(0, maxVisible);

                visibleEvents.forEach(ev => {
                    const pill = document.createElement('div');
                    pill.classList.add('cal-event-pill', ev.type);

                    const eventPhotos = eventPhotoCache[ev.id];
                    const hasPhotoBackground = eventPhotos && eventPhotos.length > 0;
                    if (hasPhotoBackground) {
                        pill.classList.add('has-photo-bg');
                        pill.style.backgroundImage = `url('${eventPhotos[0].src}')`;
                        pill.style.backgroundSize = 'cover';
                        pill.style.backgroundPosition = 'center';
                        pill.style.color = '#ffffff';
                        pill.style.border = '1px solid rgba(255,255,255,0.45)';
                        pill.style.textShadow = '0 1px 2px rgba(0,0,0,0.65)';
                    } else if(ev.type === 'required') {
                        pill.style.background = '#fef0ef';
                        pill.style.color = '#e74c3c';
                        pill.style.borderLeft = '2px solid #e74c3c';
                    } else if (ev.type === 'optional') {
                        pill.style.background = '#fbf5e9';
                        pill.style.color = '#8a681c';
                        pill.style.borderLeft = '2px solid #C39D4C';
                    } else if (ev.type === 'personal') {
                        pill.style.background = '#ffffff';
                        pill.style.color = '#333333';
                        pill.style.borderLeft = '2px solid #e5e7eb';
                        pill.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                    }
                    pill.textContent = ev.title;
                    pill.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (dayEvents.length > 1) {
                            const multiModalBody = document.getElementById('multi-modal-body');
                            if(multiModalBody) {
                                multiModalBody.innerHTML = '';
                                dayEvents.forEach(subEv => {
                                    const btn = document.createElement('button');
                                    btn.className = 'btn-outline';
                                    btn.style.width = '100%';
                                    btn.style.textAlign = 'left';
                                    btn.style.marginBottom = '0.5rem';
                                    btn.innerHTML = `<strong>${subEv.title}</strong><br><small><i class="far fa-clock"></i> ${subEv.startTime} - ${subEv.endTime}</small>`;
                                    btn.addEventListener('click', () => {
                                        document.getElementById('multi-event-modal').classList.add('hidden');
                                        showEventDetailsModal(String(subEv.id));
                                    });
                                    multiModalBody.appendChild(btn);
                                });
                                document.getElementById('multi-event-modal').classList.remove('hidden');
                            }
                        } else {
                            showEventDetailsModal(String(ev.id));
                        }
                    });
                    indicatorContainer.appendChild(pill);
                });

                if (dayEvents.length > maxVisible) {
                    const moreBtn = document.createElement('button');
                    moreBtn.type = 'button';
                    moreBtn.className = 'cal-event-more';
                    moreBtn.textContent = `+${dayEvents.length - maxVisible} more`;
                    moreBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const multiModalBody = document.getElementById('multi-modal-body');
                        if (multiModalBody) {
                            multiModalBody.innerHTML = '';
                            dayEvents.forEach(subEv => {
                                const btn = document.createElement('button');
                                btn.className = 'btn-outline';
                                btn.style.width = '100%';
                                btn.style.textAlign = 'left';
                                btn.style.marginBottom = '0.5rem';
                                btn.innerHTML = `<strong>${subEv.title}</strong><br><small><i class="far fa-clock"></i> ${subEv.startTime} - ${subEv.endTime}</small>`;
                                btn.addEventListener('click', () => {
                                    document.getElementById('multi-event-modal').classList.add('hidden');
                                    showEventDetailsModal(String(subEv.id));
                                });
                                multiModalBody.appendChild(btn);
                            });
                            document.getElementById('multi-event-modal').classList.remove('hidden');
                        }
                    });
                    indicatorContainer.appendChild(moreBtn);
                }
                dayCell.appendChild(indicatorContainer);
            }

            dayCell.addEventListener('click', () => {
                document.querySelectorAll('.calendar-day-cube').forEach(c => c.classList.remove('selected'));
                dayCell.classList.add('selected');

                const filteredEvents = (events[dateStr] || []).filter(ev => passesCalendarFilter(ev));
                
                if (filteredEvents.length > 0) {
                    if (filteredEvents.length > 1) {
                        const multiModalBody = document.getElementById('multi-modal-body');
                        if(multiModalBody) {
                            multiModalBody.innerHTML = '';
                            filteredEvents.forEach(subEv => {
                                const btn = document.createElement('button');
                                btn.className = 'btn-outline';
                                btn.style.width = '100%';
                                btn.style.textAlign = 'left';
                                btn.style.marginBottom = '0.5rem';
                                btn.innerHTML = `<strong>${subEv.title}</strong><br><small><i class="far fa-clock"></i> ${subEv.startTime} - ${subEv.endTime}</small>`;
                                btn.addEventListener('click', () => {
                                    document.getElementById('multi-event-modal').classList.add('hidden');
                                    showEventDetailsModal(String(subEv.id));
                                });
                                multiModalBody.appendChild(btn);
                            });
                            document.getElementById('multi-event-modal').classList.remove('hidden');
                        }
                    } else {
                        showEventDetailsModal(String(filteredEvents[0].id));
                    }
                } else {
                    openCalendarModal(dateStr);
                }
            });

            calendarDaysContainer.appendChild(dayCell);
        }
    }

    const eventTypeSelect = document.getElementById('event-type');
    const eventInviteFields = document.getElementById('event-invite-fields');

    if (eventTypeSelect && eventInviteFields) {
        eventTypeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'personal') {
                eventInviteFields.classList.add('hidden');
            } else {
                eventInviteFields.classList.remove('hidden');
            }
        });
    }

    // Visibility scope dropdown handler: show/hide custom user checkboxes
    if (visibleScopeSelect && customUsersDiv) {
        visibleScopeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customUsersDiv.classList.remove('hidden');
            } else {
                customUsersDiv.classList.add('hidden');
                // Clear checkboxes when switching away from custom
                document.querySelectorAll('.event-custom-user-cb').forEach(cb => cb.checked = false);
            }
        });
    }

    function openCalendarModal(date) {
        eventForm.reset();
        const errorMsg = document.getElementById('event-error-msg');

        if (date < todayIso) {
            if (errorMsg) {
                errorMsg.textContent = 'Event date cannot be before today.';
                errorMsg.style.display = 'block';
            }
            showNotice('Event date cannot be before today.', 'error');
            return;
        }

        eventDateField.min = todayIso;
        eventDateField.value = date;
        delete calendarEventModal.dataset.editEventId;
        calendarEventModal.dataset.isEdit = 'false';
        const titleEl = document.getElementById('calendar-modal-title');
        if (titleEl) titleEl.textContent = 'Add Event';

        if (errorMsg) errorMsg.style.display = 'none';

        // Enforce student event type as personal and reset invite fields visibility
        if (eventTypeSelect && eventInviteFields) {
            if (currentUser?.role === 'student') {
                eventTypeSelect.value = 'personal';
                eventTypeSelect.disabled = true;
                eventInviteFields.classList.add('hidden');
            } else if (eventTypeSelect.value === 'personal') {
                eventInviteFields.classList.add('hidden');
            } else {
                eventInviteFields.classList.remove('hidden');
            }
        }

        const locationLabel = document.querySelector('label[for="event-location"]');
        const locationInput = document.getElementById('event-location');
        if (locationInput) {
            locationInput.required = currentUser?.role !== 'student';
        }
        if (locationLabel) {
            locationLabel.innerHTML = currentUser?.role === 'student'
                ? 'Location <span class="text-muted">(optional)</span>'
                : 'Location <span class="text-danger">*</span>';
        }

        // Reset visibility scope to "everyone" and hide custom users
        if (visibleScopeSelect) visibleScopeSelect.value = 'everyone';
        if (customUsersDiv) {
            customUsersDiv.classList.add('hidden');
            document.querySelectorAll('.event-custom-user-cb').forEach(cb => cb.checked = false);
        }

        if (addEventPhotosInput) addEventPhotosInput.value = '';
        if (addEventPhotosInfo) addEventPhotosInfo.textContent = 'No photos selected.';
        if (eventPhotosPreview) eventPhotosPreview.innerHTML = '';
        selectedEventPhotos = [];
        selectedDefaultPhotoKey = null;
        clearDefaultPhotoSelection();

        calendarEventModal.classList.remove('hidden');
        
        // Update room locking based on approved bookings
        updateRoomLockingForBooking();
    }

    if (btnAddCalendarEvent) {
        btnAddCalendarEvent.addEventListener('click', () => {
            const viewedMonthFirst = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
            const defaultDate = viewedMonthFirst < todayIso ? todayIso : viewedMonthFirst;
            openCalendarModal(defaultDate);
        });
    }

    const btnAddCalendarEventDash = document.getElementById('btn-add-calendar-event-dash');
    if (btnAddCalendarEventDash) {
        btnAddCalendarEventDash.addEventListener('click', () => {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            openCalendarModal(todayStr);
        });
    }

    function closeCalendarModalHandler() {
        calendarEventModal.classList.add('hidden');
        calendarEventModal.dataset.isEdit = 'false';
        delete calendarEventModal.dataset.editEventId;
    }

    const addEventPhotosButton = document.getElementById('btn-add-event-photos');
    const addEventPhotosInput = document.getElementById('event-photos');
    const addEventPhotosInfo = document.getElementById('event-photos-info');

    const eventPhotosPreview = document.getElementById('event-photos-preview');
    const eventDefaultPhotosContainer = document.getElementById('event-default-photos');

    function renderSelectedEventPhotoPreview() {
        if (!eventPhotosPreview) return;
        eventPhotosPreview.innerHTML = '';
        selectedEventPhotos.forEach(photo => {
            const img = document.createElement('img');
            img.src = photo.src;
            img.alt = photo.name;
            img.className = 'photo-preview-item';
            eventPhotosPreview.appendChild(img);
        });
    }

    function clearDefaultPhotoSelection() {
        selectedDefaultPhotoKey = null;
        if (!eventDefaultPhotosContainer) return;
        eventDefaultPhotosContainer.querySelectorAll('.default-photo-option').forEach(option => {
            option.classList.remove('selected');
        });
    }

    function setSelectedDefaultPhoto(key) {
        const selectedPhoto = defaultEventPhotos.find(photo => photo.key === key);
        if (!selectedPhoto) return;

        selectedDefaultPhotoKey = key;
        selectedEventPhotos = [{ name: selectedPhoto.name, src: selectedPhoto.src }];
        if (addEventPhotosInput) addEventPhotosInput.value = '';
        if (addEventPhotosInfo) addEventPhotosInfo.textContent = `Default background selected: ${selectedPhoto.name}`;
        renderSelectedEventPhotoPreview();

        if (eventDefaultPhotosContainer) {
            eventDefaultPhotosContainer.querySelectorAll('.default-photo-option').forEach(option => {
                option.classList.toggle('selected', option.dataset.key === key);
            });
        }
    }

    function renderDefaultPhotoOptions() {
        if (!eventDefaultPhotosContainer) return;

        eventDefaultPhotosContainer.innerHTML = defaultEventPhotos.map(photo => {
            return `<button type="button" class="default-photo-option" data-key="${photo.key}" data-name="${photo.name}" style="background-image:url('${photo.src}');"></button>`;
        }).join('');

        eventDefaultPhotosContainer.querySelectorAll('.default-photo-option').forEach(option => {
            option.addEventListener('click', () => {
                const key = option.dataset.key;
                setSelectedDefaultPhoto(key);
            });
        });
    }

    renderDefaultPhotoOptions();

    if (addEventPhotosButton && addEventPhotosInput) {
        addEventPhotosButton.addEventListener('click', () => addEventPhotosInput.click());
        addEventPhotosInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            selectedEventPhotos = [];
            selectedDefaultPhotoKey = null;
            clearDefaultPhotoSelection();

            if (addEventPhotosInfo) {
                addEventPhotosInfo.textContent = files.length
                    ? `${files.length} photo${files.length === 1 ? '' : 's'} selected`
                    : 'No photos selected.';
            }

            if (eventPhotosPreview) {
                eventPhotosPreview.innerHTML = '';
                if (files.length > 0) {
                    files.forEach((file) => {
                        const reader = new FileReader();
                        reader.onload = (loadEvent) => {
                            const dataUrl = loadEvent.target.result;
                            selectedEventPhotos.push({ name: file.name, src: dataUrl });
                            renderSelectedEventPhotoPreview();
                        };
                        reader.readAsDataURL(file);
                    });
                }
            }
        });
    }

    // Helper function to check and update room locking based on approved bookings
    async function updateRoomLockingForBooking() {
        const locationInput = document.getElementById('event-location');
        const dateInput = document.getElementById('event-date');
        const startTimeInput = document.getElementById('event-start-time');
        const endTimeInput = document.getElementById('event-end-time');
        const typeInput = document.getElementById('event-type');
        const bookingStatusMsg = document.getElementById('booking-status-msg') || (() => {
            const div = document.createElement('div');
            div.id = 'booking-status-msg';
            div.style.fontSize = '0.85rem';
            div.style.marginTop = '0.5rem';
            div.style.padding = '0.5rem';
            div.style.borderRadius = '4px';
            locationInput?.parentNode?.appendChild(div);
            return div;
        })();

        if (!locationInput || !dateInput || !startTimeInput || !endTimeInput || !typeInput) return;

        const date = dateInput.value;
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;
        const eventType = typeInput.value;

        // Only lock for non-personal events
        if (eventType === 'personal') {
            locationInput.disabled = false;
            bookingStatusMsg.textContent = '';
            bookingStatusMsg.style.display = 'none';
            return;
        }

        // Clear any previous message
        bookingStatusMsg.textContent = '';

        if (!date || !startTime || !endTime) {
            locationInput.disabled = true;
            locationInput.value = '';
            locationInput.dataset.bookingId = '';
            locationInput.dataset.roomId = '';
            bookingStatusMsg.textContent = '';
            bookingStatusMsg.style.display = 'none';
            return;
        }

        try {
            // Find approved bookings for this user/date/time
            const approvedBookingsResponse = await api.listBookings();
            const approvedBookings = Array.isArray(approvedBookingsResponse)
                ? approvedBookingsResponse
                : (approvedBookingsResponse?.bookings || []);
            const loggedInUser = currentUser; // Use global currentUser
            
            // Filter for this user's approved bookings matching date/time
            const matchingBookings = approvedBookings.filter(booking => {
                const bookingDate = booking.date || booking.booking_date;
                const bookingStart = booking.startTime || booking.start_time;
                const bookingEnd = booking.endTime || booking.end_time;
                const bookingStatus = booking.status;
                const requestedBy = booking.requestedBy || booking.requested_by;
                return (
                    bookingStatus === 'approved' &&
                    requestedBy === (loggedInUser?.id || '') &&
                    bookingDate === date &&
                    bookingStart === startTime &&
                    bookingEnd === endTime &&
                    !booking.event_id && !booking.eventId // No event linked yet
                );
            });

            if (matchingBookings.length > 0) {
                const booking = matchingBookings[0];
                const roomId = booking.roomId || booking.room_id;
                
                locationInput.value = roomId;
                locationInput.disabled = true;
                locationInput.dataset.bookingId = booking.id;
                locationInput.dataset.roomId = roomId;
                
                bookingStatusMsg.textContent = `✓ Locked to approved booking: ${roomId}`;
                bookingStatusMsg.style.color = '#2a7f2e';
                bookingStatusMsg.style.backgroundColor = '#e8f5e9';
                bookingStatusMsg.style.display = 'block';
            } else {
                locationInput.value = '';
                locationInput.disabled = true;
                locationInput.dataset.bookingId = '';
                locationInput.dataset.roomId = '';
                
                bookingStatusMsg.textContent = 'No approved booking found for this date and time. Faculty must have an approved booking to create events.';
                bookingStatusMsg.style.color = '#d32f2f';
                bookingStatusMsg.style.backgroundColor = '#ffebee';
                bookingStatusMsg.style.display = 'block';
            }
        } catch (error) {
            locationInput.disabled = true;
            locationInput.value = '';
            locationInput.dataset.bookingId = '';
            locationInput.dataset.roomId = '';
            
            bookingStatusMsg.textContent = 'Unable to check bookings. Please try again.';
            bookingStatusMsg.style.color = '#d32f2f';
            bookingStatusMsg.style.backgroundColor = '#ffebee';
            bookingStatusMsg.style.display = 'block';
        }
    }

    // Add event listeners for date/time changes to update room locking
    if (eventDateField) {
        eventDateField.addEventListener('change', updateRoomLockingForBooking);
    }
    
    const eventStartTimeInput = document.getElementById('event-start-time');
    const eventEndTimeInput = document.getElementById('event-end-time');
    if (eventStartTimeInput) {
        eventStartTimeInput.addEventListener('change', updateRoomLockingForBooking);
    }
    if (eventEndTimeInput) {
        eventEndTimeInput.addEventListener('change', updateRoomLockingForBooking);
    }

    // Wrap eventTypeSelect change handler for room locking
    if (eventTypeSelect) {
        eventTypeSelect.addEventListener('change', (e) => {
            updateRoomLockingForBooking();
        });
    }

    function updateDashboardCurrentTime() {
        const dashboardTimeEl = document.getElementById('dashboard-current-time');
        const dashboardDateEl = document.getElementById('dashboard-current-date');
        if (!dashboardTimeEl && !dashboardDateEl) return;
        const now = new Date();
        if (dashboardTimeEl) {
            dashboardTimeEl.textContent = `Local time: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        }
        if (dashboardDateEl) {
            dashboardDateEl.textContent = `Local date: ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}`;
        }
    }

    async function renderDashboard(eventsByDate = null) {
        updateDashboardCurrentTime();
        if (currentUser && currentUser.role === 'admin') {
            const bookings = await api.listBookings();
            renderAdminDashboard(bookings);
            return;
        }

        const adminDashboard = document.getElementById('admin-dashboard-container');
        const studentDashboard = document.getElementById('student-dashboard-content');
        if (adminDashboard) adminDashboard.classList.add('hidden');
        if (studentDashboard) studentDashboard.classList.remove('hidden');

        const events = eventsByDate || await loadVisibleEvents();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let upcomingCount = 0;
        let requiredCount = 0;
        let optionalCount = 0;

        let requiredHtml = '';
        let optionalHtml = '';
        let personalHtml = '';
        let myScheduleHtml = '';

        Object.keys(events).forEach(dateStr => {
            // Fix UTC offset issue by manually parsing the date string "YYYY-MM-DD"
            const [year, month, day] = dateStr.split('-');
            const eventDate = new Date(year, month - 1, day);
            eventDate.setHours(0, 0, 0, 0);
            
            const diffTime = eventDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Show current/future events plus seeded dashboard-visible placeholders.
            if (events[dateStr].some(ev => shouldShowOnDashboard(ev, diffDays))) {
                events[dateStr].forEach(ev => {
                    const eventDateFormatted = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                    if (diffDays <= 7 || ev.dashboardVisible) upcomingCount++;

                    const eventKey = String(ev.id);
                    
                    // Check if event has photos and add background image styling
                    const eventPhotos = eventPhotoCache[ev.id];
                    const hasPhotoBackground = eventPhotos && eventPhotos.length > 0;
                    const backgroundStyle = hasPhotoBackground ? `background-image: url('${eventPhotos[0].src}'); background-size: cover; background-position: center;` : '';
                    const backgroundClass = hasPhotoBackground ? 'has-photo-bg' : '';
                    const dataAttr = ev.type === 'personal' ? `data-schedule-link="${eventKey}"` : `data-event-details-link="${eventKey}"`;
                    
                    let eventItemHtml = `
                        <div class="schedule-item ${ev.type} ${backgroundClass} mb-2" ${dataAttr} style="${backgroundStyle}cursor:pointer;">
                            <strong>${ev.title}</strong>
                            <small><i class="far fa-clock"></i> ${eventDateFormatted}, ${ev.startTime} - ${ev.endTime} | <i class="fas fa-map-marker-alt"></i> ${ev.location}</small>
                        </div>`;

                    let typeBg = ev.type === 'required' ? '#fef0ef' : ev.type === 'optional' ? '#fbf5e9' : '#ffffff';
                    let typeColor = ev.type === 'required' ? '#e74c3c' : ev.type === 'optional' ? '#8a681c' : '#333333';
                    
                    eventDetailsData[eventKey] = {
                        id: ev.id,
                        title: ev.title,
                        time: `${eventDateFormatted}, ${ev.startTime} - ${ev.endTime}`,
                        location: ev.location,
                        description: ev.notes || "No details provided.",
                        type: ev.type || 'optional',
                        createdBy: ev.createdBy || ev.created_by || null,
                        dashboardVisible: !!ev.dashboardVisible,
                        visibleTo: ev.visibleTo || '',
                        visibility: ev.visibility || '',
                        visibleToList: Array.isArray(ev.visibleTo) ? ev.visibleTo : (typeof ev.visibleTo === 'string' ? [ev.visibleTo] : []),
                        date: dateStr,
                        startTime: ev.startTime || ev.start_time,
                        endTime: ev.endTime || ev.end_time,
                        photos: eventPhotoCache[ev.id] || []
                    };

                    if (ev.type === 'required') {
                        requiredCount++;
                        requiredHtml += eventItemHtml;
                    } else if (ev.type === 'optional') {
                        optionalCount++;
                        optionalHtml += eventItemHtml;
                    } else if (ev.type === 'personal') {
                        personalHtml += eventItemHtml;
                        
                        myScheduleHtml += `
                            <div class="schedule-event-pill outline" data-event-id="${eventKey}" style="margin-bottom: 0.5rem; display: block; width: 100%;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                                    <strong>${ev.title}</strong>
                                    <span style="font-size:0.75rem; padding:2px 6px; border-radius:4px; background:${typeBg}; color:${typeColor}; text-transform:capitalize;">${ev.type}</span>
                                </div>
                                <p style="font-size:0.875rem; color:var(--text-secondary); margin:0; margin-bottom: 0.25rem;"><i class="far fa-clock"></i> ${eventDateFormatted}, ${ev.startTime} - ${ev.endTime}</p>
                                <p style="font-size:0.875rem; color:var(--text-secondary); margin:0;"><i class="fas fa-map-marker-alt"></i> ${ev.location}</p>
                            </div>`;
                    }
                });
            }
        });

        // 1. Update Badge Numbers
        const statUpcoming = document.getElementById('stat-upcoming');
        const statRequired = document.getElementById('stat-required');
        const statOptional = document.getElementById('stat-optional');
        
        if (statUpcoming) statUpcoming.textContent = upcomingCount;
        if (statRequired) statRequired.textContent = requiredCount;
        if (statOptional) statOptional.textContent = optionalCount;

        // 2. Update Content Panels
        const alertBox = document.getElementById('dashboard-alerts');
        if (alertBox) {
            const headerHtml = `<div class="alert-header"><i class="fas fa-exclamation-circle"></i> Required Events</div>`;
            if (requiredHtml) {
                alertBox.innerHTML = headerHtml + requiredHtml;
            } else {
                alertBox.innerHTML = headerHtml + `<div class="empty-state" style="padding: 1rem; border: none; background: transparent;"><p>No required events upcoming.</p></div>`;
            }
        }

        const optionalBox = document.getElementById('dashboard-optional-events');
        if (optionalBox) {
            if (optionalHtml) {
                optionalBox.classList.remove('empty-state');
                optionalBox.style.padding = '0';
                optionalBox.style.border = 'none';
                optionalBox.style.background = 'transparent';
                optionalBox.innerHTML = `<div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">${optionalHtml}</div>`;
            } else {
                optionalBox.classList.add('empty-state');
                optionalBox.style.padding = '3rem 2rem';
                optionalBox.style.border = '2px dashed var(--border-color)';
                optionalBox.style.background = 'var(--bg-main)';
                optionalBox.innerHTML = `<div><i class="far fa-calendar-times mb-2" style="font-size: 2rem;"></i><p>No optional events available.</p></div>`;
            }
        }

        const personalBox = document.getElementById('dashboard-personal-schedule');
        if (personalBox) {
            if (personalHtml) {
                personalBox.innerHTML = `<div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">${personalHtml}</div>`;
            } else {
                personalBox.innerHTML = `<div class="empty-state" style="padding: 2rem; border: none; background: transparent;"><p>Your schedule is clear.</p></div>`;
            }
        }

        const scheduleListPane = document.getElementById('schedule-list-pane');
        if (scheduleListPane) {
            if (myScheduleHtml) {
                scheduleListPane.innerHTML = `<div style="max-height: 500px; overflow-y: auto; padding-right: 15px;">${myScheduleHtml}</div>`;
                
                const dynamicPills = scheduleListPane.querySelectorAll('.schedule-event-pill');
                dynamicPills.forEach(pill => {
                    pill.addEventListener('click', () => {
                        dynamicPills.forEach(p => {
                            p.classList.remove('blue');
                            p.classList.add('outline');
                            p.style.boxShadow = "none";
                            p.style.color = "var(--text-primary)";
                        });
                        pill.classList.remove('outline');
                        pill.classList.add('blue');
                        pill.style.boxShadow = "var(--shadow-md)";
                        pill.style.color = "var(--white)";
                        renderScheduleDetails(pill.dataset.eventId);
                    });
                });
            } else {
                scheduleListPane.innerHTML = `<div class="empty-state" style="padding: 2rem; border: none; background: transparent; text-align: center;"><p>No scheduled events found.</p></div>`;
            }
        }

        const dashboardLinks = document.querySelectorAll('[data-schedule-link]');
        dashboardLinks.forEach(link => {
            link.addEventListener('click', () => {
                const tempId = link.dataset.scheduleLink;
                const navItem = document.querySelector('.nav-item[data-target="my-schedule"]');
                if (navItem) navItem.click(); // Switch to the view
                setTimeout(() => {
                    const matchingPill = document.querySelector(`.schedule-event-pill[data-event-id="${tempId}"]`);
                    if (matchingPill) {
                        matchingPill.click();
                        matchingPill.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 50);
            });
        });

        const eventDetailsLinks = document.querySelectorAll('[data-event-details-link]');
        eventDetailsLinks.forEach(link => {
            link.addEventListener('click', () => {
                showEventDetailsModal(link.dataset.eventDetailsLink);
            });
        });
    }

    function showEventDetailsModal(eventId) {
        const data = eventDetailsData[eventId];
        if (!data) return;
        const modalBody = document.getElementById('details-modal-body');
        if(modalBody){
            modalBody.innerHTML = `
                <div style="text-align: left; width: 100%;">
                    <h2 style="color: var(--navy-blue); margin-bottom: 1rem;">${data.title}</h2>
                    <div style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary);">
                        <i class="far fa-clock" style="color: var(--gold); width: 20px;"></i>
                        <span>${data.time}</span>
                    </div>
                    <div style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary);">
                        <i class="fas fa-map-marker-alt" style="color: var(--gold); width: 20px;"></i>
                        <span>${data.location}</span>
                    </div>
                    <hr style="border: 0; border-top: 1px solid var(--border-color); margin-bottom: 1.5rem;">
                    <div>
                        <h4 style="margin-bottom: 0.5rem; color: var(--text-primary);">Event Details</h4>
                        <p style="color: var(--text-secondary); line-height: 1.6;">${data.description}</p>
                    </div>
                    ${data.photos && data.photos.length ? `
                        <div style="margin-top: 1.5rem;">
                            <h4 style="margin-bottom: 0.75rem; color: var(--text-primary);">Photos</h4>
                            <div class="photo-preview-grid">
                                ${data.photos.map(photo => `<img src="${photo.src}" alt="${photo.name}" class="photo-preview-item">`).join('')}
                            </div>
                        </div>
                    ` : ''}
                    <div style="margin-top: 2rem; display: flex; gap: 0.5rem;">
                        <button class="btn-blue btn-sm" id="btn-edit-event-details" data-event-id="${eventId}">Edit</button>
                        <button class="btn-outline btn-sm" id="btn-delete-event-details" data-event-id="${eventId}">Delete</button>
                    </div>
                </div>
            `;
            document.getElementById('event-details-modal').classList.remove('hidden');
        }
    }

    const closeDetailsModalBtn = document.getElementById('close-details-modal');
    if(closeDetailsModalBtn) closeDetailsModalBtn.addEventListener('click', () => {
        document.getElementById('event-details-modal').classList.add('hidden');
    });

    function openEditEventModal(eventId) {
        const data = eventDetailsData[eventId];
        if (!data) return;

        const titleInput = document.getElementById('event-title');
        const dateInput = document.getElementById('event-date');
        const typeInput = document.getElementById('event-type');
        const startTimeInput = document.getElementById('event-start-time');
        const endTimeInput = document.getElementById('event-end-time');
        const locationInput = document.getElementById('event-location');
        const notesInput = document.getElementById('event-notes');

        if (titleInput) titleInput.value = data.title || '';
        if (dateInput) {
            dateInput.min = todayIso;
            dateInput.value = data.date || '';
        }
        if (typeInput) typeInput.value = data.type || 'optional';
        if (startTimeInput) startTimeInput.value = data.startTime || '';
        if (endTimeInput) endTimeInput.value = data.endTime || '';
        if (locationInput) locationInput.value = data.location || '';
        if (notesInput) notesInput.value = data.description || '';

        // Set visibility scope
        if (visibleScopeSelect) {
            visibleScopeSelect.value = data.visibility || 'everyone';
        }
        // Populate custom users if visibility is custom
        if (data.visibility === 'custom' && data.visibleToList) {
            document.querySelectorAll('.event-custom-user-cb').forEach(cb => {
                cb.checked = data.visibleToList.includes(cb.dataset.userId);
            });
        } else {
            document.querySelectorAll('.event-custom-user-cb').forEach(cb => cb.checked = false);
        }
        // Show/hide custom users section
        if (customUsersDiv) {
            customUsersDiv.classList.toggle('hidden', data.visibility !== 'custom');
        }

        const titleEl = document.getElementById('calendar-modal-title');
        if (titleEl) titleEl.textContent = 'Edit Event';

        if (eventTypeSelect && eventInviteFields) {
            if ((data.type || 'optional') === 'personal') {
                eventInviteFields.classList.add('hidden');
            } else {
                eventInviteFields.classList.remove('hidden');
            }
        }

        // If event is linked to a booking, lock date/time/room fields
        if (data.bookingId) {
            const bookingStatusMsg = document.getElementById('booking-status-msg');
            if (!bookingStatusMsg && locationInput) {
                const div = document.createElement('div');
                div.id = 'booking-status-msg';
                div.style.fontSize = '0.85rem';
                div.style.marginTop = '0.5rem';
                div.style.padding = '0.5rem';
                div.style.borderRadius = '4px';
                div.style.color = '#1976d2';
                div.style.backgroundColor = '#e3f2fd';
                div.textContent = '🔒 Linked to booking — date, time, and room are locked. Only title, notes, and visibility can be edited.';
                locationInput.parentNode.appendChild(div);
            } else if (bookingStatusMsg && data.bookingId) {
                bookingStatusMsg.style.display = 'block';
                bookingStatusMsg.textContent = '🔒 Linked to booking — date, time, and room are locked. Only title, notes, and visibility can be edited.';
                bookingStatusMsg.style.color = '#1976d2';
                bookingStatusMsg.style.backgroundColor = '#e3f2fd';
            }
            
            // Disable date/time/room fields
            if (dateInput) dateInput.disabled = true;
            if (startTimeInput) startTimeInput.disabled = true;
            if (endTimeInput) endTimeInput.disabled = true;
            if (locationInput) locationInput.disabled = true;
        } else {
            // Enable fields if not linked
            if (dateInput) dateInput.disabled = false;
            if (startTimeInput) startTimeInput.disabled = false;
            if (endTimeInput) endTimeInput.disabled = false;
            if (locationInput) locationInput.disabled = false;
            
            // Remove booking message
            const bookingStatusMsg = document.getElementById('booking-status-msg');
            if (bookingStatusMsg) bookingStatusMsg.style.display = 'none';
        }

        calendarEventModal.dataset.editEventId = eventId;
        calendarEventModal.dataset.isEdit = 'true';
        calendarEventModal.classList.remove('hidden');
    }

    // Event handlers for edit/delete buttons in event details modal
    document.addEventListener('click', async (e) => {
        if (e.target?.id === 'btn-edit-event-details') {
            const eventId = e.target.dataset.eventId;
            document.getElementById('event-details-modal').classList.add('hidden');
            openEditEventModal(eventId);
        }
        
        if (e.target?.id === 'btn-delete-event-details') {
            const eventId = e.target.dataset.eventId;
            const data = eventDetailsData[eventId];
            if (data && await showConfirm(`Delete event "${data.title}"?`)) {
                try {
                    await api.deleteEvent(data.id);
                    document.getElementById('event-details-modal').classList.add('hidden');
                    await refreshViews();
                    showNotice('Event deleted.', 'success');
                    addAppNotification('event.deleted', `Event deleted: ${data.title} ${data.time || ''}`, { eventId: data.id });
                } catch (error) {
                    showNotice(getApiErrorMessage(error, 'Unable to delete event.'), 'error');
                }
            }
        }

        if (e.target?.id === 'btn-edit-schedule-event') {
            const eventId = e.target.dataset.eventId;
            openEditEventModal(eventId);
        }

        if (e.target?.id === 'btn-delete-schedule-event') {
            const eventId = e.target.dataset.eventId;
            const data = eventDetailsData[eventId];
            if (data && await showConfirm(`Delete event "${data.title}"?`)) {
                try {
                    await api.deleteEvent(data.id);
                    renderScheduleDetailsPlaceholder();
                    await refreshViews();
                    showNotice('Event deleted.', 'success');
                    addAppNotification('event.deleted', `Event deleted: ${data.title}`, { eventId: data.id });
                } catch (error) {
                    showNotice(getApiErrorMessage(error, 'Unable to delete event.'), 'error');
                }
            }
        }
    });

    const closeMultiModalBtn = document.getElementById('close-multi-modal');
    if(closeMultiModalBtn) closeMultiModalBtn.addEventListener('click', () => {
        document.getElementById('multi-event-modal').classList.add('hidden');
    });

    document.getElementById('event-details-modal')?.addEventListener('click', (e) => {
        if(e.target.id === 'event-details-modal') e.target.classList.add('hidden');
    });
    document.getElementById('multi-event-modal')?.addEventListener('click', (e) => {
        if(e.target.id === 'multi-event-modal') e.target.classList.add('hidden');
    });
    document.getElementById('photo-viewer-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'photo-viewer-modal') closePhotoViewerModal();
    });

    async function saveEventHandler(e) {
        e.preventDefault();
        
        const titleInput = document.getElementById('event-title');
        const dateInput = document.getElementById('event-date');
        const typeInput = document.getElementById('event-type');
        const startTimeInput = document.getElementById('event-start-time');
        const endTimeInput = document.getElementById('event-end-time');
        const locationInput = document.getElementById('event-location');
        const notesInput = document.getElementById('event-notes');
        const errorMsg = document.getElementById('event-error-msg');

        let isValid = true;
        const locationMissing = !locationInput.value.trim() && currentUser?.role !== 'student';
        if (!titleInput.value.trim() || !dateInput.value || !typeInput.value || !startTimeInput.value || !endTimeInput.value || locationMissing || !notesInput.value.trim()) {
            isValid = false;
        }

        if (!isValid) {
            if (errorMsg) errorMsg.style.display = 'block';
            return;
        }

        if (dateInput.value < todayIso) {
            if (errorMsg) {
                errorMsg.textContent = 'Event date cannot be before today.';
                errorMsg.style.display = 'block';
            }
            showNotice('Event date cannot be before today.', 'error');
            return;
        }
        
        if (errorMsg) {
            errorMsg.textContent = 'Please answer all required fields.';
            errorMsg.style.display = 'none';
        }

        const title = titleInput.value;
        const date = dateInput.value;
        // Get custom user list from checkboxes
        const customUserList = Array.from(document.querySelectorAll('.event-custom-user-cb:checked')).map(cb => cb.dataset.userId);
        const visibleScope = visibleScopeSelect ? visibleScopeSelect.value : 'everyone';
        const eventType = currentUser?.role === 'student' ? 'personal' : typeInput.value;
        const visibilityPayload = parseVisibilityPayload(eventType, visibleScope, customUserList);
        
        // Get bookingId from either the form data attribute or from existing event data
        const isEdit = calendarEventModal?.dataset.isEdit === 'true';
        const eventId = calendarEventModal?.dataset.editEventId;
        let bookingId = locationInput.dataset.bookingId || eventDetailsData[eventId || '']?.bookingId || null;
        
        // For non-personal events created by faculty, bookingId is required
        if (typeInput.value !== 'personal' && !isEdit && currentUser?.role === 'faculty' && !bookingId) {
            if (errorMsg) {
                errorMsg.textContent = 'Faculty can only create shared events from approved bookings. No booking found for this date/time.';
                errorMsg.style.display = 'block';
            }
            showNotice('No approved booking found. Faculty must have an approved booking to create events.', 'error');
            return;
        }

        const newEvent = {
            title: title,
            type: eventType,
            startTime: startTimeInput.value,
            endTime: endTimeInput.value,
            location: locationInput.value,
            description: notesInput.value,
            notes: notesInput.value,
            visibility: visibilityPayload.visibility,
            visibleTo: visibilityPayload.visibleTo,
            bookingId: bookingId
        };

        try {
            const btnSave = document.getElementById('btn-save-calendar-event');
            if (btnSave) { btnSave.disabled = true; btnSave.dataset.prev = btnSave.innerHTML; btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...'; }
            let createdOrUpdated = null;
            if (isEdit && eventId) {
                createdOrUpdated = await api.updateEvent(eventId, { ...newEvent, date });
            } else {
                createdOrUpdated = await api.createEvent({ ...newEvent, date });
            }

            const ev = (createdOrUpdated && (createdOrUpdated.event || createdOrUpdated)) || null;
            if (ev) {
                if (selectedEventPhotos.length > 0) {
                    eventPhotoCache[ev.id] = selectedEventPhotos;
                } else if (isEdit && eventId && eventPhotoCache[eventId]) {
                    eventPhotoCache[ev.id] = eventPhotoCache[eventId];
                }

                savePhotoCache();

                eventDetailsData[ev.id] = {
                    ...(eventDetailsData[ev.id] || {}),
                    photos: eventPhotoCache[ev.id] || []
                };

                addAppNotification(isEdit ? 'event.updated' : 'event.created', `${isEdit ? 'Event updated' : 'Event created'}: ${ev.title} (${formatDateLabel(ev.date)} ${formatTimeLabel(ev.startTime)} - ${formatTimeLabel(ev.endTime)})`, { eventId: ev.id });
            }

            await refreshViews();
            closeCalendarModalHandler();
            calendarEventModal.dataset.isEdit = 'false';
            delete calendarEventModal.dataset.editEventId;
            if (btnSave) { btnSave.disabled = false; if (btnSave.dataset.prev) btnSave.innerHTML = btnSave.dataset.prev; }
        } catch (error) {
            if (errorMsg) {
                errorMsg.textContent = getApiErrorMessage(error, 'Unable to save event.');
                errorMsg.style.display = 'block';
            }
            showNotice(getApiErrorMessage(error, 'Unable to save event.'), 'error');
            const btnSave = document.getElementById('btn-save-calendar-event'); if (btnSave) { btnSave.disabled = false; if (btnSave.dataset && btnSave.dataset.prev) btnSave.innerHTML = btnSave.dataset.prev; }
        }
    }

    // --- Role enforcement wrappers and Admin Approvals UI ---
    // Force student modal behavior when opening calendar modal
    const _openCalendarModal = openCalendarModal;
    openCalendarModal = function(date) {
        if (currentUser?.role === 'student') {
            if (eventTypeSelect) {
                eventTypeSelect.value = 'personal';
                eventTypeSelect.disabled = true;
            }
            if (eventInviteFields) eventInviteFields.classList.add('hidden');
        } else {
            if (eventTypeSelect) eventTypeSelect.disabled = false;
            if (eventInviteFields) eventInviteFields.classList.remove('hidden');
        }
        return _openCalendarModal.call(this, date);
    };

    // Prevent editing/deleting events without ownership or by admin on personal events
    const _openEditEventModal = openEditEventModal;
    openEditEventModal = function(eventId) {
        const ev = eventDetailsData[eventId];
        if (!ev) return;
        if (!currentUser) { showNotice('Not logged in', 'error'); return; }
        // Admin should not view/edit personal events
        if (ev.type === 'personal' && currentUser.role === 'admin') {
            showNotice('Admins cannot view or edit personal events.', 'error');
            return;
        }
        // Only creator can edit/delete
        if (ev.createdBy && currentUser.id !== ev.createdBy) {
            showNotice('You can only edit events you created.', 'error');
            return;
        }
        return _openEditEventModal.call(this, eventId);
    };

    // Intercept edit/delete click actions across UI
    document.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('[data-action="edit-event"]') || (e.target.id === 'btn-edit-event-details' ? e.target : null);
        const deleteBtn = e.target.closest('[data-action="delete-event"]') || (e.target.id === 'btn-delete-event-details' ? e.target : null) || (e.target.id === 'btn-delete-schedule-event' ? e.target : null);

        if (editBtn) {
            const eventId = editBtn.getAttribute('data-event-id') || editBtn.dataset.eventId;
            const ev = eventDetailsData[eventId];
            if (!ev) return;
            if (!currentUser) { showNotice('Not logged in', 'error'); return; }
            if (ev.type === 'personal' && currentUser.role === 'admin') { showNotice('Admins cannot edit personal events', 'error'); return; }
            if (ev.createdBy && currentUser.id !== ev.createdBy) { showNotice('You can only edit events you created', 'error'); return; }
            openEditEventModal(eventId);
        }

        if (deleteBtn) {
            const eventId = deleteBtn.getAttribute('data-event-id') || deleteBtn.dataset.eventId;
            const ev = eventDetailsData[eventId];
            if (!ev) return;
            if (!currentUser) { showNotice('Not logged in', 'error'); return; }
            if (ev.type === 'personal' && currentUser.role === 'admin') { showNotice('Admins cannot delete personal events', 'error'); return; }
            if (ev.createdBy && currentUser.id !== ev.createdBy) { showNotice('You can only delete events you created', 'error'); return; }
            if (await showConfirm(`Delete event "${ev.title}"?`)) {
                try {
                    await api.deleteEvent(ev.id);
                    renderScheduleDetailsPlaceholder();
                    showNotice('Event deleted.', 'success');
                    await refreshViews();
                } catch (err) {
                    showNotice(getApiErrorMessage(err), 'error');
                }
            }
        }
    });

    // Ensure students cannot save non-personal events (UI-level enforcement)
    const _saveEventHandler = saveEventHandler;
    saveEventHandler = async function(e) {
        if (currentUser?.role === 'student') {
            const typeInput = document.getElementById('event-type');
            if (typeInput) typeInput.value = 'personal';
        }
        return _saveEventHandler.call(this, e);
    };

    // Booking Details Modal helper (used by admin approvals)
    function showBookingDetailsModal(bk) {
        const modal = document.getElementById('booking-details-modal');
        const body = document.getElementById('booking-details-modal-body');
        const commentBox = document.getElementById('booking-admin-comment');
        if (!modal || !body) return;

        const attachmentHtml = bk.attachmentName ? `<div><strong>Attachment:</strong> ${bk.attachmentName}</div>` : '';
        const requestedByEmail = bk.requestedByEmail || bk.requested_by_email || '';
        const createdAt = bk.createdAt || bk.created_at || '';

        body.innerHTML = `
            <div style="margin-bottom:1rem;">
                <div><strong>Booking ID:</strong> ${bk.id || ''}</div>
                <div><strong>Room:</strong> ${bk.roomId || bk.room_id || ''}</div>
                <div><strong>Date:</strong> ${formatDateLabel(bk.date)}</div>
                <div><strong>Time:</strong> ${formatTimeLabel(bk.startTime || bk.start_time)} - ${formatTimeLabel(bk.endTime || bk.end_time)}</div>
                <div><strong>Requested By:</strong> ${bk.requestedBy || bk.requested_by || ''} ${requestedByEmail ? `(${requestedByEmail})` : ''}</div>
                <div><strong>Purpose:</strong> ${bk.purpose || ''}</div>
                ${attachmentHtml}
                <div><strong>Requested At:</strong> ${formatTimestamp(createdAt)}</div>
                <div><strong>Status:</strong> ${String(bk.status || '')}</div>
            </div>
        `;
        if (commentBox) commentBox.value = bk.decisionNote || bk.decision_note || '';
        modal.classList.remove('hidden');
        modal.dataset.bookingId = bk.id;
    }

    // Formatting helpers
    function formatTimeLabel(timeStr) {
        if (!timeStr) return '';
        // Expecting HH:MM (24-hour)
        const parts = String(timeStr).split(':');
        if (parts.length < 2) return timeStr;
        let hh = parseInt(parts[0], 10);
        const mm = parts[1];
        if (Number.isNaN(hh)) return timeStr;
        const suffix = hh >= 12 ? 'PM' : 'AM';
        const hour12 = ((hh + 11) % 12) + 1; // convert 0->12
        return `${hour12}:${mm} ${suffix}`;
    }

    function formatDateLabel(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr + 'T00:00:00');
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    }

    function formatTimestamp(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch (e) {
            return iso;
        }
    }

    function renderBookingVolumeChart(bookings, container) {
        if (!container) return;
        // Render a simple numeric summary instead of a graphical chart
        const statusTotals = bookings.reduce((counts, booking) => {
            const status = String(booking.status || 'unknown').toLowerCase();
            counts[status] = (counts[status] || 0) + 1;
            return counts;
        }, {});

        const requestsByRoom = bookings.reduce((acc, booking) => {
            const room = booking.roomId || booking.room_id || 'Unknown';
            acc[room] = (acc[room] || 0) + 1;
            return acc;
        }, {});

        const statusHtml = Object.entries(statusTotals).map(([status, count]) => {
            return `<div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px dashed rgba(0,0,0,0.04);"><strong style="text-transform:capitalize;">${status}</strong><span>${count}</span></div>`;
        }).join('');

        const topRooms = Object.entries(requestsByRoom)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([room, count]) => `<div style="display:flex; justify-content:space-between; padding:0.25rem 0;"><span>${room}</span><strong>${count}</strong></div>`)
            .join('') || '<div class="text-muted">No room data</div>';

        container.innerHTML = `
            <div style="margin-bottom:0.75rem; color: var(--text-secondary);">Numeric summary (demo mode does not affect actual bookings).</div>
            <div style="display:flex; gap:1rem;">
                <div style="flex:1; background:var(--bg-main); padding:0.75rem; border-radius:6px;">
                    <h5 style="margin:0 0 0.5rem 0;">By Status</h5>
                    ${statusHtml}
                </div>
                <div style="width:220px; background:var(--bg-main); padding:0.75rem; border-radius:6px;">
                    <h5 style="margin:0 0 0.5rem 0;">Top Rooms</h5>
                    ${topRooms}
                </div>
            </div>
        `;
    }

    // Time-series SVG chart removed; using numeric summaries for stability.

    async function renderAdminDashboard(bookings = []) {
        const adminDashboard = document.getElementById('admin-dashboard-container');
        const studentDashboard = document.getElementById('student-dashboard-content');
        if (!adminDashboard || !studentDashboard) return;

        adminDashboard.classList.remove('hidden');
        studentDashboard.classList.add('hidden');

        const statsRow = document.getElementById('admin-stats-row');
        const historyContainer = document.getElementById('admin-request-history');
        const eventHistoryContainer = document.getElementById('admin-event-history');
        const statsContainer = document.getElementById('admin-booking-stats');
        if (!statsRow || !historyContainer || !eventHistoryContainer || !statsContainer) return;

        const activeBookings = Array.isArray(bookings) ? bookings : (bookings?.bookings || []);
        const total = activeBookings.length;

        const pending = activeBookings.filter(b => String(b.status).toLowerCase() === 'pending').length;
        const approved = activeBookings.filter(b => String(b.status).toLowerCase() === 'approved').length;
        const rejected = activeBookings.filter(b => String(b.status).toLowerCase() === 'rejected').length;
        const cancelled = activeBookings.filter(b => String(b.status).toLowerCase() === 'cancelled').length;
        const requestsByRoom = activeBookings.reduce((acc, booking) => {
            const room = booking.roomId || booking.room_id || 'Unknown';
            acc[room] = (acc[room] || 0) + 1;
            return acc;
        }, {});
        const topRooms = Object.entries(requestsByRoom)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([room, count]) => `<div style="margin-bottom:0.5rem;"><strong>${room}</strong> &mdash; ${count} requests</div>`)
            .join('');

        const decisionTimes = activeBookings
            .map(b => {
                const created = new Date(b.createdAt || b.created_at || 0);
                const decided = new Date(b.updatedAt || b.updated_at || b.decisionAt || b.decision_at || 0);
                if (isNaN(created) || isNaN(decided) || decided <= created) return null;
                return (decided - created) / 60000;
            })
            .filter(value => value !== null);
        const avgDecision = decisionTimes.length ? `${(decisionTimes.reduce((sum, value) => sum + value, 0) / decisionTimes.length).toFixed(1)} min` : '0 min';

        statsRow.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-icon blue-icon"><i class="fas fa-list"></i></div>
                <h4>Total Requests</h4>
                <h2>${total}</h2>
                <p>All room booking submissions</p>
            </div>
            <div class="stat-card gold">
                <div class="stat-card-icon gold-icon"><i class="fas fa-hourglass-half"></i></div>
                <h4>Pending</h4>
                <h2>${pending}</h2>
                <p>Awaiting admin review</p>
            </div>
            <div class="stat-card green">
                <div class="stat-card-icon green-icon"><i class="fas fa-check-circle"></i></div>
                <h4>Approved</h4>
                <h2>${approved}</h2>
                <p>Confirmed reservations</p>
            </div>
            <div class="stat-card red">
                <div class="stat-card-icon red-icon"><i class="fas fa-times-circle"></i></div>
                <h4>Rejected</h4>
                <h2>${rejected}</h2>
                <p>Declined requests</p>
            </div>
        `;

        const recentRequests = activeBookings
            .slice()
            .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
            .slice(0, 8);

        historyContainer.innerHTML = recentRequests.length ? recentRequests.map(booking => {
            return `
                <div class="card" style="margin-bottom:1rem; padding:1rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
                        <strong>${booking.roomId || booking.room_id || 'Room'}</strong>
                        <span style="font-size:0.9rem; color:var(--text-secondary);">${formatDateLabel(booking.date)} ${formatTimeLabel(booking.startTime || booking.start_time)} - ${formatTimeLabel(booking.endTime || booking.end_time)}</span>
                    </div>
                    <div style="margin-top:0.75rem; color:var(--text-secondary);">
                        <div><strong>Status:</strong> ${String(booking.status || '').toUpperCase()}</div>
                        <div><strong>Requested by:</strong> ${booking.requestedBy || booking.requested_by || 'Unknown'}</div>
                        <div><strong>Purpose:</strong> ${booking.purpose || ''}</div>
                        ${booking.equipment ? `<div><strong>Equipment:</strong> ${booking.equipment}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('') : '<div class="empty-state" style="padding:1rem;"><p>No reservation history available.</p></div>';

        const eventsResponse = await api.listEvents();
        const adminEvents = (eventsResponse?.events || []).slice();
        const recentEvents = adminEvents
            .sort((a, b) => {
                const leftDate = new Date(`${a.date}T${a.startTime || a.start_time || '00:00'}:00`);
                const rightDate = new Date(`${b.date}T${b.startTime || b.start_time || '00:00'}:00`);
                return rightDate - leftDate;
            })
            .slice(0, 6);

        eventHistoryContainer.innerHTML = recentEvents.length ? recentEvents.map(event => {
            const eventDate = formatDateLabel(event.date);
            const eventTime = `${formatTimeLabel(event.startTime || event.start_time)} - ${formatTimeLabel(event.endTime || event.end_time)}`;
            return `
                <div class="card" style="margin-bottom:1rem; padding:1rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
                        <strong>${event.title || 'Untitled event'}</strong>
                        <span style="font-size:0.9rem; color:var(--text-secondary);">${eventDate} ${eventTime}</span>
                    </div>
                    <div style="margin-top:0.75rem; color:var(--text-secondary);">
                        <div><strong>Location:</strong> ${event.location || 'TBD'}</div>
                        <div><strong>Type:</strong> ${event.type || 'N/A'}</div>
                    </div>
                </div>
            `;
        }).join('') : '<div class="empty-state" style="padding:1rem;"><p>No recent event history available.</p></div>';

        statsContainer.innerHTML = `
            <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                <div class="mini-card">
                    <h5>Avg Decision Time</h5>
                    <p>${avgDecision}</p>
                </div>
                <div class="mini-card">
                    <h5>Top Rooms</h5>
                    ${topRooms || '<div>No data yet.</div>'}
                </div>
                <div class="mini-card">
                    <h5>Cancelled</h5>
                    <p>${cancelled}</p>
                </div>
            </div>
        `;

        const refreshBtn = document.getElementById('btn-refresh-admin-dashboard');
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                const latestBookings = await api.listBookings();
                renderAdminDashboard(latestBookings);
            };
        }
    }

    // Admin Approvals UI: render pending bookings and handle approve/reject
    async function renderAdminApprovals() {
        const container = document.getElementById('approvals-list');
        if (!container) return;
        container.innerHTML = '';
        if (!currentUser || currentUser.role !== 'admin') {
            container.innerHTML = '<p class="text-muted">Admin approvals are visible to admins only.</p>';
            return;
        }
        try {
            const res = await api.listBookings({ status: 'pending' });
            const bookings = res?.bookings || [];
            if (bookings.length === 0) {
                container.innerHTML = '<p class="text-muted">No pending approvals.</p>';
                return;
            }
            const list = document.createElement('div');
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '0.75rem';
            bookings.forEach(bk => {
                const card = document.createElement('div');
                card.className = 'alert-item';
                card.innerHTML = `\
                    <div style="flex:1; cursor:pointer;">\
                        <strong>${bk.roomId} &mdash; ${formatDateLabel(bk.date)} &middot; ${formatTimeLabel(bk.startTime || bk.start_time)} - ${formatTimeLabel(bk.endTime || bk.end_time)}</strong>\
                        <div class="text-muted">Requested by ${bk.requestedBy} ${bk.requestedByEmail ? `(${bk.requestedByEmail})` : ''}</div>\
                        <div class="text-muted">Purpose: ${bk.purpose || '<span class="text-muted">(none)</span>'}</div>\
                        ${bk.attachmentName ? `<div class="text-muted">Attachment: ${bk.attachmentName}</div>` : ''}\
                    </div>\
                    <div style="display:flex; gap:0.5rem; align-items:center;">\
                        <button class="btn-sm btn-outline" data-approve-action="reject" data-approve-id="${bk.id}">Reject</button>\
                        <button class="btn-sm btn-blue" data-approve-action="approve" data-approve-id="${bk.id}">Approve</button>\
                    </div>\
                `;
                card.addEventListener('click', (e) => {
                    if (e.target.closest('[data-approve-action]')) return;
                    showBookingDetailsModal(bk);
                });
                list.appendChild(card);
            });
            container.appendChild(list);
        } catch (err) {
            container.innerHTML = `<p class="text-danger">${getApiErrorMessage(err)}</p>`;
        }
    }

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-approve-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-approve-id');
        const action = btn.getAttribute('data-approve-action');
        if (!id || !action) return;
        if (!currentUser || currentUser.role !== 'admin') { showNotice('Not authorized', 'error'); return; }

        // If admin clicked "Reject" on the card, open the modal to collect a reason
        if (action === 'reject') {
            try {
                const res = await api.listBookings({ status: 'pending' });
                const bookings = res.bookings || [];
                const bk = bookings.find(b => b.id === id);
                if (!bk) { showNotice('Booking not found.', 'error'); return; }
                showBookingDetailsModal(bk);
            } catch (err) {
                showNotice(getApiErrorMessage(err, 'Unable to load booking.'), 'error');
            }
            return;
        }

        // Otherwise (approve), proceed immediately
        try {
            const approveBtns = document.querySelectorAll(`[data-approve-id="${id}"]`);
            approveBtns.forEach(b => { b.disabled = true; b.dataset.prevText = b.innerHTML; b.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...'; });
            const res = await api.updateBookingStatus(id, { action: action, decisionNote: `${action} by admin` });
            const bk = res.booking || res;
            showNotice(`Booking ${action}ed`, 'info');
            addAppNotification(action === 'approve' ? 'booking.approved' : 'booking.rejected', `Booking ${action}ed: ${bk.roomId} ${formatDateLabel(bk.date)} ${formatTimeLabel(bk.startTime)} - ${formatTimeLabel(bk.endTime)}`, { bookingId: bk.id });
            await renderAdminApprovals();
            await refreshViews();
            approveBtns.forEach(b => { b.disabled = false; if (b.dataset.prevText) b.innerHTML = b.dataset.prevText; });
        } catch (err) {
            showNotice(getApiErrorMessage(err), 'error');
        }
    });

    // Booking details modal control buttons
    const closeBookingDetailsBtn = document.getElementById('close-booking-details-modal');
    const saveBookingAdminCommentBtn = document.getElementById('save-booking-admin-comment');
    const bookingApproveBtn = document.getElementById('booking-approve-btn');
    const bookingRejectBtn = document.getElementById('booking-reject-btn');

    if (closeBookingDetailsBtn) {
        closeBookingDetailsBtn.addEventListener('click', () => {
            document.getElementById('booking-details-modal').classList.add('hidden');
        });
    }

    if (saveBookingAdminCommentBtn) {
        saveBookingAdminCommentBtn.addEventListener('click', async () => {
            const modal = document.getElementById('booking-details-modal');
            const bookingId = modal?.dataset.bookingId;
            const commentBox = document.getElementById('booking-admin-comment');
            if (!bookingId || !commentBox) return;
            try {
                await api.updateBookingStatus(bookingId, { decisionNote: commentBox.value });
                showNotice('Comment saved.', 'success');
                modal.classList.add('hidden');
                await renderAdminApprovals();
            } catch (err) {
                showNotice(getApiErrorMessage(err, 'Unable to save comment.'), 'error');
            }
        });
    }

    if (bookingApproveBtn) {
        bookingApproveBtn.addEventListener('click', async () => {
            const modal = document.getElementById('booking-details-modal');
            const bookingId = modal?.dataset.bookingId;
            const commentBox = document.getElementById('booking-admin-comment');
            if (!bookingId) return;
            try {
                await api.updateBookingStatus(bookingId, { action: 'approve', decisionNote: (commentBox?.value) || 'Approved by admin' });
                showNotice('Booking approved.', 'success');
                modal.classList.add('hidden');
                await renderAdminApprovals();
                await refreshViews();
            } catch (err) {
                showNotice(getApiErrorMessage(err, 'Unable to approve booking.'), 'error');
            }
        });
    }

    if (bookingRejectBtn) {
        bookingRejectBtn.addEventListener('click', async () => {
            const modal = document.getElementById('booking-details-modal');
            const bookingId = modal?.dataset.bookingId;
            const commentBox = document.getElementById('booking-admin-comment');
            if (!bookingId) return;
            const reason = commentBox?.value?.trim() || '';
            try {
                if (!reason) {
                    const proceed = await showConfirm('No reason provided. Reject without a reason?');
                    if (!proceed) return;
                }
                await api.updateBookingStatus(bookingId, { action: 'reject', decisionNote: reason || 'Rejected by admin' });
                showNotice('Booking rejected.', 'info');
                modal.classList.add('hidden');
                await renderAdminApprovals();
                await refreshViews();
            } catch (err) {
                showNotice(getApiErrorMessage(err, 'Unable to reject booking.'), 'error');
            }
        });
    }

    const btnRefreshApprovals = document.getElementById('btn-refresh-approvals');
    if (btnRefreshApprovals) btnRefreshApprovals.addEventListener('click', renderAdminApprovals);

    // Ensure role UI applied after boot
    applyRoleUi(currentUser?.role || 'student');

    // Render persisted notifications on startup
    try { renderNotifications(); } catch (err) { /* ignore */ }

    if (btnPrevMonth) {
        btnPrevMonth.addEventListener('click', () => {
            if (currentMonth === todayRef.getMonth() && currentYear === todayRef.getFullYear()) {
                return;
            }
            if (currentMonth === 0) {
                currentMonth = 11;
                currentYear--;
            } else {
                currentMonth--;
            }
            void renderCalendarV2();
        });
    }

    if (btnNextMonth) {
        btnNextMonth.addEventListener('click', () => {
            if (currentMonth === 11) {
                currentMonth = 0;
                currentYear++;
            } else {
                currentMonth++;
            }
            void renderCalendarV2();
        });
    }
    
    if (calendarEventModal) {
        closeCalendarModal.addEventListener('click', closeCalendarModalHandler);
        cancelCalendarEvent.addEventListener('click', closeCalendarModalHandler);
        saveCalendarEvent.addEventListener('click', saveEventHandler);
        calendarEventModal.addEventListener('click', (e) => {
            if (e.target === calendarEventModal) {
                closeCalendarModalHandler();
            }
        });
    }

    // Initial render
    const hasSession = await bootstrapSession();
    updateFilterButtonLabel();
    if (hasSession) {
        await refreshViews();
    }

    // 9. Calendar Filter Dropdown Logic
    const btnFilterEvents = document.getElementById('btn-filter-events');
    const filterDropdown = document.getElementById('filter-dropdown');
    
    if (btnFilterEvents && filterDropdown) {
        btnFilterEvents.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent document click from firing immediately
            filterDropdown.classList.toggle('hidden');
        });

        const filterItems = filterDropdown.querySelectorAll('.dropdown-item[data-filter]');
        filterItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const nextFilter = item.dataset.filter;
                calendarTypeFilter = calendarTypeFilter === nextFilter ? 'all' : nextFilter;
                updateFilterButtonLabel();
                filterItems.forEach(option => {
                    option.classList.toggle('active', calendarTypeFilter === option.dataset.filter);
                });
                filterDropdown.classList.add('hidden');
                void renderCalendarV2();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!filterDropdown.classList.contains('hidden') && !filterDropdown.contains(e.target) && e.target !== btnFilterEvents) {
                filterDropdown.classList.add('hidden');
            }
        });
    }

    // 10. Notifications Dropdown Logic (persistent)
    const btnNotifications = document.getElementById('btn-notifications');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    const notificationsListEl = document.getElementById('notifications-list');
    const notifBadge = document.querySelector('.notification-badge');

    function renderNotifications() {
        if (!notificationsListEl) return;
        let notes = [];
        try {
            notes = (window.service && typeof window.service.getNotifications === 'function') ? window.service.getNotifications() : JSON.parse(localStorage.getItem('apcsync.notifications') || '[]');
        } catch (e) { notes = []; }

        notificationsListEl.innerHTML = '';
        if (!notes || notes.length === 0) {
            notificationsListEl.innerHTML = '<div class="empty-state" style="padding: 1rem; text-align: center; border: none;"><p>No notifications.</p></div>';
            if (notifBadge) notifBadge.classList.add('hidden');
            return;
        }

        let unreadCount = 0;
        notes.forEach(n => { if (n.unread) unreadCount++; });
        if (notifBadge) {
            if (unreadCount > 0) {
                notifBadge.textContent = String(unreadCount);
                notifBadge.classList.remove('hidden');
            } else {
                notifBadge.classList.add('hidden');
            }
        }

        notes.forEach(n => {
            const item = document.createElement('div');
            item.className = 'notification-item' + (n.unread ? ' unread' : '');
            item.style.padding = '0.5rem';
            item.style.borderBottom = '1px solid var(--border-color)';
            item.innerHTML = `<div style="display:flex; justify-content:space-between; gap:0.5rem;"><div style="flex:1"><strong style="display:block; font-size:0.95rem;">${n.message}</strong><small style="color:var(--text-secondary);">${new Date(n.createdAt).toLocaleString()}</small></div></div>`;
            item.addEventListener('click', (e) => {
                // mark single notification as read
                try {
                    if (window.service && typeof window.service.getNotifications === 'function') {
                        const all = window.service.getNotifications();
                        const updated = all.map(x => x.id === n.id ? { ...x, unread: false } : x);
                        // write back
                        const s = window.service.getState();
                        s.notifications = updated;
                        window.service.setState(s);
                        renderNotifications();
                    }
                } catch (err) {}
            });
            notificationsListEl.appendChild(item);
        });
    }

    function addAppNotification(type, message, data = null) {
        try {
            if (window.service && typeof window.service.addNotification === 'function') {
                window.service.addNotification({ type, message, data });
            } else {
                // fallback localStorage
                const key = 'apcsync.notifications';
                const existing = JSON.parse(localStorage.getItem(key) || '[]');
                existing.unshift({ id: `nt-${Date.now()}`, type, message, data, unread: true, createdAt: new Date().toISOString() });
                localStorage.setItem(key, JSON.stringify(existing));
            }
            showNotice(message, type === 'error' ? 'error' : 'success');
        } catch (err) {
            // ignore
        }
        renderNotifications();
    }

    document.addEventListener('click', (e) => {
        const toggle = e.target.closest?.('.collapsible-toggle');
        if (!toggle) return;
        const targetId = toggle.dataset.target;
        if (!targetId) return;
        const body = document.getElementById(targetId);
        if (!body) return;
        const card = body.closest('.collapsible-card');
        if (!card) return;
        const collapsed = card.classList.toggle('collapsed');
        toggle.textContent = collapsed ? 'Expand' : 'Collapse';
    });

    if (btnNotifications && notificationsDropdown) {
        btnNotifications.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationsDropdown.classList.toggle('hidden');
            if (!notificationsDropdown.classList.contains('hidden')) renderNotifications();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!notificationsDropdown.classList.contains('hidden') && !notificationsDropdown.contains(e.target) && e.target !== btnNotifications) {
                notificationsDropdown.classList.add('hidden');
            }
        });

        // Mark all as read button
        const btnClearNotifications = notificationsDropdown.querySelector('.btn-clear-notifications');
        if (btnClearNotifications) {
            btnClearNotifications.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent dropdown from closing
                try {
                    if (window.service && typeof window.service.markAllNotificationsRead === 'function') {
                        window.service.markAllNotificationsRead();
                    } else {
                        const key = 'apcsync.notifications';
                        const existing = JSON.parse(localStorage.getItem(key) || '[]').map(n => ({ ...n, unread: false }));
                        localStorage.setItem(key, JSON.stringify(existing));
                    }
                } catch (err) {}
                renderNotifications();
            });
        }

        // Delete all notifications button
        const btnDeleteAllNotifications = notificationsDropdown.querySelector('.btn-delete-all-notifications');
        if (btnDeleteAllNotifications) {
            btnDeleteAllNotifications.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent dropdown from closing
                try {
                    if (window.service && typeof window.service.clearNotifications === 'function') {
                        window.service.clearNotifications();
                    } else {
                        const key = 'apcsync.notifications';
                        localStorage.setItem(key, '[]');
                    }
                } catch (err) {}
                renderNotifications();
            });
        }
    }

    // 11. Booking Logic
    const bookingFloorBtn = document.getElementById('booking-floor-btn');
    const bookingFloorDropdown = document.getElementById('booking-floor-dropdown');

    if (bookingFloorBtn && bookingFloorDropdown) {
        bookingFloorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            bookingFloorDropdown.classList.toggle('hidden');
        });

        bookingFloorDropdown.querySelectorAll('.dropdown-item').forEach((item) => {
            item.addEventListener('click', async () => {
                const floorName = item.innerText.trim();
                bookingFloorBtn.innerHTML = `<i class="fas fa-map-marker-alt mr-2"></i> ${floorName}`;
                bookingFloorDropdown.classList.add('hidden');

                document.querySelectorAll('.floor-map-wrapper').forEach((map) => {
                    map.classList.toggle('hidden', map.id !== `map-${floorName}`);
                });

                clearBookingRoomSelection();
                await refreshBookingAvailability();
            });
        });

        document.addEventListener('click', (e) => {
            if (!bookingFloorDropdown.classList.contains('hidden') && !bookingFloorDropdown.contains(e.target) && e.target !== bookingFloorBtn) {
                bookingFloorDropdown.classList.add('hidden');
            }
        });
    }

    function selectBookingRoom(roomElement) {
        // Check if room is restricted first
        if (isRestrictedRoom(roomElement)) {
            showNotice('This room is not available for booking.', 'error');
            return;
        }
        
        const slotStatus = roomElement.dataset.bookingStatus || 'available';
        if (isBlockingBookingStatus(slotStatus)) {
            showNotice('That room is already booked for the selected slot.', 'error');
            return;
        }

        setBookingFormError('');

        if (currentBookingRoomElement) {
            currentBookingRoomElement.classList.remove('selected');
            currentBookingRoomElement.setAttribute('aria-pressed', 'false');
        }

        currentBookingRoomElement = roomElement;
        currentBookingSlotStatus = slotStatus;
        roomElement.classList.add('selected');
        roomElement.setAttribute('aria-pressed', 'true');
        updateBookingPopup(roomElement, slotStatus, latestBookingRooms.find((room) => room.id === roomElement.dataset.roomId) || null);

        if (bookingRequestBtn) {
            bookingRequestBtn.disabled = !canRequestBooking(slotStatus, Boolean(bookingDateField?.value && bookingStartTimeField?.value && bookingEndTimeField?.value && bookingStartTimeField.value < bookingEndTimeField.value));
        }
    }

    if (bookingMapContainer) {
        bookingMapContainer.addEventListener('click', (e) => {
            if (!e.target.closest('.booking-room')) {
                clearBookingRoomSelection();
            }
        });
    }

    if (bookingDateField) bookingDateField.addEventListener('change', () => void refreshBookingAvailability());
    if (bookingStartTimeField) bookingStartTimeField.addEventListener('change', () => void refreshBookingAvailability());
    if (bookingEndTimeField) bookingEndTimeField.addEventListener('change', () => void refreshBookingAvailability());
    if (bookingRefreshBtn) bookingRefreshBtn.addEventListener('click', () => void refreshBookingAvailability());
    if (bookingClearSelectionBtn) bookingClearSelectionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearBookingRoomSelection();
    });

    if (bookingAttachmentButton && bookingAttachmentFileInput) {
        bookingAttachmentButton.addEventListener('click', (e) => {
            e.preventDefault();
            bookingAttachmentFileInput.click();
        });

        bookingAttachmentFileInput.addEventListener('change', () => {
            const file = bookingAttachmentFileInput.files?.[0] || null;
            syncBookingAttachmentSelection(file);
        });
    }

    if (bookingRequestBtn) {
        bookingRequestBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!currentUser || currentUser.role !== 'faculty') {
                showNotice('Only faculty members can request bookings.', 'error');
                return;
            }

            setBookingFormError('');
            const slotValues = getBookingSlotValues();
            const purpose = bookingPurposeField?.value.trim() || '';
            const attachmentName = bookingAttachmentField?.value.trim() || '';

            if (!currentBookingRoomElement) {
                setBookingFormError('Select a room from the map before requesting a booking.');
                showNotice('Please choose a room from the map.', 'error');
                return;
            }

            if (!slotValues.date || !slotValues.start_time || !slotValues.end_time || slotValues.start_time >= slotValues.end_time) {
                setBookingFormError('Choose a valid date and time range. End time must be later than start time.');
                showNotice('Please choose a valid date and time range.', 'error');
                return;
            }

            if (!purpose) {
                setBookingFormError('Add a purpose for the booking request.');
                showNotice('Please enter a purpose for the booking.', 'error');
                return;
            }

            const equipment = bookingEquipmentField?.value.trim() || '';
            if (!equipment) {
                setBookingFormError('Specify the hardware or equipment needed for the booking.');
                showNotice('Please list the equipment or resources needed.', 'error');
                return;
            }

            if (isBlockingBookingStatus(currentBookingSlotStatus)) {
                setBookingFormError('That room is already booked for the selected slot. Choose another room or time.');
                showNotice('That room is unavailable for the selected slot.', 'error');
                return;
            }

            try {
                bookingRequestBtn.disabled = true;
                const bookingResp = await api.createBooking({
                    room_id: currentBookingRoomElement.dataset.roomId,
                    date: slotValues.date,
                    start_time: slotValues.start_time,
                    end_time: slotValues.end_time,
                    purpose,
                    equipment,
                    attachment_name: attachmentName,
                    event_id: null
                });
                const createdBooking = bookingResp.booking || bookingResp;
                showNotice('Booking request submitted.', 'success');
                addAppNotification('booking.requested', `Booking requested for ${createdBooking.roomId} ${formatDateLabel(createdBooking.date)} ${formatTimeLabel(createdBooking.startTime)} - ${formatTimeLabel(createdBooking.endTime)}`, { bookingId: createdBooking.id });
                clearBookingRoomSelection();
                clearBookingAttachmentSelection();
                setBookingFormError('');
                await refreshViews();
            } catch (error) {
                showNotice(getApiErrorMessage(error, 'Unable to create booking request.'), 'error');
                setBookingFormError(getApiErrorMessage(error, 'Unable to create booking request.'));
                await refreshBookingAvailability();
            } finally {
                if (bookingRequestBtn && currentUser?.role === 'faculty') {
                    bookingRequestBtn.disabled = false;
                }
            }
        });
    }

    if (bookingMyBookingsList) {
        bookingMyBookingsList.addEventListener('click', async (e) => {
            const cancelButton = e.target.closest('.btn-cancel-booking');
            if (!cancelButton) return;
            const bookingId = cancelButton.dataset.bookingId;
            if (!bookingId) return;

            try {
                cancelButton.disabled = true;
                const resp = await api.updateBookingStatus(bookingId, { action: 'cancel', decisionNote: 'Cancelled by faculty' });
                const bk = resp.booking || resp;
                showNotice('Booking cancelled.', 'success');
                addAppNotification('booking.cancelled', `Booking cancelled: ${bk.roomId} ${formatDateLabel(bk.date)} ${formatTimeLabel(bk.startTime)} - ${formatTimeLabel(bk.endTime)}`, { bookingId: bk.id });
                await refreshViews();
            } catch (error) {
                showNotice(getApiErrorMessage(error, 'Unable to cancel booking.'), 'error');
                await renderMyBookings();
            } finally {
                cancelButton.disabled = false;
            }
        });
    }

    if (bookingRoomSummary) {
        bookingRoomSummary?.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        // Add Cancel Booking button logic
        const cancelBtn = document.getElementById('btn-cancel-booking');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                // Only allow if visible (status is pending)
                if (cancelBtn.classList.contains('hidden')) return;
                if (!currentBookingRoomElement) return;
                const roomId = currentBookingRoomElement.dataset.roomId;
                const slotValues = getBookingSlotValues();
                try {
                    cancelBtn.disabled = true;
                    // Find the pending booking for this room/date/time
                    const response = await api.listBookings({ status: 'pending' });
                    const bookings = response.bookings || [];
                    const booking = bookings.find(b => b.roomId === roomId && b.date === slotValues.date && b.startTime === slotValues.start_time && b.endTime === slotValues.end_time);
                    if (!booking) {
                        showNotice('No pending booking found for this room and slot.', 'error');
                        cancelBtn.disabled = false;
                        return;
                    }
                    await api.updateBookingStatus(booking.id, { action: 'cancel', decisionNote: 'Cancelled by user' });
                    showNotice('Booking cancelled.', 'success');
                    // Set room status to available and update UI
                    currentBookingRoomElement.dataset.bookingStatus = 'available';
                    currentBookingSlotStatus = 'available';
                    updateBookingPopup(currentBookingRoomElement, 'available', null);
                    await refreshViews();
                } catch (error) {
                    showNotice(getApiErrorMessage(error, 'Unable to cancel booking.'), 'error');
                } finally {
                    cancelBtn.disabled = false;
                }
            });
        }
    }

    // --- Chatbot Functionality (Frontend Layout Only) ---
    const chatSuggestionBtns = document.querySelectorAll('.suggestion-btn');
    const chatEmptyState = document.getElementById('chat-empty-state');
    const chatMessagesWrapper = document.getElementById('chat-messages-wrapper');
    const chatContainer = document.querySelector('.guided-chat-container');

    // FAQ Answers Map
    const faqAnswers = {
        '1': 'Only authorized organizers and faculty members can add events by filling out the event form with details such as the title, date, time, venue, and description.',
        '2': 'Users can submit a room reservation request through the system. The request will then be reviewed and approved by the appropriate APC office.',
        '3': 'Students can view upcoming APC events through the event dashboard or calendar page in the platform.',
        '4': 'Events are labeled as either required or optional to help students identify which activities they need to attend.',
        '5': 'The system sends notifications and reminders for upcoming events, schedule changes, and important announcements.',
        '6': 'Organizer/faculty users can view available and reserved venues through the room availability feature before submitting a reservation request.',
        '7': 'Yes, authorized organizers and faculty members can update event details when necessary.',
        '8': 'Users may contact the event organizer or wait for updated information through the platform.',
        '9': 'Only authorized faculty members and approved event organizers are allowed to post and manage events.',
        '10': 'Organizers can check schedules and room availability beforehand to help reduce overlapping events and conflicts.',
        '11': 'The system will send notifications whenever there are updates to event schedules, venues, or other important details.',
        '12': 'Yes, organizers may upload files, posters, or other related materials for participants to access.',
        '15': 'Yes, the system is exclusive to APC students, faculty members, and authorized event organizers.'
    };

    if (chatSuggestionBtns.length > 0 && chatMessagesWrapper) {
        chatSuggestionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const questionText = btn.textContent;
                const questionId = btn.getAttribute('data-question');
                const answerText = faqAnswers[questionId] || 'I\'m not sure about that. Please try again.';
                
                // Hide empty state on first interaction
                if (chatEmptyState) {
                    chatEmptyState.classList.add('hidden-state');
                }

                // Add User Bubble
                const userMsg = document.createElement('div');
                userMsg.className = 'chat-message right';
                userMsg.innerHTML = `
                    <div class="message-bubble user">${questionText}</div>
                    <div class="user-icon"><i class="fas fa-user"></i></div>
                `;
                chatMessagesWrapper.appendChild(userMsg);

                // Add Bot Reply Bubble
                const botMsg = document.createElement('div');
                botMsg.className = 'chat-message left';
                botMsg.innerHTML = `
                    <div class="bot-icon"><img src="Ramsey.png" alt="Ramsey AI" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"></div>
                    <div class="message-bubble bot">
                        ${answerText}
                    </div>
                `;
                chatMessagesWrapper.appendChild(botMsg);

                // Auto-scroll to bottom smoothly
                setTimeout(() => {
                    chatContainer.scrollTo({
                        top: chatContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                }, 50);
            });
        });
    }

});
