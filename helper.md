# Developer Guide & Setup Instructions 🛠️

Welcome to the development team! This guide acts as your master checklist to help you spin up the whole project stack locally from scratch in just a couple of minutes.

## 1. Prerequisites

Before you do anything, ensure you have the following installed on your machine:
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**: Mandatory for running our database and cache isolated from your machine. Ensure the Docker desktop app is actually running in the background.
- **[Node.js (LTS)](https://nodejs.org/)**: To run the backend Express server.
- **Git**: For pulling/pushing code.
- **A Database Viewer**: E.g., [DBeaver](https://dbeaver.io/) (or simply use the VS Code database extension) to easily browse and view our PostgreSQL tables.

---

## 2. Booting the Database 🐳

We use Docker to avoid messy local PostgreSQL installations. Our setup will automatically read the `.sql` files in the directory and initialize all tables.

1. Open your terminal at the root of the project.
2. Run the following command:
   ```bash
   docker compose up -d
   ```
3. Docker will pull PostgreSQL and Valkey. The first time it runs, it executes `db/01_schema.sql` and generates all our tables for you in the background.

### 🔍 Connecting to the Database
To view the raw tables safely, use your DB Viewer to connect using these details:
- **Host:** `localhost`
- **Port:** `5433` *(Note: We use 5433 locally to prevent conflicts with standard local Postgres installations!)*
- **Database:** `hyperlocal`
- **Username:** `admin`
- **Password:** `localpass123`

---

## 3. Starting the Backend Server 🟢

The main API runs on Express.js. 

1. Open your terminal and change into the backend folder:
   ```bash
   cd backend
   ```
2. Install all the necessary packages:
   ```bash
   npm install
   ```
3. Set up environment variables. Create a `.env` file exactly inside the `backend/` folder and paste the following baseline config:
   ```env
   PORT=4000
   DATABASE_URL=postgresql://admin:localpass123@localhost:5433/hyperlocal
   VALKEY_URL=redis://localhost:6379
   JWT_SECRET=change_this_to_a_random_string_in_production
   NODE_ENV=development
   ```
4. Start the development server (which uses `nodemon`, so it auto-restarts on code changes):
   ```bash
   npm run dev
   ```
5. Verify it's working! Open your browser and go to `http://localhost:4000/health`. You should see `{"status":"ok"}`.

---

## 4. Useful Commands Cheatsheet 📄

### Docker / Database Commands (Run in project root)
| Command | Action |
| --- | --- |
| `docker compose up -d` | Start the DB/Cache containers in the background |
| `docker compose down` | Stop the containers safely |
| `docker compose down -v` | **HARD RESET:** Stops and deletes the database volume entirely. Extremely useful if you tweaked schema logic and want a completely fresh start! |
| `docker compose ps` | Check if your containers are physically running |
| `docker compose logs postgres` | View database logs, specifically if you encounter startup schema errors |

### Node Commands (Run in `/backend`)
| Command | Action |
| --- | --- |
| `npm install` | Install new packages whenever package.json updates |
| `npm run dev` | Start the Express server for local development |
| `npm start` | Start the Express server for production |

Enjoy, and happy coding! 🚀
