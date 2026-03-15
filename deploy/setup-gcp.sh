#!/bin/bash
# ===========================================
# Google Cloud Setup Script for Visa Interview Agent
# Run this once to set up your GCP project
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN} Visa Interview Agent - GCP Setup${NC}"
echo -e "${GREEN}============================================${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI not found${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-visa-interview-agent}"
REGION="${GCP_REGION:-us-central1}"
SA_NAME="github-actions"

echo ""
echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo ""

# Check if logged in
echo "Checking authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1 > /dev/null 2>&1; then
    echo "Please login to Google Cloud:"
    gcloud auth login
fi

# Set project
echo ""
echo "Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID} 2>/dev/null || {
    echo -e "${YELLOW}Project doesn't exist. Creating...${NC}"
    gcloud projects create ${PROJECT_ID} --name="Visa Interview Agent"
    gcloud config set project ${PROJECT_ID}
}

# Enable billing reminder
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Enable billing for this project${NC}"
echo "   Go to: https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
echo ""
read -p "Press Enter when billing is enabled..."

# Enable APIs
echo ""
echo "Enabling required APIs..."
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com

echo -e "${GREEN}✓ APIs enabled${NC}"

# Create Artifact Registry repository
echo ""
echo "Creating Artifact Registry repository..."
gcloud artifacts repositories create visa-agent \
    --repository-format=docker \
    --location=${REGION} \
    --description="Visa Interview Agent container images" \
    2>/dev/null || echo "Repository already exists"

echo -e "${GREEN}✓ Artifact Registry ready${NC}"

# Create service account
echo ""
echo "Creating service account for GitHub Actions..."
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create ${SA_NAME} \
    --display-name="GitHub Actions Deployer" \
    2>/dev/null || echo "Service account already exists"

# Grant permissions
echo "Granting permissions..."
for role in "roles/run.admin" "roles/artifactregistry.writer" "roles/iam.serviceAccountUser"; do
    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="${role}" \
        --quiet
done

echo -e "${GREEN}✓ Service account configured${NC}"

# Create key file
echo ""
echo "Creating service account key..."
KEY_FILE="github-actions-key.json"
gcloud iam service-accounts keys create ${KEY_FILE} \
    --iam-account=${SA_EMAIL}

echo -e "${GREEN}✓ Key saved to ${KEY_FILE}${NC}"

# Summary
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN} Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Get LiveKit Cloud credentials from: https://cloud.livekit.io"
echo ""
echo "2. Get Gemini API key from: https://aistudio.google.com/apikey"
echo ""
echo "3. Add these GitHub Secrets (Settings → Secrets → Actions):"
echo ""
echo "   GCP_PROJECT_ID     = ${PROJECT_ID}"
echo "   GCP_SA_KEY         = $(cat ${KEY_FILE} | base64 | tr -d '\n' | head -c 50)..."
echo "                        (copy full contents of ${KEY_FILE})"
echo "   LIVEKIT_URL        = wss://your-project.livekit.cloud"
echo "   LIVEKIT_API_KEY    = your-livekit-api-key"
echo "   LIVEKIT_API_SECRET = your-livekit-secret"
echo "   GOOGLE_API_KEY     = your-gemini-api-key"
echo ""
echo "4. Push to main branch to trigger deployment:"
echo "   git push origin main"
echo ""
echo -e "${YELLOW}⚠️  Keep ${KEY_FILE} secure and add to .gitignore${NC}"
