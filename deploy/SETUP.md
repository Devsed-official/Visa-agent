# Google Cloud Deployment Setup

This guide walks you through deploying the Visa Interview Agent to Google Cloud Run using GitHub Actions.

## Prerequisites

- Google Cloud account with billing enabled
- GitHub repository
- LiveKit Cloud account (free tier available)

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **Select Project** → **New Project**
3. Name: `visa-interview-agent`
4. Click **Create**
5. **Enable billing** for the project

---

## Step 2: Enable Required APIs

Run in [Cloud Shell](https://shell.cloud.google.com) or local terminal:

```bash
# Set your project
gcloud config set project visa-interview-agent

# Enable APIs
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

---

## Step 3: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create visa-agent \
  --repository-format=docker \
  --location=us-central1 \
  --description="Visa Interview Agent images"
```

---

## Step 4: Create Service Account for GitHub Actions

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deployer"

# Get the email
SA_EMAIL="github-actions@visa-interview-agent.iam.gserviceaccount.com"

# Grant required permissions
gcloud projects add-iam-policy-binding visa-interview-agent \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding visa-interview-agent \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding visa-interview-agent \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountUser"

# Create and download key
gcloud iam service-accounts keys create key.json \
  --iam-account=$SA_EMAIL

# IMPORTANT: Copy the contents of key.json for GitHub secrets
cat key.json
```

---

## Step 5: Get LiveKit Cloud Credentials

1. Go to [LiveKit Cloud](https://cloud.livekit.io)
2. Create a free project
3. Go to **Settings** → **Keys**
4. Copy:
   - WebSocket URL (e.g., `wss://your-project.livekit.cloud`)
   - API Key
   - API Secret

---

## Step 6: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **Create API Key**
3. Copy the key

---

## Step 7: Add GitHub Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `GCP_PROJECT_ID` | `visa-interview-agent` |
| `GCP_SA_KEY` | Contents of `key.json` (entire JSON) |
| `LIVEKIT_URL` | `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | Your LiveKit API key |
| `LIVEKIT_API_SECRET` | Your LiveKit API secret |
| `GOOGLE_API_KEY` | Your Gemini API key |

---

## Step 8: Deploy

### Option A: Automatic (on push)
Just push to `main` branch:
```bash
git add .
git commit -m "Deploy to Cloud Run"
git push origin main
```

### Option B: Manual Trigger
1. Go to GitHub repo → **Actions**
2. Select **Deploy to Google Cloud Run**
3. Click **Run workflow**

---

## Step 9: Get Your URLs

After deployment, find your URLs:

```bash
# Agent URL
gcloud run services describe visa-interview-agent --region us-central1 --format 'value(status.url)'

# Frontend URL
gcloud run services describe visa-interview-frontend --region us-central1 --format 'value(status.url)'
```

Or check the GitHub Actions logs.

---

## Verify Deployment (for Hackathon Proof)

To create proof of deployment:

1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Click on `visa-interview-agent` service
3. Record your screen showing:
   - Service name and status
   - Logs tab with activity
   - The Cloud Run URL

This serves as your **Proof of Google Cloud Deployment**.

---

## Troubleshooting

### Build fails
- Check Docker build logs in GitHub Actions
- Ensure all files are committed

### Service won't start
- Check Cloud Run logs: `gcloud run logs read visa-interview-agent --region us-central1`
- Verify environment variables are set

### LiveKit connection fails
- Ensure LIVEKIT_URL starts with `wss://`
- Verify API key/secret are correct

---

## Cost Estimate

Cloud Run charges per request/CPU time. Expected costs:
- **Low usage** (testing): ~$0-5/month
- **Medium usage**: ~$10-30/month
- Free tier includes 2 million requests/month
