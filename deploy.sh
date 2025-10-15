#!/bin/bash
# Deployment script for Protime MCP Server

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="protime-summi"
REGION="europe-west3"
ARTIFACT_REGISTRY="europe-west3-docker.pkg.dev"

echo -e "${GREEN}🚀 Protime MCP Server Deployment${NC}"
echo "=================================="

# Check if environment is specified
if [ -z "$1" ]; then
  echo -e "${RED}❌ Error: Environment not specified${NC}"
  echo "Usage: ./deploy.sh [staging|production]"
  exit 1
fi

ENVIRONMENT=$1
SERVICE_NAME="protime-mcp-$ENVIRONMENT"

echo -e "${YELLOW}📦 Environment: $ENVIRONMENT${NC}"
echo -e "${YELLOW}📍 Region: $REGION${NC}"
echo -e "${YELLOW}🏷️  Service: $SERVICE_NAME${NC}"
echo ""

# Step 1: Verify gcloud authentication
echo -e "${GREEN}🔐 Verifying gcloud authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
  echo -e "${RED}❌ Not authenticated with gcloud${NC}"
  echo "Run: gcloud auth login"
  exit 1
fi
echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Step 2: Set project
echo -e "${GREEN}📋 Setting project to $PROJECT_ID...${NC}"
gcloud config set project $PROJECT_ID
echo ""

# Step 3: Enable required APIs
echo -e "${GREEN}🔧 Ensuring required APIs are enabled...${NC}"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --quiet
echo -e "${GREEN}✅ APIs enabled${NC}"
echo ""

# Step 4: Create Artifact Registry repository if it doesn't exist
echo -e "${GREEN}📦 Checking Artifact Registry repository...${NC}"
if ! gcloud artifacts repositories describe protime-mcp \
  --location=$REGION &>/dev/null; then
  echo "Creating Artifact Registry repository..."
  gcloud artifacts repositories create protime-mcp \
    --repository-format=docker \
    --location=$REGION \
    --description="Protime MCP Server Docker images"
  echo -e "${GREEN}✅ Repository created${NC}"
else
  echo -e "${GREEN}✅ Repository exists${NC}"
fi
echo ""

# Step 5: Build and push Docker image
echo -e "${GREEN}🐳 Building Docker image...${NC}"
IMAGE_TAG="$ARTIFACT_REGISTRY/$PROJECT_ID/protime-mcp/protime-mcp:$(date +%Y%m%d-%H%M%S)"
IMAGE_LATEST="$ARTIFACT_REGISTRY/$PROJECT_ID/protime-mcp/protime-mcp:latest"

docker build -t $IMAGE_TAG -t $IMAGE_LATEST .

echo -e "${GREEN}📤 Pushing to Artifact Registry...${NC}"
docker push $IMAGE_TAG
docker push $IMAGE_LATEST
echo -e "${GREEN}✅ Image pushed${NC}"
echo ""

# Step 6: Deploy to Cloud Run
echo -e "${GREEN}☁️  Deploying to Cloud Run ($ENVIRONMENT)...${NC}"

if [ "$ENVIRONMENT" == "staging" ]; then
  gcloud run deploy $SERVICE_NAME \
    --image=$IMAGE_TAG \
    --region=$REGION \
    --platform=managed \
    --allow-unauthenticated \
    --set-env-vars=NODE_ENV=staging,FIREBASE_PROJECT_ID=$PROJECT_ID \
    --min-instances=0 \
    --max-instances=10 \
    --memory=512Mi \
    --cpu=1 \
    --timeout=300
elif [ "$ENVIRONMENT" == "production" ]; then
  gcloud run deploy $SERVICE_NAME \
    --image=$IMAGE_TAG \
    --region=$REGION \
    --platform=managed \
    --allow-unauthenticated \
    --set-env-vars=NODE_ENV=production,FIREBASE_PROJECT_ID=$PROJECT_ID \
    --min-instances=1 \
    --max-instances=100 \
    --memory=512Mi \
    --cpu=1 \
    --timeout=300
else
  echo -e "${RED}❌ Invalid environment: $ENVIRONMENT${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""

# Step 7: Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format='value(status.url)')

echo -e "${GREEN}🌐 Service URL:${NC}"
echo "   $SERVICE_URL"
echo ""

# Step 8: Test health endpoint
echo -e "${GREEN}🏥 Testing health endpoint...${NC}"
HEALTH_CHECK=$(curl -s $SERVICE_URL/health)

if echo $HEALTH_CHECK | grep -q '"status":"healthy"'; then
  echo -e "${GREEN}✅ Health check passed${NC}"
  echo "   Response: $HEALTH_CHECK"
else
  echo -e "${RED}⚠️  Health check failed${NC}"
  echo "   Response: $HEALTH_CHECK"
fi
echo ""

# Step 9: View logs
echo -e "${YELLOW}📋 Recent logs:${NC}"
gcloud run logs read $SERVICE_NAME --region=$REGION --limit=10

echo ""
echo -e "${GREEN}🎉 Deployment successful!${NC}"
echo ""
echo "Next steps:"
echo "  - Test the service: curl $SERVICE_URL/health"
echo "  - View logs: gcloud run logs tail $SERVICE_NAME --region=$REGION"
echo "  - Monitor: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
