# Deployment Guide

## Regional Strategy for ChatGPT Latency

### Recommended Regions

Based on OpenAI's 2025 announcement that ChatGPT uses Google Cloud infrastructure:

**Primary Region: `us-central1` (Iowa, USA)**
- Lowest latency to ChatGPT infrastructure
- OpenAI uses Google Cloud in US for ChatGPT
- Cost-effective

**Secondary Region: `europe-west4` (Netherlands)**
- For European users
- OpenAI has infrastructure in Netherlands
- Compliance with EU data regulations

**Not Recommended: `europe-west3` (Frankfurt)**
- Higher latency than Netherlands for ChatGPT users
- No OpenAI infrastructure in Germany

### Multi-Region Deployment (Future)

For global scale:
1. Deploy to `us-central1` (Americas, Asia)
2. Deploy to `europe-west4` (Europe, Africa)
3. Use Cloud Load Balancing to route based on user location

## Deployment Methods

### Method 1: Direct Source Deployment (Recommended)

Simplest method - Cloud Run builds from source automatically:

```bash
# Staging deployment
gcloud run deploy protime-mcp-staging \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=staging,FIREBASE_PROJECT_ID=protime-summi \
  --set-secrets JWT_SECRET=jwt-secret:latest,SESSION_SECRET=session-secret:latest \
  --project protime-summi

# Production deployment
gcloud run deploy protime-mcp-prod \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,FIREBASE_PROJECT_ID=protime-summi \
  --set-secrets JWT_SECRET=jwt-secret:latest,SESSION_SECRET=session-secret:latest \
  --min-instances 1 \
  --max-instances 100 \
  --cpu 2 \
  --memory 1Gi \
  --project protime-summi
```

**Pros**:
- No `cloudbuild.yaml` needed
- Simple one-command deployment
- Cloud Run handles build caching
- Perfect for Node.js/TypeScript apps

**Cons**:
- Less control over build process
- Can't inject custom build steps

### Method 2: Cloud Build with cloudbuild.yaml

For more control over the build process:

```bash
# First, create Artifact Registry repository
gcloud artifacts repositories create protime-mcp \
  --repository-format=docker \
  --location=europe-west3 \
  --project=protime-summi

# Submit build
gcloud builds submit \
  --config=cloudbuild.yaml \
  --region=europe-west3 \
  --project=protime-summi

# Deploy the built image
gcloud run deploy protime-mcp-prod \
  --image europe-west3-docker.pkg.dev/protime-summi/protime-mcp/protime-mcp:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets JWT_SECRET=jwt-secret:latest,SESSION_SECRET=session-secret:latest \
  --project protime-summi
```

**Pros**:
- Full control over build steps
- Can inject environment variables during build
- Build caching and optimization
- Matches summi-cloud deployment pattern

**Cons**:
- More complex
- Need to manage Artifact Registry
- Separate build and deploy steps

## Secret Management

### Create Secrets in Secret Manager

```bash
# Generate secure secrets
SESSION_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)

# Create secrets in Secret Manager
echo -n "$SESSION_SECRET" | gcloud secrets create session-secret \
  --data-file=- \
  --project=protime-summi

echo -n "$JWT_SECRET" | gcloud secrets create jwt-secret \
  --data-file=- \
  --project=protime-summi

# Grant Cloud Run access to secrets
gcloud secrets add-iam-policy-binding session-secret \
  --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor \
  --project=protime-summi

gcloud secrets add-iam-policy-binding jwt-secret \
  --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor \
  --project=protime-summi
```

## Environment Variables

### Required Environment Variables

Set via `--set-env-vars`:
- `NODE_ENV` - "staging" or "production"
- `FIREBASE_PROJECT_ID` - "protime-summi"
- `JWT_EXPIRY` - "7d" (default)
- `OAUTH_CALLBACK_URL` - Your Cloud Run service URL + "/auth/callback"

### Required Secrets

Set via `--set-secrets`:
- `JWT_SECRET` - JWT signing key
- `SESSION_SECRET` - Session encryption key

### Not Needed on Cloud Run

These are automatically provided:
- `GOOGLE_APPLICATION_CREDENTIALS` - Cloud Run uses Application Default Credentials
- `PORT` - Cloud Run sets this automatically (usually 8080)

## Performance Configuration

### Production Settings

```bash
gcloud run deploy protime-mcp-prod \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 1 \           # Always warm instance
  --max-instances 100 \          # Scale up to 100
  --cpu 2 \                      # 2 vCPU per instance
  --memory 1Gi \                 # 1GB RAM per instance
  --concurrency 80 \             # Max concurrent requests per instance
  --timeout 300s \               # 5 minute timeout
  --cpu-boost \                  # Boost CPU during startup
  --execution-environment gen2 \ # Use gen2 execution environment
  --project protime-summi
```

### Staging Settings

