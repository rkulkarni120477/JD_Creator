/**
 * JD Creator - Frontend Application
 * Handles form submission, API calls, and JD rendering
 */

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert a JobDescription object to Markdown format.
 * Excludes internal metadata and assumptions.
 */
function jdToMarkdown(jd) {
    const lines = [];

    if (jd.job_title) {
        lines.push(`# ${jd.job_title}`);
        lines.push('');
    }

    // Meta information
    const metaLines = [];
    if (jd.location) metaLines.push(jd.location);
    if (jd.work_arrangement) metaLines.push(jd.work_arrangement);
    if (jd.employment_type) metaLines.push(jd.employment_type);
    if (jd.experience) metaLines.push(`${jd.experience} experience`);
    if (metaLines.length > 0) {
        lines.push(`*${metaLines.join(' • ')}*`);
        lines.push('');
    }

    if (jd.company_overview) {
        lines.push('## Company Overview');
        lines.push(jd.company_overview);
        lines.push('');
    }

    if (jd.role_summary) {
        lines.push('## Role Summary');
        lines.push(jd.role_summary);
        lines.push('');
    }

    if (jd.responsibilities && jd.responsibilities.length > 0) {
        lines.push('## Key Responsibilities');
        jd.responsibilities.forEach(r => lines.push(`- ${r}`));
        lines.push('');
    }

    if (jd.required_qualifications && jd.required_qualifications.length > 0) {
        lines.push('## Required Qualifications');
        jd.required_qualifications.forEach(q => lines.push(`- ${q}`));
        lines.push('');
    }

    if (jd.preferred_qualifications && jd.preferred_qualifications.length > 0) {
        lines.push('## Preferred Qualifications');
        jd.preferred_qualifications.forEach(q => lines.push(`- ${q}`));
        lines.push('');
    }

    if (jd.technical_skills && jd.technical_skills.length > 0) {
        lines.push('## Technical Skills');
        jd.technical_skills.forEach(s => lines.push(`- ${s}`));
        lines.push('');
    }

    if (jd.compensation_and_benefits) {
        lines.push('## Compensation and Benefits');
        lines.push(jd.compensation_and_benefits);
        lines.push('');
    }

    if (jd.application_instructions) {
        lines.push('## Application Instructions');
        lines.push(jd.application_instructions);
        lines.push('');
    }

    return lines.join('\n').trim();
}

// For testing: expose to global scope (CommonJS / Node.js)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { jdToMarkdown };
}

// ============================================================================
// DOM References
// ============================================================================

const generateForm = document.getElementById('generateForm');
const promptInput = document.getElementById('prompt');
const submitBtn = document.getElementById('submitBtn');
const statusMessage = document.getElementById('statusMessage');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const jdContent = document.getElementById('jdContent');
const assumptionsSection = document.getElementById('assumptionsSection');
const assumptionsContent = document.getElementById('assumptionsContent');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const regenerateBtn = document.getElementById('regenerateBtn');
const clearBtn = document.getElementById('clearBtn');

let currentResponse = null;

// ============================================================================
// Example Prompts
// ============================================================================

document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        e.preventDefault();
        const example = chip.getAttribute('data-example');
        promptInput.value = example;
        promptInput.focus();
    });
});

// ============================================================================
// Form Submission
// ============================================================================

generateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await generateJD();
});

async function generateJD() {
    // Clear previous errors
    clearMessages();

    // Validate form
    if (!generateForm.checkValidity()) {
        generateForm.reportValidity();
        return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    showStatus('Creating your job description…');

    try {
        // Build request
        const formData = new FormData(generateForm);
        const request = {
            prompt: formData.get('prompt'),
            details: {
                job_title: formData.get('job_title') || null,
                technologies: formData.get('technologies')
                    ? formData.get('technologies').split(',').map(t => t.trim()).filter(t => t)
                    : [],
                experience_min: formData.get('experience_min') ? parseInt(formData.get('experience_min')) : null,
                experience_max: formData.get('experience_max') ? parseInt(formData.get('experience_max')) : null,
                location: formData.get('location') || null,
                work_arrangement: formData.get('work_arrangement') || null,
                employment_type: formData.get('employment_type') || null,
                industry: formData.get('industry') || null,
                company_name: formData.get('company_name') || null,
                company_description: formData.get('company_description') || null,
            },
            tone: formData.get('tone'),
        };

        // Make API call
        const response = await fetch('/api/jd/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw {
                status: response.status,
                error_code: errorData.error_code || 'UNKNOWN_ERROR',
                message: errorData.message || 'An error occurred',
                request_id: errorData.request_id || '',
            };
        }

        currentResponse = await response.json();
        renderJD(currentResponse);
        hideStatus();

    } catch (error) {
        console.error('Error generating JD:', error);
        let message = 'An unexpected error occurred';
        let requestId = '';

        if (error.message && error.error_code) {
            message = error.message;
            requestId = error.request_id;
        } else if (error instanceof TypeError) {
            message = 'Network error. Please check your connection and try again.';
        }

        showError(message, requestId);

    } finally {
        submitBtn.disabled = false;
        submitBtn.setAttribute('aria-busy', 'false');
    }
}

// ============================================================================
// Rendering
// ============================================================================

