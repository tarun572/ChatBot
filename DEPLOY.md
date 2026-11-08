# Deployment guide

## Database: MongoDB Atlas

- Create a free Atlas cluster and a database user with read/write access.
- Allow network access from the deployment host IPs.
- Copy the connection URI into `MONGODB_URI`.
- Use `DB_MODE=mongo` in production, `DB_MODE=memory` for local-only demos.

## File storage: Cloudinary

- Create a Cloudinary account and add the cloud name, API key, and API secret.
- Set `STORAGE=cloudinary` and the corresponding environment variables.
- Ensure `PUBLIC_BASE_URL` points to the public URL of your deployed server.

## TTS service: Hugging Face Space

- Launch a free Docker Space.
- Set `API_KEY`, `ALLOWED_SAMPLE_HOSTS`, and `TTS_ENGINE=xtts` as needed.
- Keep the sample host allow-list limited to your own domain(s).
- Verify the free-tier limits before enabling production traffic.

## Render deployment

- Deploy the server app root as a Node 22 service.
- Set `NODE_VERSION=22`.
- Start command: `npm start`
- Required env vars include `PORT`, `JWT_SECRET`, `CLIENT_ORIGIN`, `DB_MODE`, `MONGODB_URI`, `STORAGE`, `PUBLIC_BASE_URL`, and TTS credentials.

## Vercel deployment

- Deploy the client folder as a Vite app.
- Set `VITE_API_URL` to the public server URL.
- Use a production-safe CORS allow-list in `CLIENT_ORIGIN` on the server.

## Cold-start note

- Free-tier hosting may sleep after inactivity.
- The app should treat the first request as a warm-up and retry gracefully if needed.

## Smoke checklist

- `/api/health` returns 200.
- Auth register/login works with a real token.
- Voice upload accepts a small sample and stores under the chosen storage provider.
- A demo job can be created and processed end-to-end.
- Audio file URLs resolve publicly.
- Quota caps trigger the expected 429 responses.
- Verify current free limits for every third-party service before launch.
