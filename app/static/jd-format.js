/**
 * JD layout shared by the page (app.js) and the Node tests (tests/test_frontend.js).
 * Keep in step with src/lib/jd-formatters.ts, which renders the same layout for the Next.js UI.
 */
(function (root) {
    const ARRANGEMENT_LABELS = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site', 'on-site': 'On-site' };
    const EMPLOYMENT_LABELS = {
        'full-time': 'Full-time', fulltime: 'Full-time',
        'part-time': 'Part-time', parttime: 'Part-time',
        contract: 'Contract',
    };

    /** Split text into [{text, bold}] runs; the model marks emphasis with **double asterisks**. */
    function parseInline(text) {
        return text
            .split(/(\*\*[^*]+\*\*)/g)
            .filter(Boolean)
            .map(part => (part.startsWith('**') && part.endsWith('**') && part.length > 4
                ? { text: part.slice(2, -2), bold: true }
                : { text: part, bold: false }));
    }

    /** "contract, part-time" -> "Contract or Part-time"; prose the model already wrote is kept as-is. */
    function formatEmploymentType(value) {
        const parts = value.split(/\s*,\s*/).filter(Boolean);
        if (!parts.every(part => part.toLowerCase() in EMPLOYMENT_LABELS)) return value;
        return parts.map(part => EMPLOYMENT_LABELS[part.toLowerCase()]).join(' or ');
    }

    /** Labelled header lines: [{label, value}], as in "Location: Remote" / "Job Type: Contract". */
    function jdMetadata(jd) {
        const items = [];
        if (jd.location) items.push({ label: 'Location', value: jd.location });
        if (jd.work_arrangement) {
            const arrangement = ARRANGEMENT_LABELS[jd.work_arrangement.toLowerCase()] || jd.work_arrangement;
            if (!(jd.location || '').toLowerCase().includes(arrangement.toLowerCase())) {
                items.push({ label: 'Work Arrangement', value: arrangement });
            }
        }
        if (jd.employment_type) items.push({ label: 'Job Type', value: formatEmploymentType(jd.employment_type) });
        if (jd.experience) items.push({ label: 'Experience', value: jd.experience });
        return items;
    }

    /** Ordered, non-empty [heading, content] pairs; a null heading renders as a bare paragraph. */
    function jdSections(jd) {
        const isPreferred = item => /\bprefer/i.test(item);
        const education = jd.education_requirements || [];
        const required = [...education.filter(item => !isPreferred(item)), ...(jd.required_qualifications || [])];
        const preferred = [...education.filter(isPreferred), ...(jd.preferred_qualifications || [])];
        const closing = [jd.engagement_details, jd.closing_statement].filter(Boolean).join(' ');

        return [
            [null, jd.role_summary],
            ['Company Overview', jd.company_overview],
            ['About the Project', jd.project_context],
            ['Key Responsibilities', jd.responsibilities],
            ['Required Qualifications', required],
            ['Preferred Qualifications', preferred],
            ['Technical Skills', jd.technical_skills],
            ['Work Environment', jd.work_environment],
            ['Compensation and Benefits', jd.compensation_and_benefits],
            ['Application Instructions', jd.application_instructions],
            [null, closing],
        ].filter(([, content]) => content && !(Array.isArray(content) && content.length === 0));
    }

    /** Markdown for copy and download. Excludes assumptions, missing details and quality warnings. */
    function jdToMarkdown(jd) {
        const lines = [];

        if (jd.job_title) {
            lines.push(`# ${jd.job_title}`, '');
        }

        const metadata = jdMetadata(jd);
        if (metadata.length > 0) {
            // Two trailing spaces force a line break between header lines
            lines.push(metadata.map(({ label, value }) => `**${label}:** ${value}`).join('  \n'), '');
        }

        jdSections(jd).forEach(([title, content]) => {
            if (title) lines.push(`## ${title}`);
            if (Array.isArray(content)) {
                content.forEach(item => lines.push(`- ${item}`));
            } else {
                lines.push(content);
            }
            lines.push('');
        });

        return lines.join('\n').trim();
    }

    const api = { parseInline, jdMetadata, jdSections, jdToMarkdown };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.JDFormat = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
