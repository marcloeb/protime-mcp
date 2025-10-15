# Deployment Guide - Protime MCP Server

## Region Configuration

**✅ Correct Region:** `europe-west3`

All Protime infrastructure uses `europe-west3`:
- ✅ Cloud Run services (all existing functions)
- ✅ Firebase Hosting backend
- ✅ Firestore database
- ✅ Cloud Functions

**❌ Never use:** `us-central1` - This is NOT where your infrastructure is located.

---

## Quick Deploy

### Option 1: Automated Script (Recommended)

```bash
# Deploy to staging
./deploy.sh staging

# Deploy to production (after testing staging)
./deploy.sh production
```

### Option 2: Manual Deployment

```bash
# Set project and region
gcloud config set project protime-summi
gcloud config set run/region europe-west3

# Build Docker image
docker build -t europe-west3-docker.pkg.dev/protime-summi/protime-mcp/protime-mcp:latest .

# Push to Artifact Registry
docker push europe-west3-docker.pkg.dev/protime-summi/protime-mcp/protime-mcp:latest

# Deploy to Cloud Run
gcloud run deploy protime-mcp-staging \
  --image=europe-west3-docker.pkg.dev/protime-summi/protime-mcp/protime-mcp:latest \
  --region=europe-west3 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars=NODE_ENV=staging,FIREBASE_PROJECT_ID=protime-summi
```

### Option 3: Cloud Build (CI/CD)

```bash
# Trigger Cloud Build
gcloud builds submit --config=cloudbuild.yaml

# Or connect to GitHub for automatic builds
gcloud builds triggers create github \
  --repo-name=openai-app-sdk \
  --repo-owner=your-github-username \
  --branch-pattern=main \
  --build-config=cloudbuild.yaml
```

---

## First-Time Setup

### 1. Create Artifact Registry Repository

```bash
gcloud artifacts repositories create protime-mcp \
  --repository-format=docker \
  --location=europe-west3 \
  --description="Protime MCP Server Docker images" \
  --project=protime-summi
```

### 2. Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project=protime-summi
```

### 3. Configure Docker Authentication

```bash
gcloud auth configure-docker europe-west3-docker.pkg.dev
```

---

## Environment Configuration

### Staging

```bash
gcloud run deploy protime-mcp-staging \
  --region=europe-west3 \
  --set-env-vars=NODE_ENV=staging,FIREBASE_PROJECT_ID=protime-summi \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1
```

### Production

```bash
gcloud run deploy protime-mcp-prod \
  --region=europe-west3 \
  --set-env-vars=NODE_ENV=production,FIREBASE_PROJECT_ID=protime-summi \
  --min-instances=1 \
  --max-instances=100 \
  --memory=512Mi \
  --cpu=1
```

---

## Secrets Management

### Add Secrets to Cloud Run

```bash
# Create secrets
echo -n "$(openssl rand -base64 32)" | gcloud secrets create mcp-session-secret --data-file=-
echo -n "$(openssl rand -base64 32)" | gcloud secrets create mcp-jwt-secret --data-file=-

# Grant Cloud Run access
gcloud run services update protime-mcp-staging \
  --region=europe-west3 \
  --update-secrets=SESSION_SECRET=mcp-session-secret:latest,JWT_SECRET=mcp-jwt-secret:latest
```

---

## Verify Deployment

### Check Service Status

```bash
# Get service URL
gcloud run services describe protime-mcp-staging \
  --region=europe-west3 \
  --format='value(status.url)'

# Test health endpoint
curl https://protime-mcp-staging-XXX.a.run.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-11T...",
  "version": "1.0.0",
  "environment": "staging"
}
```

### View Logs

```bash
# Real-time logs
gcloud run logs tail protime-mcp-staging --region=europe-west3

# Recent logs
gcloud run logs read protime-mcp-staging --region=europe-west3 --limit=50

