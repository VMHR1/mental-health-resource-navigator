# Cloudflare Pages Setup Guide
## Quick Start for Advanced Features

## 🚀 Step 1: Enable Cloudflare Analytics (5 minutes)

1. Go to Cloudflare Dashboard → Your Site → Analytics
2. Click "Enable Web Analytics"
3. Copy the script tag provided
4. Add to `index.html` before `</head>`:

```html
<script defer src='https://static.cloudflareinsights.com/beacon.min.js' 
        data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
```

**Benefits:** Free analytics, privacy-focused, no cookies needed

---

## 📧 Step 2: Replace Formspree with Cloudflare Functions

### Option A: Use Resend (Recommended - Free tier: 3,000 emails/month)

1. Sign up at [resend.com](https://resend.com)
2. Get your API key
3. In Cloudflare Dashboard → Pages → Settings → Environment Variables:
   - Add `RESEND_API_KEY`: `re_xxxxxxxxxxxxx`
   - Add `NOTIFICATION_EMAIL`: `your-email@example.com`

4. Update `submit.html` to use new endpoint:
```javascript
// Replace Formspree endpoint
const SUBMIT_ENDPOINT = '/api/submit-program';

async function submitToFormspree(payload) {
  const res = await fetch(SUBMIT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Submission failed');
  }
  
  return res.json();
}
```

### Option B: Use GitHub Issues (Free, no API key needed)

1. Create a GitHub Personal Access Token:
   - GitHub → Settings → Developer settings → Personal access tokens
   - Generate token with `repo` scope
   
2. In Cloudflare Dashboard → Environment Variables:
   - Add `GITHUB_TOKEN`: `ghp_xxxxxxxxxxxxx`
   - Add `GITHUB_REPO`: `VMHR1/mental-health-resource-navigator`

3. Submissions will create GitHub issues automatically

### Option C: Use KV Storage (Free, manual processing)

1. In Cloudflare Dashboard → Workers & Pages → KV
2. Create namespace: `SUBMISSIONS`
3. In Pages → Settings → Functions → KV Namespaces:
   - Bind `SUBMISSIONS` to `SUBMISSIONS_KV`
4. Submissions stored in KV, you can retrieve manually

---

## 🗄️ Step 3: Set Up KV Storage (Optional)

For rate limiting and submission storage:

1. Cloudflare Dashboard → Workers & Pages → KV
2. Create namespace: `SUBMISSIONS`
3. Pages → Settings → Functions → KV Namespaces:
   - Variable name: `SUBMISSIONS_KV`
   - KV namespace: `SUBMISSIONS`

---

## ⚙️ Step 4: Environment Variables

Add these in Cloudflare Dashboard → Pages → Settings → Environment Variables:

**Production:**
- `RESEND_API_KEY` (if using Resend)
- `NOTIFICATION_EMAIL` (where to send submissions)
- `GITHUB_TOKEN` (if using GitHub issues)
- `GITHUB_REPO` (if using GitHub issues)

**Preview (for testing):**
- Same variables but with test values

---

## 🧪 Step 5: Test the Functions

1. Deploy your changes
2. Test form submission:
```bash
curl -X POST https://your-site.pages.dev/api/submit-program \
  -H "Content-Type: application/json" \
  -d '{"org_name":"Test Org","program_name":"Test Program"}'
```

3. Test programs API:
```bash
curl https://your-site.pages.dev/api/programs?city=Dallas
```

---

## 📊 Step 6: Monitor & Optimize

1. **Check Analytics:**
   - Cloudflare Dashboard → Analytics → Web Analytics
   - View visitor stats, page performance

2. **Check Function Logs:**
   - Cloudflare Dashboard → Workers & Pages → Your Site → Functions
   - View execution logs, errors, performance

3. **Monitor Rate Limits:**
   - Check KV storage for rate limit data
   - Adjust limits in function code if needed

---

## 🔒 Step 7: Security Best Practices

1. **Rate Limiting:** Already implemented in functions ✅
2. **CORS:** Configured for your domain ✅
3. **Input Validation:** Add more validation as needed
4. **API Keys:** Never commit to git, use environment variables ✅

---

## 🐛 Troubleshooting

### Function not working?
- Check function is in `functions/api/` directory
- Verify file exports `onRequestPost` or `onRequestGet`
- Check Cloudflare Dashboard → Functions logs

### Email not sending?
- Verify API key is correct
- Check Resend dashboard for errors
- Verify email address is valid

### Rate limiting too strict?
- Adjust limits in function code
- Increase `maxAttempts` or `windowMs`

---

## 📚 Next Steps

See `CLOUDFLARE_ADVANCEMENT_PLAN.md` for:
- Advanced features
- Database integration
- Performance optimizations
- More API endpoints

---

## ✅ Checklist

- [ ] Cloudflare Analytics enabled
- [ ] Functions created in `functions/api/`
- [ ] Environment variables set
- [ ] Form submission updated to use new endpoint
- [ ] Tested form submission
- [ ] Tested programs API
- [ ] KV storage set up (optional)
- [ ] Monitoring configured

---

## 💡 Tips

1. **Preview Deployments:** Every PR gets a preview URL - test there first!
2. **Local Testing:** Use `wrangler pages dev` for local function testing
3. **Error Handling:** Check function logs in Cloudflare Dashboard
4. **Performance:** Functions run at the edge - very fast!
5. **Cost:** All features mentioned are FREE on Cloudflare Pages

