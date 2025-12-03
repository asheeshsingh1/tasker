# Tasker - Todo App

A full-stack todo application with user authentication, built with React and MongoDB.

![Tasker](https://img.shields.io/badge/React-19-blue) ![MongoDB](https://img.shields.io/badge/MongoDB-6-green) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

## Features

- ✅ User registration & login (JWT authentication)
- ✅ Create, complete, and delete tasks
- ✅ Progress tracking
- ✅ Data persisted in MongoDB
- ✅ Responsive design
- ✅ Vercel-ready for deployment

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite |
| Backend | Vercel Serverless Functions |
| Database | MongoDB |
| Auth | JWT + bcrypt |

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker](https://www.docker.com/products/docker-desktop) (for local MongoDB)
- npm or yarn

## Local Development

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd todo-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start MongoDB (using Docker)

```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 4. Create environment file

Create a `.env` file in the project root:

```env
MONGODB_URI=mongodb://localhost:27017/tasker
JWT_SECRET=your-secret-key-here
```

### 5. Start the development server

```bash
npm run dev
```

This starts:
- Frontend: http://localhost:5173
- API Server: http://localhost:3001

### 6. Open the app

Navigate to http://localhost:5173 in your browser.

## Project Structure

```
todo-app/
├── api/                    # Vercel serverless functions
│   ├── auth/
│   │   ├── register.ts     # POST /api/auth/register
│   │   ├── login.ts        # POST /api/auth/login
│   │   └── me.ts           # GET /api/auth/me
│   └── todos/
│       ├── index.ts        # GET, POST, DELETE /api/todos
│       └── [id].ts         # PATCH, DELETE /api/todos/:id
├── lib/                    # Shared utilities
│   ├── mongodb.ts          # Database connection
│   └── auth.ts             # JWT helpers
├── src/                    # React frontend
│   ├── App.tsx
│   ├── api.ts              # API client
│   └── index.css           # Styles
├── dev-server.js           # Local development server
├── vercel.json             # Vercel configuration
└── package.json
```

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create new account | No |
| POST | `/api/auth/login` | Sign in | No |
| GET | `/api/auth/me` | Get current user | Yes |
| GET | `/api/todos` | List all todos | Yes |
| POST | `/api/todos` | Create todo | Yes |
| PATCH | `/api/todos/:id` | Update todo | Yes |
| DELETE | `/api/todos/:id` | Delete todo | Yes |
| DELETE | `/api/todos` | Clear completed | Yes |

## Deployment to Vercel

### Step 1: Set up MongoDB Atlas (Free)

1. Go to [MongoDB Atlas](https://cloud.mongodb.com) and create a free account
2. Click **"Build a Database"** → Select **M0 Free Tier**
3. Choose a cloud provider & region (any works)
4. Click **"Create Deployment"**
5. Create a database user:
   - Username: `tasker` (or your choice)
   - Password: Generate a secure password (save this!)
6. Add IP Access:
   - Click **"Add My Current IP"** for testing, or
   - Add `0.0.0.0/0` to allow all IPs (required for Vercel)
7. Click **"Connect"** → **"Drivers"** → Copy the connection string
   - It looks like: `mongodb+srv://tasker:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   - Replace `<password>` with your actual password
   - Add database name: `mongodb+srv://tasker:password@cluster0.xxxxx.mongodb.net/tasker?retryWrites=true&w=majority`

### Step 2: Deploy to Vercel

**Option A: Deploy via Vercel Dashboard**

1. Push your code to GitHub/GitLab/Bitbucket
2. Go to [vercel.com](https://vercel.com) → **"Add New Project"**
3. Import your repository
4. **Configure Environment Variables** (expand the section):
   
   | Name | Value |
   |------|-------|
   | `MONGODB_URI` | `mongodb+srv://tasker:yourpassword@cluster0.xxxxx.mongodb.net/tasker?retryWrites=true&w=majority` |
   | `JWT_SECRET` | Generate with: `openssl rand -base64 32` |

5. Click **"Deploy"**

**Option B: Deploy via CLI**

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# Set environment variables
vercel env add MONGODB_URI
vercel env add JWT_SECRET

# Deploy to production
vercel --prod
```

### Step 3: Verify Deployment

1. Open your Vercel deployment URL
2. Register a new account
3. Create some tasks
4. Check MongoDB Atlas → Browse Collections to see your data!

## Docker Commands

```bash
# Start MongoDB
docker start mongodb

# Stop MongoDB
docker stop mongodb

# View MongoDB logs
docker logs mongodb

# Access MongoDB shell
docker exec -it mongodb mongosh

# View data
docker exec mongodb mongosh --quiet tasker --eval "db.users.find().pretty()"
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development servers |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | Secret key for JWT signing | Yes |

## License

MIT
