const axios = require('axios');
const cheerio = require('cheerio');

async function getSections(term, subject, course) {
    const url = `https://oscar.gatech.edu/bprod/bwckctlg.p_disp_listcrse?term_in=${term}&subj_in=${subject}&crse_in=${course}&schd_in=%`;
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const sections = [];

        if (data.includes("No courses found")) {
            return sections;
        }

        $('th.ddtitle a').each((i, el) => {
            const linkText = $(el).text();
            const parts = linkText.split(' - ');
            if (parts.length >= 4) {
                const crn = parts[1];
                const section = parts[3];
                sections.push({
                    crn: crn.trim(),
                    section: section.trim(),
                    name: linkText.trim()
                });
            }
        });

        return sections;
    } catch (error) {
        console.error(`Failed to fetch sections for ${subject} ${course}:`, error.message);
        throw new Error(`Failed to fetch sections for ${subject} ${course}.`);
    }
}


async function checkClassAvailability(term, crn) {
    const url = `https://gt-scheduler.azurewebsites.net/proxy/class_section?term=${term}&crn=${crn}`;
    const maxRetries = 100;
    const retryDelay = 5000; // 5 seconds

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

            const seats = { capacity: 0, actual: 0, remaining: 0 };
            const waitlist = { capacity: 0, actual: 0, remaining: 0 };

            const enrollmentInfo = $('section[aria-labelledby="enrollmentInfo"]');

            if (enrollmentInfo.length > 0) {
                const spans = enrollmentInfo.find('span');

                spans.each(function(index) {
                    const text = $(this).text().trim();
                    const nextSpan = $(this).next('span[dir="ltr"]');
                    if (nextSpan.length > 0) {
                        const value = parseInt(nextSpan.text().trim(), 10);
                        if (!isNaN(value)) {
                            if (text.includes('Enrollment Actual:')) seats.actual = value;
                            else if (text.includes('Enrollment Maximum:')) seats.capacity = value;
                            else if (text.includes('Enrollment Seats Available:')) seats.remaining = value;
                            else if (text.includes('Waitlist Capacity:')) waitlist.capacity = value;
                            else if (text.includes('Waitlist Actual:')) waitlist.actual = value;
                            else if (text.includes('Waitlist Seats Available:')) waitlist.remaining = value;
                        }
                    }
                });

            } else {
                 throw new Error(`CRN ${crn} not found for term ${term}.`);
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
    return `202608`;
}

exports.handler = async (event, context) => {
    const {
        crn,
        subject,
        course,
        initialSeatsActual,
        initialSeatsCapacity,
        initialWaitlistActual,
        initialWaitlistCapacity,
        watchWaitlist,
        strictMode
    } = event.queryStringParameters;
    const term = getCurrentTerm();

    if (subject && course) {
        try {
            const sections = await getSections(term, subject, course);
            return {
                statusCode: 200,
                body: JSON.stringify(sections),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: error.message }),
            };
        }
    }

    if (!crn) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'CRN or Subject/Course query parameters are required.' }),
        };
    }

    try {
        const availability = await checkClassAvailability(term, crn);

        if (!initialSeatsActual) {
            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'initial', availability }),
            };
        }

        const iSeatsActual = parseInt(initialSeatsActual, 10);
        const iWaitlistActual = parseInt(initialWaitlistActual, 10);
        const watchingWaitlist = watchWaitlist === 'true';
        const beStrict = strictMode === 'true';

        let status = 'closed';

        if (beStrict) {
            if (availability.seats.actual < iSeatsActual) {
                status = 'open';
            }
        } else {
            if (availability.seats.remaining > 0) {
                status = 'open';
            }
        }

        if (status !== 'open' && !beStrict && watchingWaitlist && (availability.waitlist.actual < iWaitlistActual)) {
            status = 'waitlist_open';
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