function renderJD(response) {
    const jd = response.job_description;

    // Clear content
    jdContent.innerHTML = '';

    // Helper to safely add text content
    function createSection(title, content) {
        if (!content) return;
        if (Array.isArray(content) && content.length === 0) return;

        const section = document.createElement('section');

        if (title) {
            const heading = document.createElement(title === jd.job_title ? 'h1' : 'h2');
            heading.textContent = title;
            section.appendChild(heading);
        }

        if (Array.isArray(content)) {
            const ul = document.createElement('ul');
            content.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                ul.appendChild(li);
            });
            section.appendChild(ul);
        } else {
            const p = document.createElement('p');
            p.textContent = content;
            section.appendChild(p);
        }

        jdContent.appendChild(section);
    }

    // Render metadata
    if (jd.location || jd.work_arrangement || jd.employment_type || jd.experience) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'jd-meta';

        if (jd.location) {
            const item = document.createElement('div');
            item.className = 'jd-meta-item';
            const label = document.createElement('div');
            label.className = 'jd-meta-label';
            label.textContent = 'Location';
            const value = document.createElement('div');
            value.className = 'jd-meta-value';
            value.textContent = jd.location;
            item.appendChild(label);
            item.appendChild(value);
            metaDiv.appendChild(item);
        }

        if (jd.work_arrangement) {
            const item = document.createElement('div');
            item.className = 'jd-meta-item';
            const label = document.createElement('div');
            label.className = 'jd-meta-label';
            label.textContent = 'Work Arrangement';
            const value = document.createElement('div');
            value.className = 'jd-meta-value';
            value.textContent = jd.work_arrangement;
            item.appendChild(label);
            item.appendChild(value);
            metaDiv.appendChild(item);
        }

        if (jd.employment_type) {
            const item = document.createElement('div');
            item.className = 'jd-meta-item';
            const label = document.createElement('div');
            label.className = 'jd-meta-label';
            label.textContent = 'Employment Type';
            const value = document.createElement('div');
            value.className = 'jd-meta-value';
            value.textContent = jd.employment_type;
            item.appendChild(label);
            item.appendChild(value);
            metaDiv.appendChild(item);
        }

        if (jd.experience) {
            const item = document.createElement('div');
            item.className = 'jd-meta-item';
            const label = document.createElement('div');
            label.className = 'jd-meta-label';
            label.textContent = 'Experience';
            const value = document.createElement('div');
            value.className = 'jd-meta-value';
            value.textContent = jd.experience;
            item.appendChild(label);
            item.appendChild(value);
            metaDiv.appendChild(item);
        }

        jdContent.appendChild(metaDiv);
    }

    // Render sections in order
    createSection(jd.job_title, null);
    createSection('Company Overview', jd.company_overview);
    createSection('Role Summary', jd.role_summary);
    createSection('Key Responsibilities', jd.responsibilities);
    createSection('Required Qualifications', jd.required_qualifications);
    createSection('Preferred Qualifications', jd.preferred_qualifications);
    createSection('Technical Skills', jd.technical_skills);
    createSection('Compensation and Benefits', jd.compensation_and_benefits);
    createSection('Application Instructions', jd.application_instructions);

    // Show results
    resultsSection.style.display = 'block';

    // Render assumptions if present
    if (response.assumptions.length > 0 || response.missing_details.length > 0) {
        assumptionsContent.innerHTML = '';

        if (response.assumptions.length > 0) {
            const h4 = document.createElement('h4');
            h4.textContent = 'Assumptions Made';
            assumptionsContent.appendChild(h4);
            const ul = document.createElement('ul');
            response.assumptions.forEach(assumption => {
                const li = document.createElement('li');
                li.textContent = assumption;
                ul.appendChild(li);
            });
            assumptionsContent.appendChild(ul);
        }

        if (response.missing_details.length > 0) {
            const h4 = document.createElement('h4');
            h4.textContent = 'Missing Details';
            assumptionsContent.appendChild(h4);
            const ul = document.createElement('ul');
            response.missing_details.forEach(detail => {
                const li = document.createElement('li');
                li.textContent = detail;
                ul.appendChild(li);
            });
            assumptionsContent.appendChild(ul);
        }

        assumptionsSection.style.display = 'block';
    } else {
        assumptionsSection.style.display = 'none';
    }

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================================
// Actions
// ============================================================================

copyBtn.addEventListener('click', async () => {
    if (!currentResponse) return;

    const markdown = jdToMarkdown(currentResponse.job_description);

    try {
        await navigator.clipboard.writeText(markdown);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = markdown;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    }
});

downloadBtn.addEventListener('click', () => {
    if (!currentResponse) return;

    const markdown = jdToMarkdown(currentResponse.job_description);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jd_${currentResponse.job_description.job_title || 'job'}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

regenerateBtn.addEventListener('click', async () => {
    await generateJD();
});

clearBtn.addEventListener('click', () => {
    generateForm.reset();
    resultsSection.style.display = 'none';
    jdContent.innerHTML = '';
    assumptionsSection.style.display = 'none';
    assumptionsContent.innerHTML = '';
    currentResponse = null;
    clearMessages();
    promptInput.focus();
});

// ============================================================================
// Message Utilities
// ============================================================================

function showStatus(message) {
    statusMessage.textContent = message;
    statusMessage.classList.add('visible');
}

function hideStatus() {
    statusMessage.classList.remove('visible');
    statusMessage.textContent = '';
}

function showError(message, requestId = '') {
    let content = message;
    if (requestId) {
        content += `\n(Request ID: ${requestId})`;
    }
    errorMessage.innerHTML = '';
    errorMessage.textContent = content;
    errorMessage.classList.add('visible');
}

function clearMessages() {
    hideStatus();
    errorMessage.classList.remove('visible');
    errorMessage.textContent = '';
}

// ============================================================================
// Keyboard Navigation
// ============================================================================

document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+Enter to submit form
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && generateForm.contains(e.target)) {
        generateForm.dispatchEvent(new Event('submit'));
    }
});

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    promptInput.focus();
});
