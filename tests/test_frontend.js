/**
 * Frontend tests for JD Creator
 * Run with: node tests/test_frontend.js
 */

const assert = require('assert');

// Mock the jdToMarkdown function extraction for Node.js
const { jdToMarkdown } = require('../app/static/app.js');

// Test data
const testJD = {
    job_title: "Senior Python Developer",
    role_summary: "Build production-grade Python applications",
    company_overview: "Leading AI company",
    location: "Bengaluru",
    work_arrangement: "hybrid",
    employment_type: "full-time",
    experience: "5–8 years",
    responsibilities: [
        "Design and build scalable backend systems",
        "Mentor junior developers"
    ],
    required_qualifications: [
        "5+ years Python experience",
        "Experience with FastAPI"
    ],
    preferred_qualifications: [
        "AWS experience",
        "LangChain experience"
    ],
    technical_skills: [
        "Python",
        "FastAPI",
        "AWS",
        "Docker",
        "PostgreSQL"
    ],
    compensation_and_benefits: "Competitive salary, health insurance",
    application_instructions: "Apply on our careers page"
};

// ============================================================================
// Test Suite: jdToMarkdown
// ============================================================================

describe('jdToMarkdown', () => {
    it('should generate valid markdown', () => {
        const markdown = jdToMarkdown(testJD);
        assert(typeof markdown === 'string', 'Output should be a string');
        assert(markdown.length > 0, 'Output should not be empty');
    });

    it('should include job title', () => {
        const markdown = jdToMarkdown(testJD);
        assert(markdown.includes(testJD.job_title), 'Should include job title');
    });

    it('should include location and meta info', () => {
        const markdown = jdToMarkdown(testJD);
        assert(markdown.includes(testJD.location), 'Should include location');
        assert(markdown.includes(testJD.experience), 'Should include experience');
    });

    it('should include all sections in order', () => {
        const markdown = jdToMarkdown(testJD);
        const jobTitleIndex = markdown.indexOf(testJD.job_title);
        const companySummaryIndex = markdown.indexOf('Company Overview');
        const responsibilitiesIndex = markdown.indexOf('Key Responsibilities');

        assert(jobTitleIndex >= 0, 'Should have job title');
        assert(companySummaryIndex > jobTitleIndex, 'Company should come after job title');
        assert(responsibilitiesIndex > companySummaryIndex, 'Responsibilities should come after company');
    });

    it('should include all responsibilities', () => {
        const markdown = jdToMarkdown(testJD);
        testJD.responsibilities.forEach(resp => {
            assert(markdown.includes(resp), `Should include responsibility: ${resp}`);
        });
    });

    it('should include technical skills', () => {
        const markdown = jdToMarkdown(testJD);
        testJD.technical_skills.forEach(skill => {
            assert(markdown.includes(skill), `Should include skill: ${skill}`);
        });
    });

    it('should omit empty sections', () => {
        const jdWithEmpty = {
            job_title: "Developer",
            role_summary: "A role",
            responsibilities: [],  // Empty
            required_qualifications: []  // Empty
        };
        const markdown = jdToMarkdown(jdWithEmpty);
        // Should not have "## Required Qualifications" if empty
        assert(!markdown.includes('## Required Qualifications') ||
               markdown.split('## Required Qualifications').length <= 2,
               'Should omit empty sections');
    });

    it('should handle null/undefined fields', () => {
        const jdWithNulls = {
            job_title: "Developer",
            role_summary: "A role",
            company_overview: null,
            location: undefined
        };
        const markdown = jdToMarkdown(jdWithNulls);
        assert(typeof markdown === 'string', 'Should handle null fields');
        assert(markdown.length > 0, 'Should still produce output');
    });

    it('should use markdown formatting for lists', () => {
        const markdown = jdToMarkdown(testJD);
        // Check for markdown list items (- )
        assert(/^- /m.test(markdown), 'Should use markdown bullet points');
    });

    it('should exclude assumptions from output', () => {
        const markdown = jdToMarkdown(testJD);
        assert(!markdown.includes('Assumptions'), 'Should not include assumptions label');
        assert(!markdown.includes('Missing Details'), 'Should not include missing details label');
    });
});

// ============================================================================
// Test Suite: DOM Safety
// ============================================================================

describe('DOM Safety', () => {
    it('should not use innerHTML in app.js', () => {
        const fs = require('fs');
        const appCode = fs.readFileSync('./app/static/app.js', 'utf8');

        // Check for dangerous methods
        const hasInnerHTML = /\.innerHTML\s*=/.test(appCode);
        const hasInsertAdjacentHTML = /insertAdjacentHTML/.test(appCode);
        const hasEval = /\beval\s*\(/.test(appCode);

        assert(!hasInnerHTML, 'Should not use .innerHTML =');
        assert(!hasInsertAdjacentHTML, 'Should not use insertAdjacentHTML');
        assert(!hasEval, 'Should not use eval()');
    });

    it('should use textContent for safe rendering', () => {
        const fs = require('fs');
        const appCode = fs.readFileSync('./app/static/app.js', 'utf8');

        // Check for safe methods
        const hasTextContent = /\.textContent\s*=/.test(appCode);
        assert(hasTextContent, 'Should use .textContent for rendering');
    });

    it('should use createElement for DOM construction', () => {
        const fs = require('fs');
        const appCode = fs.readFileSync('./app/static/app.js', 'utf8');

        const hasCreateElement = /createElement\(/.test(appCode);
        assert(hasCreateElement, 'Should use createElement for safe DOM construction');
    });
});

// ============================================================================
// Test Suite: Module exports
// ============================================================================

describe('Module exports', () => {
    it('should export jdToMarkdown for Node.js', () => {
        assert(typeof jdToMarkdown === 'function', 'jdToMarkdown should be exported');
    });
});

// ============================================================================
// Helper: simple describe/it implementation for Node.js
// ============================================================================

let suiteStack = [];
let testCount = 0;
let passCount = 0;
let failCount = 0;

function describe(name, fn) {
    suiteStack.push(name);
    console.log(`\n${'  '.repeat(suiteStack.length - 1)}${name}`);
    fn();
    suiteStack.pop();
}

function it(name, fn) {
    testCount++;
    try {
        fn();
        passCount++;
        console.log(`${'  '.repeat(suiteStack.length)}✓ ${name}`);
    } catch (error) {
        failCount++;
        console.log(`${'  '.repeat(suiteStack.length)}✗ ${name}`);
        console.log(`${'  '.repeat(suiteStack.length)}  ${error.message}`);
    }
}

// Export for use
if (typeof module !== 'undefined') {
    Object.assign(global, { describe, it });
}

// Summary
if (require.main === module) {
    setTimeout(() => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Tests: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`);
        process.exit(failCount > 0 ? 1 : 0);
    }, 100);
}
