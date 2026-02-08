# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x (current)   | :white_check_mark: |
| < 0.1   | :x:                |

**Note:** We support the latest major version with security updates. Pre-1.0 versions receive security patches for the current minor version only.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

We take security seriously and appreciate responsible disclosure. If you discover a security vulnerability, please follow these steps:

### 1. Report via GitHub Security Advisories (Preferred)

1. Go to the repository's Security tab
2. Click "Report a vulnerability"
3. Fill out the private advisory form with as much detail as possible

**OR**

### 2. Report via Email

Send an email to **security@dcyfr.ai** with:

- **Subject:** `[Security] Brief description of the vulnerability`
- **Body should include:**
  - Description of the vulnerability
  - Steps to reproduce
  - Potential impact
  - Suggested fix (if you have one)
  - Your contact information for follow-up

### What to Include

Please provide as much information as possible:

- **Type of vulnerability** (e.g., injection, XSS, authentication bypass, etc.)
- **Full paths of source file(s)** related to the vulnerability
- **Location of the affected source code** (tag/branch/commit or direct URL)
- **Step-by-step instructions to reproduce** the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact of the vulnerability** including how an attacker might exploit it

## Response Timeline

- **Initial Response:** Within 24 hours of report submission
- **Triage:** Within 48 hours, we'll provide an assessment of the report
- **Fix Timeline:**
  - **Critical vulnerabilities:** 7 days
  - **High severity:** 14 days
  - **Medium severity:** 30 days
  - **Low severity:** 60 days or next release
- **Public Disclosure:** After a fix is released, we'll publish a security advisory

## Our Commitment

- We will acknowledge your email within 24 hours
- We will keep you informed of our progress throughout the resolution process
- We will credit you in the security advisory (unless you prefer to remain anonymous)
- We will handle your report with strict confidentiality

## Security Best Practices

When using DCYFR packages:

### For Application Developers

1. **Keep dependencies updated**
   ```bash
   npm audit
   npm update @dcyfr/package-name
   ```

2. **Use environment variables** for sensitive configuration
   ```typescript
   // ❌ Don't hardcode secrets
   const apiKey = "sk-abc123..."; 
   
   // ✅ Use environment variables
   const apiKey = process.env.OPENAI_API_KEY;
   ```

3. **Validate user inputs** before passing to AI agents
   ```typescript
   import { z } from 'zod';
   
   const InputSchema = z.object({
     query: z.string().max(500),
     userId: z.string().uuid()
   });
   
   const validated = InputSchema.parse(userInput);
   ```

4. **Implement rate limiting** for AI-powered endpoints
   ```typescript
   import rateLimit from 'express-rate-limit';
   
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });
   ```

5. **Enable security headers** in production
   ```typescript
   // For Next.js apps
   export const config = {
     headers: [
       {
         key: 'X-Content-Type-Options',
         value: 'nosniff'
       },
       {
         key: 'X-Frame-Options',
         value: 'DENY'
       }
     ]
   };
   ```

### For Contributors

1. **No hardcoded secrets** in code or tests
2. **Use `.env.example`** for environment variable templates
3. **Validate and sanitize** all external inputs
4. **Follow OWASP** top 10 security guidelines
5. **Run security linters** before committing

## Security Features

DCYFR packages include security-by-default features:

- ✅ **Input validation** with Zod schemas
- ✅ **Type safety** with TypeScript strict mode
- ✅ **Dependency scanning** via Dependabot/Renovate
- ✅ **Automated security updates** for vulnerabilities
- ✅ **CodeQL scanning** on all pull requests
- ✅ **Secret scanning** to prevent credential leaks
- ✅ **OWASP compliance** in API design patterns

## Attribution

We believe in recognizing security researchers who help us keep DCYFR secure. With your permission, we will:

- Credit you in the security advisory
- List you in our Hall of Fame (coming soon)
- Provide a monetary reward through our bug bounty program (once established)

## Questions?

If you have questions about this security policy, please email **security@dcyfr.ai**.

---

**Last Updated:** February 7, 2026  
**Version:** 1.0.0  
**Repository:** @dcyfr/ai
