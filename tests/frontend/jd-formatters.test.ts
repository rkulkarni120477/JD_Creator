// Run with: npm test. Node strips the TypeScript types natively, so jd-formatters.ts must keep type-only imports.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatJobDescriptionHtml,
  formatJobDescriptionMarkdown,
  formatJobDescriptionPlainText,
  getJobDescriptionMetadata,
  getJobDescriptionSections,
  parseInline,
  stripInline
} from '../../src/lib/jd-formatters.ts';

// Shaped like the Data Analyst reference JD
const dataAnalyst = {
  job_title: 'Data Analyst – Market Research',
  role_summary:
    'Academian is seeking a data-driven **Data Analyst** to support a market research project focused on **career readiness education courses**.',
  location: 'Remote',
  work_arrangement: 'Remote',
  employment_type: 'contract',
  experience: '2–4 years',
  responsibilities: ['Analyze survey and focus group data'],
  required_qualifications: ['2–4 years of experience in data analysis', 'Advanced Excel knowledge is mandatory'],
  education_requirements: ["Bachelor's degree in Data Science, Statistics, or a related field"],
  preferred_qualifications: ['Experience with IPEDS, BLS, EMSI or NCES datasets'],
  work_environment: ['Flexible, collaborative environment with asynchronous and remote work'],
  closing_statement: 'If you enjoy turning education data into decisions, we encourage you to apply.'
};

describe('getJobDescriptionMetadata', () => {
  it('matches the reference header: Location: Remote / Job Type: Contract, without a duplicate Remote', () => {
    assert.deepEqual(getJobDescriptionMetadata(dataAnalyst), [
      { label: 'Location', value: 'Remote' },
      { label: 'Job Type', value: 'Contract' },
      { label: 'Experience', value: '2–4 years' }
    ]);
  });

  it('joins several employment types with "or"', () => {
    const [jobType] = getJobDescriptionMetadata({ employment_type: 'contract, part-time' });
    assert.deepEqual(jobType, { label: 'Job Type', value: 'Contract or Part-time' });
  });
});

describe('getJobDescriptionSections', () => {
  const sections = getJobDescriptionSections(dataAnalyst);

  it('starts with the summary as an unheaded paragraph', () => {
    assert.equal(sections[0].heading, null);
    assert.equal(sections[0].content, dataAnalyst.role_summary);
  });

  it('leads Required Qualifications with the degree, as the reference JD does', () => {
    const required = sections.find((section) => section.heading === 'Required Qualifications');
    assert.deepEqual(required?.content, [...dataAnalyst.education_requirements, ...dataAnalyst.required_qualifications]);
    assert.ok(!sections.some((section) => section.heading === 'Education'));
  });

  it('merges engagement details into the closing paragraph', () => {
    const closing = getJobDescriptionSections({
      ...dataAnalyst,
      engagement_details: 'This is a contract or part-time opportunity, with flexible hours based on project needs.'
    }).at(-1);
    assert.equal(closing?.heading, null);
    assert.match(String(closing?.content), /^This is a contract or part-time opportunity.* If you enjoy/);
  });
});

describe('inline emphasis', () => {
  it('parses and strips **bold** runs', () => {
    assert.deepEqual(parseInline('a **Data Analyst** role'), [
      { text: 'a ', bold: false },
      { text: 'Data Analyst', bold: true },
      { text: ' role', bold: false }
    ]);
    assert.equal(stripInline('a **Data Analyst** role'), 'a Data Analyst role');
  });
});

describe('text formats', () => {
  it('plain text uses labelled lines and no markdown', () => {
    const text = formatJobDescriptionPlainText(dataAnalyst);
    assert.ok(text.startsWith('Data Analyst – Market Research\n\nLocation: Remote\nJob Type: Contract\n'));
    assert.ok(text.includes('Key Responsibilities:\n• Analyze survey'));
    assert.ok(!text.includes('**'));
  });

  it('markdown keeps emphasis and labelled header lines', () => {
    const markdown = formatJobDescriptionMarkdown(dataAnalyst);
    assert.ok(markdown.includes('**Location:** Remote  \n**Job Type:** Contract'));
    assert.ok(markdown.includes('**career readiness education courses**'));
  });

  it('HTML escapes model text and renders bold runs as <strong>', () => {
    const html = formatJobDescriptionHtml({ ...dataAnalyst, closing_statement: 'Apply <script>x</script> & join' });
    assert.ok(html.includes('<strong>Data Analyst</strong>'));
    assert.ok(html.includes('Apply &lt;script&gt;x&lt;/script&gt; &amp; join'));
    assert.ok(!html.includes('<script>'));
  });
});
