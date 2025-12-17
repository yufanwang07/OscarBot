document.addEventListener('DOMContentLoaded', () => {
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    const slotsContainer = document.getElementById('slots-container');
    const newSlotButton = document.querySelector('.new-slot');
    const formContainer = document.getElementById('form-container');
    const welcomeMessage = document.getElementById('welcome-message');
    const createBtn = document.getElementById('create-btn');
    const crnInput = document.getElementById('crn');
    const intervalInput = document.getElementById('interval');
    const watchWaitlistInput = document.getElementById('watch-waitlist');

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

    function addSlot(crn, interval, watchWaitlist) {
        const slotId = `slot-${slotCounter++}`;
        const slot = document.createElement('div');
        slot.classList.add('slot', 'p-4', 'rounded-md', 'cursor-pointer', 'border');
        slot.dataset.slotId = slotId;
        slot.dataset.crn = crn;
        slot.dataset.interval = interval;
        slot.dataset.watchWaitlist = watchWaitlist;

        slot.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <div class="font-bold">CRN: ${crn}</div>
                    <div class="text-sm text-gray-600">Interval: ${interval}s</div>
                </div>
                <div class="flex flex-col items-end">
                    <div class="text-sm text-gray-700 seat-info"></div>
                    <div class="text-sm text-gray-700 waitlist-info"></div>
                    <a href="https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/classRegistration/classRegistration" target="_blank" class="register-btn hidden bg-blue-500 hover:bg-blue-700 text-white text-xs py-1 px-2 rounded mt-1">Register</a>
                </div>
            </div>
            <div class="text-sm text-gray-600">Waitlist: ${watchWaitlist ? 'Watching' : 'Not Watching'}</div>
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
            crnInput.value = activeSlot.dataset.crn;
            intervalInput.value = activeSlot.dataset.interval;
            watchWaitlistInput.checked = activeSlot.dataset.watchWaitlist === 'true';
        });

        slotsContainer.insertBefore(slot, newSlotButton);
        return slot;
    }

    newSlotButton.addEventListener('click', () => {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }

        if (activeSlot) {
            activeSlot.classList.remove('active');
        }
        activeSlot = null;
        crnInput.value = '';
        intervalInput.value = '30';
        watchWaitlistInput.checked = false;
        showForm();
    });

    createBtn.addEventListener('click', () => {
        const crn = crnInput.value.trim();
        const interval = parseInt(intervalInput.value, 10);
        const watchWaitlist = watchWaitlistInput.checked;

        if (!crn) {
            alert('Please enter a CRN.');
            return;
        }

        if (isNaN(interval) || interval < 5 || interval > 600) {
            alert('Please enter a valid interval between 5 and 600 seconds.');
            return;
        }

        let targetSlot;
        if (activeSlot && activeSlot.dataset.crn === crn) {
            targetSlot = activeSlot;
            targetSlot.dataset.interval = interval;
            targetSlot.dataset.watchWaitlist = watchWaitlist;
            targetSlot.querySelector('.text-sm.text-gray-600').textContent = `Interval: ${interval}s`;
            targetSlot.querySelectorAll('.text-sm.text-gray-600')[1].textContent = `Waitlist: ${watchWaitlist ? 'Watching' : 'Not Watching'}`;
        } else {
            const existingSlot = findSlotByCrn(crn);
            if (existingSlot) {
                alert('A slot for this CRN already exists.');
                return;
            }
            targetSlot = addSlot(crn, interval, watchWaitlist);
            if (activeSlot) {
                activeSlot.classList.remove('active');
            }
            activeSlot = targetSlot;
            activeSlot.classList.add('active');
        }
        
        startMonitoring(targetSlot);
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
        const interval = parseInt(slot.dataset.interval, 10) * 1000;
        const slotId = slot.dataset.slotId;
        const watchWaitlist = slot.dataset.watchWaitlist === 'true';

        if (monitoringIntervals[slotId]) {
            clearInterval(monitoringIntervals[slotId]);
        }

        const statusEl = slot.querySelector('.status');
        const seatInfoEl = slot.querySelector('.seat-info');
        const waitlistInfoEl = slot.querySelector('.waitlist-info');
        const registerBtn = slot.querySelector('.register-btn');


        statusEl.textContent = 'Status: Initializing...';
        statusEl.classList.remove('text-green-500', 'text-red-500');
        seatInfoEl.classList.remove('hidden');
        waitlistInfoEl.classList.remove('hidden');
        registerBtn.classList.add('hidden'); // Ensure register button is hidden initially

        // Initial call to get baseline
        try {
            const response = await fetch(`/.netlify/functions/check-crn?crn=${crn}`);
            const data = await response.json();

            if (data.status === 'initial') {
                slot.dataset.initialSeatsActual = data.availability.seats.actual;
                slot.dataset.initialSeatsCapacity = data.availability.seats.capacity;
                slot.dataset.initialWaitlistActual = data.availability.waitlist.actual;
                slot.dataset.initialWaitlistCapacity = data.availability.waitlist.capacity;
                
                seatInfoEl.textContent = `Seats: ${data.availability.seats.actual}/${data.availability.seats.capacity}`;
                waitlistInfoEl.textContent = `Waitlist: ${data.availability.waitlist.actual}/${data.availability.waitlist.capacity}`;
                statusEl.textContent = 'Status: Monitoring...';
            } else {
                 throw new Error(data.error || 'Initialization failed');
            }
        } catch (error) {
            statusEl.textContent = 'Status: Error on Init';
            statusEl.classList.add('text-red-500');
            console.error('Error initializing CRN check:', error);
            return;
        }


        monitoringIntervals[slotId] = setInterval(async () => {
            const queryParams = new URLSearchParams({
                crn: slot.dataset.crn,
                initialSeatsActual: slot.dataset.initialSeatsActual,
                initialSeatsCapacity: slot.dataset.initialSeatsCapacity,
                initialWaitlistActual: slot.dataset.initialWaitlistActual,
                initialWaitlistCapacity: slot.dataset.initialWaitlistCapacity,
                watchWaitlist: slot.dataset.watchWaitlist
            });

            try {
                const response = await fetch(`/.netlify/functions/check-crn?${queryParams}`);
                const data = await response.json();

                // Always update seat/waitlist info during monitoring
                seatInfoEl.textContent = `Seats: ${data.availability.seats.actual}/${data.availability.seats.capacity}`;
                waitlistInfoEl.textContent = `Waitlist: ${data.availability.waitlist.actual}/${data.availability.waitlist.capacity}`;
                seatInfoEl.classList.remove('hidden');
                waitlistInfoEl.classList.remove('hidden');
                registerBtn.classList.add('hidden');

                if (data.status === 'open') {
                    statusEl.textContent = 'Status: Spot Opened!';
                    statusEl.classList.add('text-green-500');
                    notificationSound.play();
                    new Notification('Class Spot Open!', {
                        body: `A spot has opened up for CRN: ${crn}`,
                    });
                    
                    slot.classList.add('bg-green-100', 'border-green-500');
                    slot.dataset.new = "true";
                    registerBtn.classList.remove('hidden');
                    seatInfoEl.classList.add('hidden');
                    waitlistInfoEl.classList.add('hidden');

                    clearInterval(monitoringIntervals[slotId]);
                } else if (data.status === 'waitlist_open') {
                    statusEl.textContent = 'Status: Waitlist Spot Opened!';
                    statusEl.classList.add('text-green-500');
                    notificationSound.play();
                    new Notification('Waitlist Spot Open!', {
                        body: `A waitlist spot has opened for CRN: ${crn}`,
                    });

                    slot.classList.add('bg-green-100', 'border-green-500');
                    slot.dataset.new = "true";
                    registerBtn.classList.remove('hidden');
                    seatInfoEl.classList.add('hidden');
                    waitlistInfoEl.classList.add('hidden');

                    clearInterval(monitoringIntervals[slotId]);
                }
                else if (data.status === 'closed') {
                    statusEl.textContent = 'Status: Monitoring...';
                } else {
                    statusEl.textContent = `Status: ${data.error || 'Unknown Error'}`;
                    statusEl.classList.add('text-red-500');
                    clearInterval(monitoringIntervals[slotId]);
                }
            } catch (error) {
                statusEl.textContent = 'Status: Error';
                statusEl.classList.add('text-red-500');
                clearInterval(monitoringIntervals[slotId]);
                console.error('Error checking CRN:', error);
            }
        }, interval);
    }
});
