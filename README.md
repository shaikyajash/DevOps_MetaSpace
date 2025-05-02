# MetaSpace - Multiplayer Virtual Space

This project is a multiplayer virtual space with video chat capabilities when players are near each other.

## Getting Started

### Local Development

#### Using Docker (Recommended)

1. Make sure you have Docker and Docker Compose installed
2. Create a `.env` file in the root directory with the required environment variables
3. Run `docker-compose up`
4. Access the frontend at http://localhost:5173

#### Manual Setup

1. Backend Setup:
   ```bash
   cd backend
   npm install
   # Create a .env file with required environment variables
   npm start
   ```

2. Frontend Setup:
   ```bash
   cd frontend
   npm install
   # Create a .env file with required environment variables
   npm run dev
   ```

### Environment Variables

#### Backend (.env)
```
JWT_SECRET=your_jwt_secret
MONGODB_URI=mongodb://localhost:27017/MetaSpace
FRONTEND_URL=http://localhost:5173
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password
PORT=3000
```

#### Frontend (.env)
```
VITE_BACKEND_URL=http://localhost:3000/api
VITE_FRONTEND_URL=http://localhost:5173
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## Deployment

This project is set up for automatic deployment:
- Backend is deployed to Render
- Frontend is deployed to Vercel

The CI/CD pipeline will deploy automatically when changes are pushed to the main/master branch.

## Technologies Used

- **Frontend**: React, Vite, Socket.io Client, WebRTC
- **Backend**: Node.js, Express, Socket.io, MongoDB
- **Authentication**: JWT, Google OAuth
- **CI/CD**: GitHub Actions
- **Deployment**: Render (backend), Vercel (frontend)

## Features

- User Authentication & Profile Management
- Multiplayer Game Environment
- Proximity-based Video Chat
- Real-time Messaging
