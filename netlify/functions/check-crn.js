const axios = require('axios');
const cheerio = require('cheerio');

async function checkClassAvailability(term, crn) {
    const url = `https://oscar.gatech.edu/pls/bprod/bwckschd.p_disp_detail_sched?term_in=${term}&crn_in=${crn}`;
    const maxRetries = 30;
    const retryDelay = 5000; // 1 second

    for (let i = 0; i < maxRetries; i++) {
        try {
            const { data, status } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            if (status !== 200) {
                throw new Error(`Request failed with status ${status}`);
            }

            const $ = cheerio.load(data);

            if (data.includes("No detailed class information found")) {
                throw new Error(`CRN ${crn} not found for term ${term}.`);
            }

            const seats = {
                capacity: 0,
                actual: 0,
                remaining: 0,
            };

            const waitlist = {
                capacity: 0,
                actual: 0,
                remaining: 0,
            };

            const seatsHeader = $("th.ddlabel:contains('Seats')");
            if (seatsHeader.length) {
                const row = seatsHeader.parent();
                const cells = row.find('td.dddefault');
                seats.capacity = parseInt($(cells[0]).text(), 10) || 0;
                seats.actual = parseInt($(cells[1]).text(), 10) || 0;
                seats.remaining = parseInt($(cells[2]).text(), 10) || 0;
            }

            const waitlistHeader = $("th.ddlabel:contains('Waitlist Seats')");
            if (waitlistHeader.length) {
                const row = waitlistHeader.parent();
                const cells = row.find('td.dddefault');
                waitlist.capacity = parseInt($(cells[0]).text(), 10) || 0;
                waitlist.actual = parseInt($(cells[1]).text(), 10) || 0;
                waitlist.remaining = parseInt($(cells[2]).text(), 10) || 0;
            }

            return { seats, waitlist };
        } catch (error) {
            console.error(`Attempt ${i + 1} failed for CRN ${crn}:`, error.message);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                throw new Error(`Failed to fetch data for CRN ${crn} after ${maxRetries} attempts.`);
            }
        }
    }
}

function getCurrentTerm() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return `202602`;
    if (month >= 1 && month <= 5) {
        return `${year}02`;
    } else if (month >= 6 && month <= 7) {
        return `${year}05`;
    } else {
        return `${year}08`;
    }
}

exports.handler = async (event, context) => {
    const {
        crn,
        initialSeatsActual,
        initialSeatsCapacity,
        initialWaitlistActual,
        initialWaitlistCapacity,
        watchWaitlist
    } = event.queryStringParameters;
    const term = getCurrentTerm();

    if (!crn) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'CRN query parameter is required.' }),
        };
    }

    try {
        const availability = await checkClassAvailability(term, crn);

        // If initial values aren't provided, this is the first run for this CRN.
        // Return current availability so the client can store it.
        if (!initialSeatsActual) {
            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'initial', availability }),
            };
        }

        const iSeatsActual = parseInt(initialSeatsActual, 10);
        const iSeatsCapacity = parseInt(initialSeatsCapacity, 10);
        const watchingWaitlist = watchWaitlist === 'true';

        let status = 'closed';

        if (availability.seats.actual < iSeatsActual || availability.seats.capacity > iSeatsCapacity) {
            status = 'open';
        } else if (watchingWaitlist) {
            const iWaitlistActual = parseInt(initialWaitlistActual, 10);
            const iWaitlistCapacity = parseInt(initialWaitlistCapacity, 10);

            if (availability.waitlist.actual < iWaitlistActual || availability.waitlist.capacity > iWaitlistCapacity) {
                status = 'waitlist_open';
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ status, availability }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
