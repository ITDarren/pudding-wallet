# Pudding Wallet

This is a React project bootstrapped with Vite.

## Setup

1. Make sure you have Node.js installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in any required variables.

## Running Locally

To start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run preview`: Preview production build
- `npm run lint`: Type check with TypeScript

## Deployment

This project is configured with a GitHub Action to automatically deploy to GitHub Pages when pushing to the `main` or `master` branch.

The workflow file is located at `.github/workflows/deploy.yml`. Make sure to enable GitHub Pages in your repository settings (Settings -> Pages -> Build and deployment source: GitHub Actions).

## Ignore Files
A `.gitignore` is provided to keep the repository clean from:
- `node_modules/` and build directories (`dist/`, `build/`)
- Temporary cache or logs
- IDE configurations (like `.idea`, mostly `.vscode` is ignored except specific shared configs)
- Environment variable files (`.env`, `.env.local`, etc. - except `.env.example`)
