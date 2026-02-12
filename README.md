# AI Detector

A web application that analyzes text, images, and documents to detect AI-generated content. Built with React and Express.

## Features

- **Text Analysis** - Paste text to analyze for AI-generated patterns using 24 weighted signals
- **File Upload** - Upload images, documents (PDF, DOCX, TXT), and videos for analysis
- **Detailed Breakdown** - View individual signal scores and confidence levels
- **Verdict System** - Clear categorization: Likely Human-Written, Uncertain, Possibly AI-Generated, Likely AI-Generated

## Tech Stack

- **Frontend**: React
- **Backend**: Express.js
- **Image Processing**: Sharp (optional)
- **File Handling**: Multer

## Local Development

```bash
# Install dependencies
npm install

# Run both frontend and backend in development mode
npm run dev
```

The React dev server runs on port 3000, and the Express API runs on port 5001.

## Deployment

This app is ready to deploy on platforms like **Render**, **Railway**, or **Heroku**.

### Build & Start Commands

| Setting       | Value                        |
|---------------|------------------------------|
| Build Command | `npm install && npm run build` |
| Start Command | `npm start`                  |

### Environment Variables

| Variable   | Default | Description          |
|------------|---------|----------------------|
| `PORT`     | `5001`  | Server port          |
| `NODE_ENV` | -       | Set to `production` automatically by `npm start` |

### Deploy on Render

1. Create a new **Web Service** on [Render](https://render.com)
2. Connect this GitHub repository
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm start`
5. Deploy

## Project Structure

```
ai-detector/
  server.js        # Express backend with AI detection engine
  src/
    App.js         # React frontend
    App.css        # Styles
  public/
    index.html     # HTML template
  package.json
```
