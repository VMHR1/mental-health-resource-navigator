/**
 * Cloudflare Pages Function: Program Submission API
 * Replaces Formspree for better performance and control
 * 
 * Usage: POST /api/submit-program
 * Body: JSON with program submission data
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const allowedOrigins = new Set([
    'https://viablemhr.com',
    'http://localhost:4173',
    'http://localhost:8788',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:8788'
  ]);
  const requestOrigin = request.headers.get('Origin');
  const allowOrigin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : 'https://viablemhr.com';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (Number.isFinite(contentLength) && contentLength > 100_000) {
      return new Response(JSON.stringify({ success: false, error: 'Payload too large' }), { status: 413, headers: corsHeaders });
    }
    const data = await request.json();
    const field = (name) => (data?.[name] ?? '').toString().trim();
    const requiredFields = ['org_name', 'program_name', 'level_of_care', 'service_setting', 'admin_contact_email'];
    const missing = requiredFields.filter((name) => !field(name));
    if (missing.length > 0) {
      return new Response(JSON.stringify({ success: false, error: `Missing required fields: ${missing.join(', ')}` }), { status: 400, headers: corsHeaders });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[\d+()\-\s.]{7,25}$/;
    const isHttpUrl = (value) => {
      if (!value) return true;
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch (_) {
        return false;
      }
    };
    if (field('general_email') && !emailRegex.test(field('general_email'))) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid general_email format' }), { status: 400, headers: corsHeaders });
    }
    if (!emailRegex.test(field('admin_contact_email'))) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid admin_contact_email format' }), { status: 400, headers: corsHeaders });
    }
    if (field('general_phone') && !phoneRegex.test(field('general_phone'))) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid general_phone format' }), { status: 400, headers: corsHeaders });
    }
    if (field('intake_phone') && !phoneRegex.test(field('intake_phone'))) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid intake_phone format' }), { status: 400, headers: corsHeaders });
    }
    if (!isHttpUrl(field('website_url'))) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid website_url' }), { status: 400, headers: corsHeaders });
    }
    const minAge = Number(field('min_age'));
    const maxAge = Number(field('max_age'));
    if ((field('min_age') || field('max_age')) && (!Number.isFinite(minAge) || !Number.isFinite(maxAge) || minAge < 0 || maxAge > 120 || maxAge < minAge)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid age range' }), { status: 400, headers: corsHeaders });
    }
    let existingRateLimit = null;

    // Rate limiting check (simple IP-based)
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitKey = `submit_${clientIP}`;
    
    // Check rate limit in KV (if available)
    if (env.SUBMISSIONS_KV) {
      const rateLimit = await env.SUBMISSIONS_KV.get(rateLimitKey);
      if (rateLimit) {
        existingRateLimit = JSON.parse(rateLimit);
        const { count, resetTime } = existingRateLimit;
        if (count >= 3 && Date.now() < resetTime) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Rate limit exceeded. Please try again later.' 
            }),
            { 
              status: 429, 
              headers: corsHeaders 
            }
          );
        }
      }
    }

    // Prepare email content
    const emailSubject = `New Program Submission: ${data.program_name || data.org_name}`;
    const emailBody = formatSubmissionEmail(data);

    // Send email via external service (Resend, SendGrid, etc.)
    // Option 1: Use Resend API (recommended - free tier available)
    if (env.RESEND_API_KEY && env.NOTIFICATION_EMAIL) {
      const emailResponse = await sendEmailViaResend(
        env.RESEND_API_KEY,
        env.NOTIFICATION_EMAIL,
        emailSubject,
        emailBody,
        data.admin_contact_email || data.general_email
      );

      if (!emailResponse.ok) {
        throw new Error('Failed to send email');
      }
    }
    // Option 2: Use GitHub API to create an issue (free, no API key needed)
    else if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
      await createGitHubIssue(
        env.GITHUB_TOKEN,
        env.GITHUB_REPO,
        emailSubject,
        emailBody
      );
    }
    // Option 3: Store in KV for manual processing
    else if (env.SUBMISSIONS_KV) {
      const submissionId = `submission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await env.SUBMISSIONS_KV.put(submissionId, JSON.stringify({
        ...data,
        submittedAt: new Date().toISOString(),
        ip: clientIP
      }));
    }

    // Update rate limit
    if (env.SUBMISSIONS_KV) {
      const resetTime = Date.now() + (60 * 60 * 1000); // 1 hour
      const count = existingRateLimit ? existingRateLimit.count + 1 : 1;
      await env.SUBMISSIONS_KV.put(rateLimitKey, JSON.stringify({ count, resetTime }), {
        expirationTtl: 3600 // 1 hour
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Submission received successfully' 
      }),
      { 
        status: 200, 
        headers: corsHeaders 
      }
    );

  } catch (error) {
    console.error('Submission error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: corsHeaders 
      }
    );
  }
}

/**
 * Format submission data as email body
 */
function formatSubmissionEmail(data) {
  return `
New Program Submission

Organization: ${data.org_name || 'N/A'}
Program: ${data.program_name || 'N/A'}
Level of Care: ${data.level_of_care || 'N/A'}
Service Setting: ${data.service_setting || 'N/A'}
Age Range: ${data.min_age || ''}–${data.max_age || ''}

Location:
City: ${data.location_city || 'N/A'}
ZIP: ${data.location_zip || 'N/A'}

Contact:
Phone: ${data.general_phone || 'N/A'}
Email: ${data.general_email || 'N/A'}
Website: ${data.website_url || 'N/A'}

Admin Contact:
Name: ${data.admin_contact_name || 'N/A'}
Email: ${data.admin_contact_email || 'N/A'}

Submitted: ${data._submittedAt || new Date().toISOString()}

---
Full JSON:
${JSON.stringify(data, null, 2)}
  `.trim();
}

/**
 * Send email via Resend API
 */
async function sendEmailViaResend(apiKey, toEmail, subject, body, replyTo) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Mental Health Directory <noreply@yourdomain.com>',
      to: [toEmail],
      reply_to: replyTo,
      subject: subject,
      text: body
    })
  });

  return response;
}

/**
 * Create GitHub issue for submission
 */
async function createGitHubIssue(token, repo, title, body) {
  const [owner, repoName] = repo.split('/');
  const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: title,
      body: `\`\`\`\n${body}\n\`\`\``,
      labels: ['submission', 'review-needed']
    })
  });

  return response;
}

