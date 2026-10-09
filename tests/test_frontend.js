/**
 * Tests for the FastAPI-served UI (app/static). Run with: npm test  (or: node --test tests/test_frontend.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseInline, jdMetadata, jdSections, jdToMarkdown } = require('../app/static/jd-format.js');

const STATIC_DIR = path.join(__dirname, '..', 'app', 'static');

// Shaped like the Business Analyst reference JD
const baJD = {
    job_title: 'Business Analyst',
    role_summary: 'Academian is seeking a detail-oriented **Business Analyst** to support an initiative to streamline and modernize their client\'s content pipeline.',
    location: 'Remote',
    work_arrangement: 'remote',
    employment_type: 'contract, part-time',
    experience: '5+ years',
    responsibilities: ['Conduct structured interviews with stakeholders', 'Develop clear, structured documentation'],
    required_qualifications: ['5+ years of experience as a Business Analyst'],
    education_requirements: ["Bachelor's degree in Information Systems (preferred)"],
    preferred_qualifications: ['Experience with taxonomies and metadata models'],
    engagement_details: 'This is a contract or part-time opportunity, with flexible hours based on project needs.',
    closing_statement: 'If you enjoy modernizing content operations, we encourage you to apply.',
};

describe('jdMetadata', () => {
    it('produces labelled header lines and drops a work arrangement the location already states', () => {
        assert.deepEqual(jdMetadata(baJD), [
            { label: 'Location', value: 'Remote' },
            { label: 'Job Type', value: 'Contract or Part-time' },
            { label: 'Experience', value: '5+ years' },
        ]);
    });

    it('keeps a distinct work arrangement and prose employment types', () => {
        const items = jdMetadata({ location: 'Bengaluru', work_arrangement: 'hybrid', employment_type: 'Full-time (permanent)' });
        assert.deepEqual(items, [
            { label: 'Location', value: 'Bengaluru' },
            { label: 'Work Arrangement', value: 'Hybrid' },
            { label: 'Job Type', value: 'Full-time (permanent)' },
        ]);
    });
});

describe('jdSections', () => {
    it('opens with an unheaded summary and ends with engagement terms plus the closing', () => {
        const sections = jdSections(baJD);
        assert.equal(sections[0][0], null);
        assert.match(sections[0][1], /^Academian is seeking/);

        const [heading, closing] = sections[sections.length - 1];
        assert.equal(heading, null);
        assert.equal(closing, `${baJD.engagement_details} ${baJD.closing_statement}`);
        assert.ok(!sections.some(([title]) => title === 'Engagement Details' || title === 'Education'));
    });

    it('places education at the top of the matching qualifications list', () => {
        const sections = Object.fromEntries(jdSections({
            ...baJD,
            education_requirements: ["Bachelor's degree in Statistics", "Master's degree preferred"],
        }));
        assert.equal(sections['Required Qualifications'][0], "Bachelor's degree in Statistics");
        assert.equal(sections['Preferred Qualifications'][0], "Master's degree preferred");
    });

    it('omits empty and missing sections', () => {
        const titles = jdSections({ job_title: 'Developer', role_summary: 'A role', responsibilities: [], company_overview: null })
            .map(([title]) => title);
        assert.deepEqual(titles, [null]);
    });
});

describe('parseInline', () => {
    it('splits **bold** runs and leaves stray asterisks as text', () => {
        assert.deepEqual(parseInline('a **Data Analyst** for * reasons'), [
            { text: 'a ', bold: false },
            { text: 'Data Analyst', bold: true },
            { text: ' for * reasons', bold: false },
        ]);
    });
});

describe('jdToMarkdown', () => {
    const markdown = jdToMarkdown(baJD);

    it('renders the title, labelled header and sections in reference-JD order', () => {
        assert.ok(markdown.startsWith('# Business Analyst\n\n**Location:** Remote  \n**Job Type:** Contract or Part-time'));
        const order = ['Academian is seeking', '## Key Responsibilities', '## Required Qualifications', '## Preferred Qualifications', 'This is a contract'];
        const positions = order.map(text => markdown.indexOf(text));
        assert.ok(positions.every(pos => pos >= 0), `missing one of ${order}`);
        assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    });

    it('keeps bold markers and excludes assumptions', () => {
        assert.ok(markdown.includes('**Business Analyst**'));
        assert.ok(!markdown.includes('Assumptions') && !markdown.includes('Missing Details'));
    });
});

describe('DOM safety', () => {
    const appCode = fs.readFileSync(path.join(STATIC_DIR, 'app.js'), 'utf8');

    it('never assigns HTML strings or evaluates code', () => {
        assert.ok(!/\.innerHTML\s*=/.test(appCode), 'Should not use .innerHTML =');
        assert.ok(!/insertAdjacentHTML/.test(appCode), 'Should not use insertAdjacentHTML');
        assert.ok(!/\beval\s*\(/.test(appCode), 'Should not use eval()');
    });

    it('builds the DOM with createElement and text nodes', () => {
        assert.ok(/createElement\(/.test(appCode));
        assert.ok(/createTextNode\(/.test(appCode));
    });
});

describe('index.html', () => {
    const html = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');

    it('has an input for every JobDetails field the reference JDs need', () => {
        for (const name of ['client_context', 'education', 'preferred_background', 'collaborators', 'engagement_details', 'work_environment', 'tone']) {
            assert.ok(html.includes(`name="${name}"`), `missing input ${name}`);
        }
        assert.equal((html.match(/type="checkbox" name="employment_type"/g) || []).length, 3);
    });

    it('loads jd-format.js before app.js and has a quality-warnings area', () => {
        assert.ok(html.indexOf('/jd-format.js') < html.indexOf('/app.js'));
        assert.ok(html.includes('id="qualitySection"'));
    });
});
