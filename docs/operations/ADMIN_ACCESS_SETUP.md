# Admin Access Setup Guide

## Overview

The admin dashboard (`admin.html`) has been removed from the public build output for security. Access is now controlled via **Cloudflare Access** (zero-trust authentication) instead of client-side password protection.

## Why This Change?

1. **Security**: Client-side password hashes in shipped code are insecure and can be extracted
2. **Zero-Trust**: Cloudflare Access provides proper authentication at the edge before requests reach your site
3. **Audit Trail**: Cloudflare Access provides built-in logging and access controls
4. **No Secrets in Code**: No authentication credentials exist in the deployed codebase

## Setup Instructions

### Step 1: Enable Cloudflare Access

1. Log into your Cloudflare dashboard
2. Navigate to **Zero Trust** → **Access** → **Applications**
3. Click **Add an application**
4. Select **Self-hosted** application type

### Step 2: Configure Application

1. **Application name**: `Admin Dashboard`
2. **Application domain**: Your Cloudflare Pages domain (e.g., `your-site.pages.dev`)
3. **Path**: `/admin.html`
4. **Session duration**: Choose appropriate (e.g., 24 hours)

### Step 3: Configure Access Policy

Create a policy that restricts access:

**Policy Name**: `Admin Dashboard Access`

**Action**: Allow

**Include**:
- **Emails**: Add your admin email addresses
- OR **Email domain**: If using a specific domain (e.g., `@yourorganization.com`)
- OR **Service tokens**: For programmatic access

**Exclude** (optional):
- Add any IP ranges or countries to block

**Example Policy**:
```
Include:
  - Emails: admin@yourdomain.com
  - Emails: support@yourdomain.com
```

### Step 4: Deploy admin.html Separately (Optional)

If you want `admin.html` to be accessible only through Cloudflare Access:

**Option A: Deploy via Cloudflare Workers** (Recommended)
- Deploy `admin.html` as a Worker route protected by Access
- This ensures it's never in the public Pages build

**Option B: Use Cloudflare Pages with Access**
- Keep `admin.html` in your repo but excluded from build
- Deploy it separately to a protected subdomain or path
- Configure Access on that specific route

**Option C: Manual Deployment** (For testing)
- Manually upload `admin.html` to Cloudflare Pages after build
- Configure Access on `/admin.html` path

### Step 5: Verify Setup

1. Try accessing `/admin.html` from an unauthenticated browser
   - Should redirect to Cloudflare Access login
2. Log in with an authorized email
   - Should see the admin dashboard
3. Check Cloudflare Access logs
   - Verify access attempts are logged

## Security Considerations

### Security Logs Protection

The admin dashboard reads security logs from `localStorage`. These logs contain sensitive information:

- **Current State**: Logs are stored in browser `localStorage` (client-side only)
- **Protection**: Since admin.html is now behind Cloudflare Access, only authenticated users can access the page that reads these logs
- **Recommendation**: Consider moving security logs to a server-side storage solution for better security

### Removing Client-Side Auth

The old client-side password hash has been removed from the codebase. If you need to reference the old implementation:

- **Old hash**: `02df0b94b9d9f720c186549225f64fe6d75123813044cdf0e58d5c51ce27748a`
- **Old password**: `Btmolly321` (now deprecated - do not use)

### Build Verification

The build script (`build.js`) has been updated to exclude `admin.html` from the public build. Verify this by:

```bash
npm run build
ls dist/ | grep admin.html  # Should return nothing
```

## Troubleshooting

### Admin page shows 404
- Verify `admin.html` is deployed (if using manual deployment)
- Check Cloudflare Pages deployment logs
- Ensure the file exists in your deployment

### Access denied even after login
- Verify your email is in the Access policy
- Check Cloudflare Access logs for policy evaluation
- Ensure the path matches exactly (`/admin.html`)

### Can't access admin from certain networks
- Check if your Access policy has IP restrictions
- Verify your network isn't blocked by Cloudflare WAF rules

## Alternative: Cloudflare Workers

For maximum security, consider deploying admin.html as a Cloudflare Worker:

1. Create a Worker that serves `admin.html`
2. Protect the Worker route with Cloudflare Access
3. This ensures admin.html is never in public Pages build

Example Worker code:
```javascript
export default {
  async fetch(request) {
    // Cloudflare Access handles authentication before this runs
    const adminHtml = await ADMIN_HTML; // From KV or module
    return new Response(adminHtml, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}
```

## Support

For Cloudflare Access setup help:
- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- [Cloudflare Community](https://community.cloudflare.com/)

