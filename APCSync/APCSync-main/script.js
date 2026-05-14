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
                endTime: ev.endTime || ev.end_time
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
        // Enforce role-based access control for 'booking'
        const user = currentUser;
        if (targetId === 'booking' && user && user.role === 'student') {
            showNotice("Room booking is restricted to faculty members only.", 'error');
            targetId = 'dashboard'; // redirect to dashboard
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

    const eventDetailsData = {};

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
                <div style="margin-top: 2rem; display: flex; gap: 0.5rem;">
                    <button class="btn-blue btn-sm" id="btn-edit-schedule-event" data-event-id="${eventId}">Edit</button>
                    <button class="btn-outline btn-sm" id="btn-delete-schedule-event" data-event-id="${eventId}">Delete</button>
                </div>
            </div>
        `;
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
    const bookingAttachmentField = document.getElementById('booking-attachment-name');
    const bookingRequestPanel = document.getElementById('booking-request-panel');
    const bookingAvailabilityNote = document.getElementById('booking-availability-note');
    const bookingRefreshBtn = document.getElementById('btn-refresh-booking-map');
    const bookingClearSelectionBtn = document.getElementById('btn-clear-room-selection');
    const bookingRequestBtn = document.getElementById('btn-request-booking');
    const bookingMyBookingsPanel = document.getElementById('my-bookings-panel');
    const bookingMyBookingsList = document.getElementById('my-bookings-list');
    const bookingRoomPopup = document.getElementById('room-popup');
    const bookingRoomNameEl = document.getElementById('popup-room-name');
    const bookingRoomTypeEl = document.getElementById('popup-room-type');
    const bookingRoomStatusEl = document.getElementById('popup-room-status');
    const bookingRoomInfoEl = document.getElementById('popup-room-info');
    const bookingMapContainer = document.querySelector('.booking-map-container');
    const bookingRoomElements = Array.from(document.querySelectorAll('.booking-room'));
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

    function getRoomAvailabilityClass(status) {
        if (status === 'approved') return 'booked';
        if (status === 'pending') return 'pending';
        return 'available';
    }

    function clearBookingRoomSelection() {
        if (currentBookingRoomElement) {
            currentBookingRoomElement.classList.remove('selected');
        }
        currentBookingRoomElement = null;
        currentBookingSlotStatus = 'available';
        if (bookingRoomPopup) bookingRoomPopup.classList.add('hidden');
        if (bookingRequestBtn) {
            bookingRequestBtn.disabled = true;
        }
    }

    function updateBookingPopup(roomElement, status, roomRecord) {
        if (!bookingRoomPopup || !bookingRoomNameEl || !bookingRoomTypeEl || !bookingRoomStatusEl || !bookingRoomInfoEl) return;

        const roomId = roomElement?.dataset?.roomId || '';
        const roomLabel = roomElement?.textContent?.replace(/\s+/g, ' ').trim() || 'Room';
        bookingRoomNameEl.textContent = roomLabel;
        bookingRoomTypeEl.textContent = roomRecord?.name || roomId || 'Selected room';
        bookingRoomStatusEl.className = status === 'approved' ? 'status-booked' : status === 'pending' ? 'status-pending' : 'status-available';
        bookingRoomStatusEl.textContent = status === 'approved' ? 'Booked' : status === 'pending' ? 'Reserved' : 'Available';
        bookingRoomInfoEl.textContent = status === 'approved'
            ? 'This room is unavailable for the selected slot.'
            : status === 'pending'
                ? 'A pending request overlaps this slot.'
                : 'This room is available for the selected slot.';

        bookingRoomPopup.classList.remove('hidden');
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
            const status = isSlotReady ? (roomStatusMap.get(roomId) || 'available') : 'available';
            roomElement.dataset.bookingStatus = status;
            roomElement.classList.remove('available', 'pending', 'booked', 'reserved', 'completed');
            roomElement.classList.add(getRoomAvailabilityClass(status));
        });

        if (currentBookingRoomElement) {
            const selectedRoomId = currentBookingRoomElement.dataset.roomId;
            const selectedStatus = isSlotReady ? (roomStatusMap.get(selectedRoomId) || 'available') : 'available';
            currentBookingSlotStatus = selectedStatus;
            updateBookingPopup(currentBookingRoomElement, selectedStatus, latestBookingRooms.find((room) => room.id === selectedRoomId) || null);
            if (selectedStatus === 'approved' || selectedStatus === 'pending') {
                bookingRequestBtn?.setAttribute('disabled', 'disabled');
            } else {
                bookingRequestBtn?.removeAttribute('disabled');
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
                            <div class="text-muted">${booking.date} ${booking.startTime} - ${booking.endTime}</div>
                            <div class="text-muted">${booking.purpose || ''}</div>
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

        if (bookingRoomPopup) {
            bookingRoomPopup.classList.add('hidden');
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
                    if(ev.type === 'required') {
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

        // Reset invite fields visibility based on default option
        if (eventTypeSelect && eventInviteFields) {
            if (eventTypeSelect.value === 'personal') {
                eventInviteFields.classList.add('hidden');
            } else {
                eventInviteFields.classList.remove('hidden');
            }
        }

        // Reset visibility scope to "everyone" and hide custom users
        if (visibleScopeSelect) visibleScopeSelect.value = 'everyone';
        if (customUsersDiv) {
            customUsersDiv.classList.add('hidden');
            document.querySelectorAll('.event-custom-user-cb').forEach(cb => cb.checked = false);
        }

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
            bookingStatusMsg.textContent = 'Select date and time to find available rooms.';
            bookingStatusMsg.style.color = '#666';
            bookingStatusMsg.style.backgroundColor = '#f5f5f5';
            bookingStatusMsg.style.display = 'block';
            locationInput.value = '';
            locationInput.dataset.bookingId = '';
            return;
        }

        try {
            // Find approved bookings for this user/date/time
            const approvedBookings = await api.listBookings();
            const loggedInUser = currentUser; // Use global currentUser
            
            // Filter for this user's approved bookings matching date/time
            const matchingBookings = (approvedBookings.bookings || []).filter(booking => {
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

    async function renderDashboard(eventsByDate = null) {
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
                    let clickLink = ev.type === 'personal' ? `data-schedule-link="${eventKey}" style="cursor:pointer;"` : `data-event-details-link="${eventKey}" style="cursor:pointer;"`;
                    let eventItemHtml = `
                        <div class="schedule-item ${ev.type} mb-2" ${clickLink}>
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
                        endTime: ev.endTime || ev.end_time
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
                    if (scheduleDetailsPane) {
                        scheduleDetailsPane.innerHTML = `
                            <div class="placeholder-content" style="border: none; background: transparent;">
                                <i class="far fa-eye mb-2" style="font-size: 2rem; color: var(--gold-dark);"></i>
                                <h3>Select an event</h3>
                                <p class="mt-2 text-muted">Click an event from the timeline to view its complete details and requirements.</p>
                            </div>
                        `;
                    }
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
        if (!titleInput.value.trim() || !dateInput.value || !typeInput.value || !startTimeInput.value || !endTimeInput.value || !locationInput.value.trim() || !notesInput.value.trim()) {
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
        const visibilityPayload = parseVisibilityPayload(typeInput.value, visibleScope, customUserList);
        
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
            type: typeInput.value,
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
                addAppNotification(isEdit ? 'event.updated' : 'event.created', `${isEdit ? 'Event updated' : 'Event created'}: ${ev.title} (${ev.date} ${ev.startTime}-${ev.endTime})`, { eventId: ev.id });
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
                    <div style="flex:1">\
                        <strong>${bk.roomId} — ${bk.date} ${bk.startTime}-${bk.endTime}</strong>\
                        <div class="text-muted">Requested by ${bk.requestedBy} — ${bk.purpose || ''}</div>\
                    </div>\
                    <div style="display:flex; gap:0.5rem; align-items:center;">\
                        <button class="btn-sm btn-outline" data-approve-action="reject" data-approve-id="${bk.id}">Reject</button>\
                        <button class="btn-sm btn-blue" data-approve-action="approve" data-approve-id="${bk.id}">Approve</button>\
                    </div>\
                `;
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
        try {
            // show loading on the clicked button(s)
            const approveBtns = document.querySelectorAll(`[data-approve-id="${id}"]`);
            approveBtns.forEach(b => { b.disabled = true; b.dataset.prevText = b.innerHTML; b.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...'; });
            const res = await api.updateBookingStatus(id, { action: action, decisionNote: `${action} by admin` });
            const bk = res.booking || res;
            showNotice(`Booking ${action}ed`, 'info');
            addAppNotification(action === 'approve' ? 'booking.approved' : 'booking.rejected', `Booking ${action}ed: ${bk.roomId} ${bk.date} ${bk.startTime}-${bk.endTime}`, { bookingId: bk.id });
            await renderAdminApprovals();
            await refreshViews();
            approveBtns.forEach(b => { b.disabled = false; if (b.dataset.prevText) b.innerHTML = b.dataset.prevText; });
        } catch (err) {
            showNotice(getApiErrorMessage(err), 'error');
        }
    });

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

    bookingRoomElements.forEach((roomElement) => {
        roomElement.addEventListener('click', (e) => {
            e.stopPropagation();
            const slotStatus = roomElement.dataset.bookingStatus || 'available';
            if (slotStatus === 'approved') {
                showNotice('That room is already booked for the selected slot.', 'error');
                return;
            }

            if (currentBookingRoomElement) {
                currentBookingRoomElement.classList.remove('selected');
            }

            currentBookingRoomElement = roomElement;
            currentBookingSlotStatus = slotStatus;
            roomElement.classList.add('selected');
            updateBookingPopup(roomElement, slotStatus, latestBookingRooms.find((room) => room.id === roomElement.dataset.roomId) || null);

            if (bookingRequestBtn) {
                bookingRequestBtn.disabled = !currentUser || currentUser.role !== 'faculty' || slotStatus === 'approved' || slotStatus === 'pending';
            }
        });
    });

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

    if (bookingRequestBtn) {
        bookingRequestBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!currentUser || currentUser.role !== 'faculty') {
                showNotice('Only faculty members can request bookings.', 'error');
                return;
            }

            const slotValues = getBookingSlotValues();
            const purpose = bookingPurposeField?.value.trim() || '';
            const attachmentName = bookingAttachmentField?.value.trim() || '';

            if (!currentBookingRoomElement) {
                showNotice('Please choose a room from the map.', 'error');
                return;
            }

            if (!slotValues.date || !slotValues.start_time || !slotValues.end_time || slotValues.start_time >= slotValues.end_time) {
                showNotice('Please choose a valid date and time range.', 'error');
                return;
            }

            if (!purpose) {
                showNotice('Please enter a purpose for the booking.', 'error');
                return;
            }

            if (currentBookingSlotStatus !== 'available') {
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
                    attachment_name: attachmentName,
                    event_id: null
                });
                const createdBooking = bookingResp.booking || bookingResp;
                showNotice('Booking request submitted.', 'success');
                addAppNotification('booking.requested', `Booking requested for ${createdBooking.roomId} ${createdBooking.date} ${createdBooking.startTime}-${createdBooking.endTime}`, { bookingId: createdBooking.id });
                clearBookingRoomSelection();
                await refreshViews();
            } catch (error) {
                showNotice(getApiErrorMessage(error, 'Unable to create booking request.'), 'error');
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
                addAppNotification('booking.cancelled', `Booking cancelled: ${bk.roomId} ${bk.date} ${bk.startTime}-${bk.endTime}`, { bookingId: bk.id });
                await refreshViews();
            } catch (error) {
                showNotice(getApiErrorMessage(error, 'Unable to cancel booking.'), 'error');
                await renderMyBookings();
            } finally {
                cancelButton.disabled = false;
            }
        });
    }

    if (bookingRoomPopup) {
        bookingRoomPopup.addEventListener('click', (e) => {
            e.stopPropagation();
        });
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
