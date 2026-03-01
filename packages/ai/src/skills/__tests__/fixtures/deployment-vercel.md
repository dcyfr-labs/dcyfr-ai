---
name: deployment-vercel
description: How to deploy applications to Vercel
tags:
  - deploy
  - vercel
  - hosting
  - ci-cd
priority: 5
trust_level: public
---

# Vercel Deployment Guide

Deploy your application to Vercel using the Vercel CLI or GitHub integration.

## Quick Start

```bash
npm i -g vercel
vercel deploy --prod
```

## Environment Variables

Set environment variables in the Vercel dashboard or via CLI:

```bash
vercel env add MY_SECRET production
```

## Build Configuration

Configure your build in `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next"
}
```

## Custom Domains

Add custom domains via the Vercel dashboard under Project Settings > Domains.
