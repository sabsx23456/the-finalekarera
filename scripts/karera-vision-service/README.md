# Karera Vision Service

This service runs on a VPS to monitor live horse racing websites and extract dividends using AI Vision.

## Setup

1.  Navigate to this directory:
    ```bash
    cd scripts/karera-vision-service
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file with your credentials:
    ```env
    SUPABASE_URL=your_supabase_url
    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
    OPENROUTER_API_KEY=your_openrouter_api_key
    ```
4.  Run the service:
    ```bash
    npm start
    ```

## Deployment
You can use PM2 to keep this running:
```bash
npm install -g pm2
pm2 start monitor.js --name karera-vision --cron "*/1 * * * *"
```
(Adjust cron or internal loop as needed)
