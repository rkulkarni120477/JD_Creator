/**
 * JD Creator - Frontend Application
 * Handles form submission, API calls, and JD rendering
 */

// Layout helpers come from jd-format.js, which index.html loads first
const { parseInline, jdMetadata, jdSections, jdToMarkdown } = window.JDFormat;

const SECTION_LABELS = {
    job_title: 'Job title', role_summary: 'Opening paragraph', company_overview: 'Company overview',
    project_context: 'About the project', location: 'Location', work_arrangement: 'Work arrangement',
    employment_type: 'Job type', experience: 'Experience', responsibilities: 'Key responsibilities',
    required_qualifications: 'Required qualifications', education_requirements: 'Education',
    preferred_qualifications: 'Preferred qualifications', technical_skills: 'Technical skills',
    engagement_details: 'Closing paragraph', work_environment: 'Work environment',
    compensation_and_benefits: 'Compensation and benefits', application_instructions: 'Application instructions',
    closing_statement: 'Closing paragraph',
};

function splitList(value) {
    return value ? value.split(',').map(t => t.trim()).filter(t => t) : [];
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
const qualitySection = document.getElementById('qualitySection');
const qualityContent = document.getElementById('qualityContent');
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
                technologies: splitList(formData.get('technologies')),
                experience_min: formData.get('experience_min') ? parseInt(formData.get('experience_min')) : null,
                experience_max: formData.get('experience_max') ? parseInt(formData.get('experience_max')) : null,
                location: formData.get('location') || null,
                work_arrangement: formData.get('work_arrangement') || null,
                // Checkboxes in document order keep "contract, part-time" stable regardless of click order
                employment_type: formData.getAll('employment_type').join(', ') || null,
                industry: formData.get('industry') || null,
                company_name: formData.get('company_name') || null,
                company_description: formData.get('company_description') || null,
                client_context: formData.get('client_context') || null,
                education: formData.get('education') || null,
                preferred_background: splitList(formData.get('preferred_background')),
                collaborators: splitList(formData.get('collaborators')),
                engagement_details: formData.get('engagement_details') || null,
                work_environment: formData.get('work_environment') || null,
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
    jdContent.replaceChildren();

    // Appends text with **bold** runs as <strong>, using text nodes only
    function appendRichText(parent, text) {
        parseInline(text).forEach(({ text: run, bold }) => {
            if (bold) {
                const strong = document.createElement('strong');
                strong.textContent = run;
                parent.appendChild(strong);
            } else {
                parent.appendChild(document.createTextNode(run));
            }
        });
    }

    function createSection(title, content) {
        const section = document.createElement('section');

        if (title) {
            const heading = document.createElement('h2');
            heading.textContent = `${title}:`;
            section.appendChild(heading);
        }

        if (Array.isArray(content)) {
            const ul = document.createElement('ul');
            content.forEach(item => {
                const li = document.createElement('li');
                appendRichText(li, item);
                ul.appendChild(li);
            });
            section.appendChild(ul);
        } else {
            const p = document.createElement('p');
            appendRichText(p, content);
            section.appendChild(p);
        }

        jdContent.appendChild(section);
    }

    if (jd.job_title) {
        const titleHeading = document.createElement('h1');
        titleHeading.textContent = jd.job_title;
        jdContent.appendChild(titleHeading);
    }

    // Render labelled header lines ("Location: Remote", "Job Type: Contract")
    const metadata = jdMetadata(jd);
    if (metadata.length > 0) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'jd-meta';
        metadata.forEach(({ label, value }) => {
            const item = document.createElement('div');
            item.className = 'jd-meta-item';
            const labelEl = document.createElement('div');
            labelEl.className = 'jd-meta-label';
            labelEl.textContent = label;
            const valueEl = document.createElement('div');
            valueEl.className = 'jd-meta-value';
            valueEl.textContent = value;
            item.appendChild(labelEl);
            item.appendChild(valueEl);
            metaDiv.appendChild(item);
        });
        jdContent.appendChild(metaDiv);
    }

    // Render sections in order
    jdSections(jd).forEach(([title, content]) => createSection(title, content));

    // Show results
    resultsSection.style.display = 'block';

    renderQualityWarnings(response.quality_warnings || []);

    // Render assumptions if present
    if (response.assumptions.length > 0 || response.missing_details.length > 0) {
        assumptionsContent.replaceChildren();

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

function renderQualityWarnings(warnings) {
    qualityContent.replaceChildren();
    if (warnings.length === 0) {
        qualitySection.style.display = 'none';
        return;
    }

    // Errors first: they mark text that should not be published as-is
    const ordered = [...warnings].sort((a, b) => (b.severity === 'error') - (a.severity === 'error'));
    const ul = document.createElement('ul');
    ordered.forEach(warning => {
        const li = document.createElement('li');
        li.className = warning.severity === 'error' ? 'quality-error' : 'quality-warning';
        const prefix = document.createElement('strong');
        const where = warning.section ? (SECTION_LABELS[warning.section] || warning.section) : null;
        prefix.textContent = `${warning.severity === 'error' ? 'Fix' : 'Check'}${where ? ` · ${where}` : ''}: `;
        li.appendChild(prefix);
        li.appendChild(document.createTextNode(warning.message));
        ul.appendChild(li);
    });
    qualityContent.appendChild(ul);
    qualitySection.style.display = 'block';
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
    jdContent.replaceChildren();
    assumptionsSection.style.display = 'none';
    assumptionsContent.replaceChildren();
    qualitySection.style.display = 'none';
    qualityContent.replaceChildren();
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
    errorMessage.replaceChildren();
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
