# Protime MCP Server - Setup Guide

Complete setup instructions for local development and Cloud Run deployment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Firebase Configuration](#firebase-configuration)
4. [OAuth Setup](#oauth-setup)
5. [Testing Locally](#testing-locally)
6. [Cloud Run Deployment](#cloud-run-deployment)
7. [ChatGPT App Store Submission](#chatgpt-app-store-submission)

---

## Prerequisites

### Required Tools

```bash
# Node.js 20+
node --version  # Should be v20.0.0 or higher

# Google Cloud SDK
gcloud --version

# Firebase CLI
firebase --version

# Docker (for local container testing)
docker --version
```

### Install Missing Tools

```bash
# Node.js (using nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Google Cloud SDK
curl https://sdk.cloud.google.com | bash
gcloud init

# Firebase CLI
npm install -g firebase-tools
firebase login
```

---

## Local Development Setup

### 1. Clone and Install

```bash
cd /Users/marcloeb/Documents/mnl/openai-app-sdk
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Server
PORT=8080
NODE_ENV=development
LOG_LEVEL=debug

# Google Cloud
GCP_PROJECT_ID=protime-summi
GCP_REGION=europe-west3

# Firebase (see Firebase Configuration section)
FIREBASE_PROJECT_ID=protime-summi
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json

# ChatGPT OAuth (temporary values for local dev)
CHATGPT_CLIENT_ID=local_dev_client
CHATGPT_CLIENT_SECRET=local_dev_secret
OAUTH_CALLBACK_URL=http://localhost:8080/auth/callback

# Security (generate strong secrets)
SESSION_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRY=7d
```

### 3. Generate Secrets

```bash
# Session secret
openssl rand -base64 32

# JWT secret
openssl rand -base64 32
```

Paste these into your `.env` file.

---

## Firebase Configuration

### 1. Download Service Account Key

```bash
# Option A: Via Firebase Console
# 1. Go to https://console.firebase.google.com/project/protime-summi/settings/serviceaccounts
# 2. Click "Generate new private key"
# 3. Save as service-account-key.json in project root

# Option B: Via gcloud CLI
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=firebase-adminsdk@protime-summi.iam.gserviceaccount.com
```

### 2. Verify Firebase Access

```bash
# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/service-account-key.json"

# Test Firestore access
firebase firestore:get /users --project protime-summi
```

### 3. Security Rules

Ensure Firestore security rules allow the service account:

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Briefings - user ownership required
    match /briefings/{briefingId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }

    // Editions - read access for briefing owners
    match /editions/{editionId} {
      allow read: if request.auth != null &&
        get(/databases/$(database)/documents/briefings/$(resource.data.briefingId)).data.userId == request.auth.uid;
    }

    // Service account has full access
    match /{document=**} {
      allow read, write: if request.auth.token.email == "firebase-adminsdk@protime-summi.iam.gserviceaccount.com";
    }
  }
}
```

---

## OAuth Setup

### 1. Configure ChatGPT OAuth (When Available)

Once OpenAI provides OAuth credentials:

```bash
# Update .env
CHATGPT_CLIENT_ID=<provided_by_openai>
CHATGPT_CLIENT_SECRET=<provided_by_openai>
OAUTH_CALLBACK_URL=https://your-mcp-server.com/auth/callback
```

### 2. OAuth Flow Endpoints

The MCP server exposes these endpoints:

- `GET /auth/login` - Initiate OAuth flow
- `GET /auth/callback` - OAuth callback handler
- `GET /auth/status` - Check authentication status
- `POST /auth/logout` - Logout

### 3. Test OAuth Locally

```bash
# Start server
npm run dev

# Open in browser
open http://localhost:8080/auth/login

# Check callback
curl http://localhost:8080/auth/status
```

---

## Testing Locally

### 1. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:8080` with hot reload.

### 2. Test Health Endpoint

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-11T12:34:56.789Z",
  "version": "1.0.0"
}
```

### 3. Test MCP Tools

#### Create Briefing

```bash
curl -X POST http://localhost:8080/tools/create_briefing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <test_token>" \
  -d '{
    "topic": "AI regulations",
    "description": "Track EU AI Act"
  }'
```

#### List Briefings

```bash
curl http://localhost:8080/tools/get_briefings \
  -H "Authorization: Bearer <test_token>"
```

### 4. Run Unit Tests

```bash
npm test
```

### 5. Test in ChatGPT Developer Mode

1. Open ChatGPT → Settings → Apps → Developer Mode
2. Add server URL: `http://localhost:8080`
3. Try creating a briefing: "Create a briefing about climate tech"
4. Check MCP server logs for requests

---

## Cloud Run Deployment

### 1. Authenticate with Google Cloud

```bash
gcloud auth login
gcloud config set project protime-summi
```

### 2. Enable Required APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 3. Build and Deploy (Staging)

```bash
# Build and deploy in one command
gcloud run deploy protime-mcp-staging \
  --source . \
  --region europe-west3 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=staging,FIREBASE_PROJECT_ID=protime-summi \
  --set-secrets="SESSION_SECRET=session-secret:latest,JWT_SECRET=jwt-secret:latest" \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300
```

### 4. Configure Secrets (First Time)

```bash
# Create secrets in Secret Manager
echo -n "$(openssl rand -base64 32)" | gcloud secrets create session-secret --data-file=-
echo -n "$(openssl rand -base64 32)" | gcloud secrets create jwt-secret --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding session-secret \
  --member="serviceAccount:$(gcloud run services describe protime-mcp-staging --region europe-west3 --format='value(spec.template.spec.serviceAccountName)')" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:$(gcloud run services describe protime-mcp-staging --region europe-west3 --format='value(spec.template.spec.serviceAccountName)')" \
  --role="roles/secretmanager.secretAccessor"
```

### 5. Update OAuth Callback URL

After deployment, get the Cloud Run URL:

```bash
gcloud run services describe protime-mcp-staging \
  --region europe-west3 \
  --format='value(status.url)'
```

Update your `.env` and redeploy:

```bash
OAUTH_CALLBACK_URL=https://protime-mcp-staging-xxx.a.run.app/auth/callback
```

### 6. Deploy to Production

```bash
gcloud run deploy protime-mcp-prod \
  --source . \
  --region europe-west3 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,FIREBASE_PROJECT_ID=protime-summi \
  --set-secrets="SESSION_SECRET=session-secret-prod:latest,JWT_SECRET=jwt-secret-prod:latest" \
  --min-instances 1 \
  --max-instances 100 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300
```

### 7. Configure Custom Domain (Optional)

```bash
# Map domain
gcloud run domain-mappings create \
  --service protime-mcp-prod \
  --domain mcp.protime.ai \
  --region europe-west3

# Update DNS records as instructed
```

### 8. Verify Deployment

```bash
# Check service status
gcloud run services describe protime-mcp-prod --region europe-west3

# Test health endpoint
curl https://protime-mcp-prod-xxx.a.run.app/health

# View logs
gcloud run logs read protime-mcp-prod --region europe-west3 --limit 50
```

---

## ChatGPT App Store Submission

### 1. Prepare App Metadata

Create `app-manifest.json`:

```json
{
  "name": "Protime Briefings",
  "description": "AI-powered topic briefings delivered automatically",
  "version": "1.0.0",
  "author": "Protime",
  "category": "productivity",
  "server_url": "https://protime-mcp-prod-xxx.a.run.app",
  "oauth": {
    "client_id": "<chatgpt_client_id>",
    "authorization_url": "https://protime-mcp-prod-xxx.a.run.app/auth/login",
    "token_url": "https://protime-mcp-prod-xxx.a.run.app/auth/token",
    "scope": ["briefings:read", "briefings:write"]
  },
  "icon": "https://protime.ai/icon-512.png",
  "screenshots": [
    "https://protime.ai/screenshots/chatgpt-1.png",
    "https://protime.ai/screenshots/chatgpt-2.png"
  ]
}
```

### 2. Create Screenshots

Capture ChatGPT interactions:
1. Creating a briefing
2. Viewing edition content
3. Configuring sources
4. Reading summaries

### 3. Write App Description

```markdown
# Protime Briefings

Never miss important updates again. Protime automatically tracks topics you care about and delivers AI-powered summaries right in ChatGPT.

## What You Can Do

- **Create Topic Briefings**: Track AI, climate tech, competitors, or any subject
- **Smart Source Discovery**: Get curated newsletter recommendations
- **Automatic Updates**: Receive daily/weekly summaries without asking
- **Natural Configuration**: Set everything up through conversation

## How It Works

1. Tell Protime what topic to track
2. Choose from recommended sources
3. Set your update schedule
4. Get AI summaries delivered automatically

## Perfect For

- Busy professionals staying informed
- Researchers tracking their field
- Investors monitoring industries
- Anyone with information overload

Start tracking your first topic for free!
```

### 4. Submit to App Store

1. Go to OpenAI Developer Portal
2. Navigate to Apps SDK → Submit App
3. Upload `app-manifest.json`
4. Add screenshots and description
5. Submit for review

### 5. Monitor Submission Status

Check submission status and respond to any feedback from OpenAI.

---

## Monitoring & Maintenance

### View Logs

```bash
# Real-time logs
gcloud run logs tail protime-mcp-prod --region europe-west3

# Filter errors
gcloud run logs read protime-mcp-prod \
  --region europe-west3 \
  --filter="severity>=ERROR" \
  --limit=100
```

### Monitor Metrics

View in Cloud Console:
- https://console.cloud.google.com/run/detail/europe-west3/protime-mcp-prod/metrics

### Set Up Alerts

```bash
# High error rate alert
gcloud alpha monitoring policies create \
  --notification-channels=<channel_id> \
  --display-name="MCP Server High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-expression='
    resource.type="cloud_run_revision"
    AND resource.labels.service_name="protime-mcp-prod"
    AND metric.type="run.googleapis.com/request_count"
    AND metric.labels.response_code_class="5xx"
  '
```

---

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Use different port
PORT=3000 npm run dev
```

### Firebase Auth Errors

```bash
# Verify service account permissions
gcloud projects get-iam-policy protime-summi \
  --flatten="bindings[].members" \
  --filter="bindings.members:firebase-adminsdk"
```

### Cloud Run Build Failures

```bash
# Check build logs
gcloud builds list --limit=5

# View specific build
gcloud builds log <build_id>

# Test Docker build locally
docker build -t protime-mcp:test .
docker run -p 8080:8080 --env-file .env protime-mcp:test
```

### OAuth Callback Not Working

```bash
# Verify callback URL matches
echo $OAUTH_CALLBACK_URL

# Check Cloud Run environment
gcloud run services describe protime-mcp-prod \
  --region europe-west3 \
  --format="value(spec.template.spec.containers[0].env)"
```

---

## Next Steps

1. ✅ Complete local setup
2. ✅ Test all MCP tools
3. ✅ Deploy to Cloud Run staging
4. ✅ Beta test with users
5. ✅ Deploy to production
6. ✅ Submit to ChatGPT app store
7. 📈 Monitor and iterate

## Support

- **Issues**: GitHub Issues
- **Email**: marc@protime.ai
- **Docs**: `/docs` folder