# Error logs only
gcloud run logs read protime-mcp-staging \
  --region=europe-west3 \
  --filter="severity>=ERROR" \
  --limit=20
```

---

## Monitoring & Alerts

### View Metrics

Visit: https://console.cloud.google.com/run/detail/europe-west3/protime-mcp-staging

Monitor:
- Request count
- Response latency
- Error rate
- Instance count
- Memory usage
- CPU utilization

### Set Up Alerts

```bash
# High error rate alert
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="MCP Server High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-expression='
    resource.type="cloud_run_revision"
    AND resource.labels.service_name="protime-mcp-staging"
    AND metric.type="run.googleapis.com/request_count"
    AND metric.labels.response_code_class="5xx"
  '
```

---

## Rollback

If deployment fails, rollback to previous version:

```bash
# List revisions
gcloud run revisions list \
  --service=protime-mcp-staging \
  --region=europe-west3

# Rollback to specific revision
gcloud run services update-traffic protime-mcp-staging \
  --region=europe-west3 \
  --to-revisions=protime-mcp-staging-00001-xyz=100
```

---

## Custom Domain (Optional)

### Map Custom Domain

```bash
# Add domain mapping
gcloud run domain-mappings create \
  --service=protime-mcp-prod \
  --domain=mcp.protime.ai \
  --region=europe-west3

# Verify DNS records (follow instructions from output)
```

### Update DNS

Add the records shown in the command output:
```
Type: CNAME
Name: mcp
Value: ghs.googlehosted.com
```

---

## Common Issues

### Issue: "Permission denied" when pushing to Artifact Registry

**Solution:**
```bash
gcloud auth configure-docker europe-west3-docker.pkg.dev
```

### Issue: "Service not found in region us-central1"

**Solution:** You're using the wrong region. Always use `europe-west3`:
```bash
gcloud config set run/region europe-west3
```

### Issue: Build fails with "No space left on device"

**Solution:** Clean up Docker images:
```bash
docker system prune -a
```

### Issue: "Firebase Admin SDK authentication failed"

**Solution:** Cloud Run needs Application Default Credentials. The service automatically uses the Compute Engine default service account, which has access to Firebase in the same project.

---

## Performance Optimization

### Cold Start Reduction

```bash
# Keep at least 1 instance warm
gcloud run services update protime-mcp-prod \
  --region=europe-west3 \
  --min-instances=1
```

### Scale Configuration

```bash
# Adjust scaling based on load
gcloud run services update protime-mcp-prod \
  --region=europe-west3 \
  --min-instances=2 \
  --max-instances=200 \
  --concurrency=80
```

---

## Cost Optimization

### Staging (Lower Costs)
- `--min-instances=0` (scale to zero when idle)
- `--max-instances=10` (limit concurrent instances)
- `--memory=512Mi` (minimum required)

### Production (Performance)
- `--min-instances=1` (eliminate cold starts)
- `--max-instances=100` (handle traffic spikes)
- `--memory=512Mi` (sufficient for MCP server)

**Estimated costs:**
- Staging: ~$5-10/month (low traffic)
- Production: ~$50-100/month (10K requests/day)

---

## Deployment Checklist

Before deploying to production:

- [ ] Test in staging environment
- [ ] Run `npm test` and ensure all tests pass
- [ ] Update environment variables in Cloud Run
- [ ] Configure secrets (SESSION_SECRET, JWT_SECRET)
- [ ] Set up monitoring and alerts
- [ ] Test health endpoint
- [ ] Test all 8 MCP tools
- [ ] Verify OAuth flow works
- [ ] Load test with expected traffic
- [ ] Document rollback procedure
- [ ] Notify team of deployment

---

## Support

- **Logs:** `gcloud run logs tail protime-mcp-staging --region=europe-west3`
- **Console:** https://console.cloud.google.com/run?project=protime-summi
- **Issues:** GitHub Issues
- **Email:** marc@protime.ai
