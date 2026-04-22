document.addEventListener('DOMContentLoaded', () => {
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    const slotsContainer = document.getElementById('slots-container');
    const newSlotButton = document.querySelector('.new-slot');
    const formContainer = document.getElementById('form-container');
    const welcomeMessage = document.getElementById('welcome-message');
    const createBtn = document.getElementById('create-btn');
    const subjectInput = document.getElementById('subject');
    const courseInput = document.getElementById('course');
    const findSectionsBtn = document.getElementById('find-sections-btn');
    const sectionsContainer = document.getElementById('sections-container');
    const sectionsSelect = document.getElementById('sections');
    const intervalInput = document.getElementById('interval');
    const intervalValue = document.getElementById('interval-value');
    const watchWaitlistInput = document.getElementById('watch-waitlist');
    const strictModeInput = document.getElementById('strict-mode');

    let activeSlot = null;
    let slotCounter = 0;
    const monitoringIntervals = {};
    const notificationSound = new Audio('/notification.wav');

    function showForm() {
        welcomeMessage.classList.add('hidden');
        formContainer.classList.remove('hidden');
    }

    function showWelcomeMessage() {
        formContainer.classList.add('hidden');
        welcomeMessage.classList.remove('hidden');
    }

    function updateFindSectionsButtonState() {
        findSectionsBtn.disabled = !(subjectInput.value.trim() && courseInput.value.trim());
    }

    function updateCreateButtonState() {
        createBtn.disabled = sectionsSelect.selectedOptions.length === 0;
    }

    function addSlot(crn, subject, course, interval, watchWaitlist, strictMode) {
        const slotId = `slot-${slotCounter++}`;
        const slot = document.createElement('div');
        slot.classList.add('slot', 'p-4', 'rounded-md', 'cursor-pointer', 'border');
        slot.dataset.slotId = slotId;
        slot.dataset.crn = crn;
        slot.dataset.subject = subject;
        slot.dataset.course = course;
        slot.dataset.interval = interval;
        slot.dataset.watchWaitlist = watchWaitlist;
        slot.dataset.strictMode = strictMode;
        slot.dataset.previousSeatsActual = -1; // Initialize to an impossible value
        slot.dataset.previousWaitlistActual = -1; // Initialize to an impossible value

        slot.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <div class="font-bold">CRN: ${crn} (${subject} ${course})</div>
                    <div class="text-sm text-gray-600">Interval: ${interval}s</div>
                </div>
                <div class="flex flex-col items-end">
                    <div class="text-sm text-gray-700 seat-info"></div>
                    <div class="text-sm text-gray-700 waitlist-info"></div>
                    <a href="https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/classRegistration/classRegistration" target="_blank" class="register-btn hidden bg-blue-500 hover:bg-blue-700 text-white text-xs py-1 px-2 rounded mt-1">Register</a>
                </div>
            </div>
            <div class="text-sm text-gray-600">Waitlist: ${watchWaitlist ? 'Watching' : 'Not Watching'}</div>
            <div class="text-sm text-gray-600">Strict Mode: ${strictMode ? 'On' : 'Off'}</div>
            <div class="text-sm text-gray-500 status">Status: Idle</div>
        `;

        slot.addEventListener('click', () => {
            if (activeSlot) {
                activeSlot.classList.remove('active');
            }
            activeSlot = slot;
            activeSlot.classList.add('active');

            activeSlot.classList.remove('bg-green-100', 'border-green-500');
            activeSlot.dataset.new = "false";

            showForm();
            subjectInput.value = activeSlot.dataset.subject;
            courseInput.value = activeSlot.dataset.course;
            intervalInput.value = activeSlot.dataset.interval;
            intervalValue.textContent = `${activeSlot.dataset.interval}s`;
            watchWaitlistInput.checked = activeSlot.dataset.watchWaitlist === 'true';
            strictModeInput.checked = activeSlot.dataset.strictMode === 'true';
            sectionsContainer.classList.add('hidden');
            updateFindSectionsButtonState();
            createBtn.disabled = true;
        });

        slotsContainer.insertBefore(slot, newSlotButton);
        return slot;
    }

    newSlotButton.addEventListener('click', () => {
        if (activeSlot) {
            activeSlot.classList.remove('active');
        }
        activeSlot = null;
        subjectInput.value = '';
        courseInput.value = '';
        intervalInput.value = '30';
        intervalValue.textContent = '30s';
        watchWaitlistInput.checked = false;
        strictModeInput.checked = true;
        sectionsContainer.classList.add('hidden');
        sectionsSelect.innerHTML = '';
        showForm();
        updateFindSectionsButtonState();
        updateCreateButtonState();
    });

    subjectInput.addEventListener('input', updateFindSectionsButtonState);
    courseInput.addEventListener('input', updateFindSectionsButtonState);

    intervalInput.addEventListener('input', () => {
        intervalValue.textContent = `${intervalInput.value}s`;
    });

    findSectionsBtn.addEventListener('click', async () => {
        const subject = subjectInput.value.trim().toUpperCase();
        const course = courseInput.value.trim();

        findSectionsBtn.disabled = true;
        findSectionsBtn.textContent = 'Finding...';
        createBtn.disabled = true;

        try {
            const response = await fetch(`/.netlify/functions/check-crn?subject=${subject}&course=${course}`);
            const sections = await response.json();

            if (sections.error) {
                throw new Error(sections.error);
            }

            sectionsSelect.innerHTML = '';
            if (sections.length > 0) {
                sections.forEach(section => {
                    const option = document.createElement('option');
                    option.value = section.crn;
                    option.textContent = `${section.name}`;
                    sectionsSelect.appendChild(option);
                });
                sectionsContainer.classList.remove('hidden');
            } else {
                alert('No sections found for this course.');
                sectionsContainer.classList.add('hidden');
            }
        } catch (error) {
            alert(`Error finding sections: ${error.message}`);
            sectionsContainer.classList.add('hidden');
        } finally {
            findSectionsBtn.disabled = false;
            findSectionsBtn.textContent = 'Find Sections';
            updateFindSectionsButtonState();
        }
    });

    sectionsSelect.addEventListener('mousedown', function(e) {
        e.preventDefault();
        const option = e.target;
        if (option.tagName === 'OPTION') {
            option.selected = !option.selected;
            updateCreateButtonState();
        }
    });

    createBtn.addEventListener('click', async () => {
        if (Notification.permission === 'denied') {
            alert('Notifications are blocked. Please enable them in your browser settings to receive alerts.');
        } else if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'denied') {
                alert('You have blocked notifications. Please enable them in your browser settings to receive alerts.');
            }
        }

        const subject = subjectInput.value.trim().toUpperCase();
        const course = courseInput.value.trim();
        const selectedOptions = Array.from(sectionsSelect.selectedOptions);
        const interval = parseInt(intervalInput.value, 10);
        const watchWaitlist = watchWaitlistInput.checked;
        const strictMode = strictModeInput.checked;

        if (selectedOptions.length === 0) {
            alert('Please find and select at least one section.');
            return;
        }

        if (isNaN(interval) || interval < 5 || interval > 600) {
            alert('Please enter a valid interval between 5 and 600 seconds.');
            return;
        }

        selectedOptions.forEach(option => {
            const crn = option.value;
            const existingSlot = findSlotByCrn(crn);
            if (!existingSlot) {
                const newSlot = addSlot(crn, subject, course, interval, watchWaitlist, strictMode);
                startMonitoring(newSlot);
            } else {
                existingSlot.dataset.interval = interval;
                existingSlot.dataset.watchWaitlist = watchWaitlist;
                existingSlot.dataset.strictMode = strictMode;
                startMonitoring(existingSlot);
            }
        });

        showWelcomeMessage();
    });

    function findSlotByCrn(crn) {
        const slots = document.querySelectorAll('.slot');
        for (const slot of slots) {
            if (slot.dataset.crn === crn) {
                return slot;
            }
        }
        return null;
    }

    async function startMonitoring(slot) {
        const crn = slot.dataset.crn;
        const subject = slot.dataset.subject;
        const course = slot.dataset.course;
        const interval = parseInt(slot.dataset.interval, 10) * 1000;
        const slotId = slot.dataset.slotId;

        if (monitoringIntervals[slotId]) {
            clearInterval(monitoringIntervals[slotId]);
        }

        const statusEl = slot.querySelector('.status');
        const seatInfoEl = slot.querySelector('.seat-info');
        const waitlistInfoEl = slot.querySelector('.waitlist-info');
        const registerBtn = slot.querySelector('.register-btn');

        const performCheck = async () => {
            const queryParams = new URLSearchParams({
                crn: slot.dataset.crn,
                initialSeatsActual: slot.dataset.initialSeatsActual,
                initialSeatsCapacity: slot.dataset.initialSeatsCapacity,
                initialWaitlistActual: slot.dataset.initialWaitlistActual,
                initialWaitlistCapacity: slot.dataset.initialWaitlistCapacity,
                watchWaitlist: slot.dataset.watchWaitlist,
                strictMode: slot.dataset.strictMode
            });

            try {
                const response = await fetch(`/.netlify/functions/check-crn?${queryParams}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Request failed with status ${response.status}`);
                }

                statusEl.classList.remove('text-red-500');

                const currentSeatsActual = data.availability.seats.actual;
                const currentWaitlistActual = data.availability.waitlist.actual;

                let seatsOpened = 0;
                if (slot.dataset.previousSeatsActual !== '-1') { // Only calculate if not first check
                    seatsOpened = parseInt(slot.dataset.previousSeatsActual) - currentSeatsActual;
                }

                let waitlistSpotsOpened = 0;
                if (slot.dataset.previousWaitlistActual !== '-1') { // Only calculate if not first check
                    waitlistSpotsOpened = parseInt(slot.dataset.previousWaitlistActual) - currentWaitlistActual;
                }

                seatInfoEl.textContent = `Seats: ${currentSeatsActual}/${data.availability.seats.capacity}`;
                waitlistInfoEl.textContent = `Waitlist: ${currentWaitlistActual}/${data.availability.waitlist.capacity}`;
                seatInfoEl.classList.remove('hidden');
                waitlistInfoEl.classList.remove('hidden');
                registerBtn.classList.add('hidden');

                if (data.status === 'open') {
                    statusEl.textContent = 'Status: Spot Opened!';
                    statusEl.classList.add('text-green-500');
                    if (Notification.permission === 'granted') {
                        notificationSound.play();
                        new Notification(`${subject}${course}:${crn} Seat Open`, {
                            body: `${seatsOpened > 0 ? `Found ${seatsOpened} open seat(s) for ${subject} ${course}.` : `Found an open seat for ${subject} ${course}.`}`,
                        });
                    }

                    slot.classList.add('bg-green-100', 'border-green-500');
                    slot.dataset.new = "true";
                    registerBtn.classList.remove('hidden');
                    seatInfoEl.classList.add('hidden');
                    waitlistInfoEl.classList.add('hidden');

                    clearInterval(monitoringIntervals[slotId]);
                } else if (data.status === 'waitlist_open') {
                    statusEl.textContent = 'Status: Waitlist Spot Opened!';
                    statusEl.classList.add('text-green-500');
                    if (Notification.permission === 'granted') {
                        notificationSound.play();
                        new Notification(`${subject} ${course} Waitlist Spot Open!`, {
                            body: `CRN: ${crn}. ${waitlistSpotsOpened > 0 ? `${waitlistSpotsOpened} spot(s) just opened.` : 'A spot is available.'}`,
                        });
                    }

                    slot.classList.add('bg-green-100', 'border-green-500');
                    slot.dataset.new = "true";
                    registerBtn.classList.remove('hidden');
                    seatInfoEl.classList.add('hidden');
                    waitlistInfoEl.classList.add('hidden');

                    clearInterval(monitoringIntervals[slotId]);
                }
                else if (data.status === 'closed') {
                    statusEl.textContent = 'Status: Monitoring...';
                }
                // Update previous actual counts for the next check
                slot.dataset.previousSeatsActual = currentSeatsActual;
                slot.dataset.previousWaitlistActual = currentWaitlistActual;
            } catch (error) {
                statusEl.textContent = 'Status: Connection issue. Retrying...';
                statusEl.classList.add('text-red-500');
                console.error('Error checking CRN:', error.message);
            }
        };

        statusEl.textContent = 'Status: Initializing...';
        statusEl.classList.remove('text-green-500', 'text-red-500');
        seatInfoEl.classList.remove('hidden');
        waitlistInfoEl.classList.remove('hidden');
        registerBtn.classList.add('hidden');

        try {
            const response = await fetch(`/.netlify/functions/check-crn?crn=${crn}`);
            const data = await response.json();

            if (response.ok && data.status === 'initial') {
                slot.dataset.initialSeatsActual = data.availability.seats.actual;
                slot.dataset.initialSeatsCapacity = data.availability.seats.capacity;
                slot.dataset.initialWaitlistActual = data.availability.waitlist.actual;
                slot.dataset.initialWaitlistCapacity = data.availability.waitlist.capacity;

                // Initialize previous actuals for spot opened calculation
                slot.dataset.previousSeatsActual = data.availability.seats.actual;
                slot.dataset.previousWaitlistActual = data.availability.waitlist.actual;

                seatInfoEl.textContent = `Seats: ${data.availability.seats.actual}/${data.availability.seats.capacity}`;
                waitlistInfoEl.textContent = `Waitlist: ${data.availability.waitlist.actual}/${data.availability.waitlist.capacity}`;
                statusEl.textContent = 'Status: Monitoring...';

                monitoringIntervals[slotId] = setInterval(performCheck, interval);
            } else {
                 throw new Error(data.error || 'Initialization failed');
            }
        } catch (error) {
            statusEl.textContent = 'Status: Error on Init. Retrying...';
            statusEl.classList.add('text-red-500');
            console.error('Error initializing CRN check:', error);

            // Even if init fails, start monitoring to retry
            monitoringIntervals[slotId] = setInterval(performCheck, interval);
        }
    }
});