```bash
gcloud run deploy protime-mcp-staging \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \            # Scale to zero when idle
  --max-instances 10 \           # Lower limit for staging
  --cpu 1 \                      # 1 vCPU
  --memory 512Mi \               # 512MB RAM
  --concurrency 80 \
  --timeout 60s \
  --project protime-summi
```

## Deployment Workflow

### Initial Setup

1. **Create Artifact Registry** (if using Method 2):
```bash
gcloud artifacts repositories create protime-mcp \
  --repository-format=docker \
  --location=europe-west3 \
  --project=protime-summi
```

2. **Create Secrets**:
```bash
# Run secret creation commands from above
```

3. **Deploy Staging**:
```bash
npm run deploy:staging
# Or: gcloud run deploy protime-mcp-staging --source . --region us-central1 ...
```

4. **Test Staging**:
```bash
curl https://protime-mcp-staging-xxx.a.run.app/health
curl https://protime-mcp-staging-xxx.a.run.app/manifest
```

5. **Deploy Production**:
```bash
npm run deploy:production
# Or: gcloud run deploy protime-mcp-prod --source . --region us-central1 ...
```

### Continuous Deployment

#### Option A: Manual (Recommended for MVP)

```bash
# Build and test locally
npm run build
npm test

# Deploy to staging
npm run deploy:staging

# Test staging
curl https://protime-mcp-staging-xxx.a.run.app/health

# Deploy to production
npm run deploy:production
```

#### Option B: GitHub Actions (Future)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Cloud Run

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy protime-mcp-prod \
            --source . \
            --region us-central1 \
            --platform managed \
            --project protime-summi
```

## Monitoring

### View Logs

```bash
# Tail logs in real-time
gcloud run services logs tail protime-mcp-prod \
  --region us-central1 \
  --project protime-summi

# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=protime-mcp-prod" \
  --limit 50 \
  --project protime-summi
```

### Metrics Dashboard

1. Go to Cloud Console: https://console.cloud.google.com/run
2. Select `protime-mcp-prod`
3. Click "METRICS" tab
4. Monitor:
   - Request count
   - Request latency
   - Instance count
   - CPU/Memory utilization

### Set Up Alerts

```bash
# Alert on high error rate
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="MCP Server High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

## Custom Domain (Optional)

```bash
# Map custom domain
gcloud run domain-mappings create \
  --service protime-mcp-prod \
  --domain mcp.protime.ai \
  --region us-central1 \
  --project protime-summi

# Update DNS records as instructed by the command output
```

## Rollback

```bash
# List revisions
gcloud run revisions list \
  --service protime-mcp-prod \
  --region us-central1 \
  --project protime-summi

# Rollback to previous revision
gcloud run services update-traffic protime-mcp-prod \
  --to-revisions REVISION_NAME=100 \
  --region us-central1 \
  --project protime-summi
```

## Troubleshooting

### Build Fails

```bash
# Check build logs
gcloud builds log BUILD_ID --project protime-summi

# Common issues:
# - Missing dependencies in package.json
# - TypeScript errors (run `npm run build` locally first)
# - Out of memory (increase Cloud Build machine type)
```

### Service Won't Start

```bash
# Check service logs
gcloud run services logs read protime-mcp-prod \
  --region us-central1 \
  --limit 100 \
  --project protime-summi

# Common issues:
# - Missing environment variables
# - Firebase credentials not accessible
# - Port binding (Cloud Run sets PORT automatically)
```

### High Latency

1. Check Cloud Run metrics for CPU/Memory saturation
2. Increase `--cpu` and `--memory` settings
3. Increase `--min-instances` to keep instances warm
4. Enable `--cpu-boost` for faster cold starts
5. Consider deploying to region closer to ChatGPT infrastructure

### Authentication Errors

1. Verify Secret Manager secrets are accessible
2. Check IAM permissions for Cloud Run service account
3. Verify Firebase Admin SDK credentials
4. Test OAuth flow manually

## Cost Optimization

### Staging Environment

- Use `--min-instances 0` to scale to zero
- Lower CPU and memory allocations
- Set lower `--max-instances` limit

### Production Environment

- Use `--min-instances 1` only if cold start latency is critical
- Monitor usage and adjust `--max-instances` based on traffic
- Use Cloud Run's free tier (2M requests/month)
- Consider committed use discounts for predictable traffic

## Security Checklist

- ✅ Secrets stored in Secret Manager (not environment variables)
- ✅ Service account with least privilege
- ✅ Rate limiting enabled
- ✅ Input validation via Zod schemas
- ✅ CORS configured for production origins only
- ✅ Helmet.js security headers
- ✅ Firebase Auth token verification
- ✅ OAuth 2.0 flow for ChatGPT integration

## Next Steps

1. Deploy to staging and test
2. Set up monitoring and alerts
3. Test ChatGPT integration in Developer Mode
4. Deploy to production
5. Submit to ChatGPT App Store
6. Monitor metrics and iterate
