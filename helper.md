# Hyperlocal Instagram-First E-Commerce Platform

Welcome to our project! 🚀 

This is the backend and database setup for our hyperlocal e-commerce platform. We're keeping things simple, so we are using **Docker** to run everything we need (PostgreSQL database + Valkey/Redis cache) so that you don't have to install complex database software locally.

## Prerequisites
As a developer on this project, you only need to install a few things:
1. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** - This is mandatory to run the database. *After installing, make sure to open the Docker Desktop app so it's running in the background!*
2. **Git** - To pull and push the code.
3. A Database Viewer like **[DBeaver](https://dbeaver.io/)** or the **VS Code Database Client extension** (optional but highly recommended so you can actually see the tables).

---

## 🛠️ Step 1: Getting Started

Once you've cloned the repository and opened this folder in VS Code, open your terminal (Ctrl+` or Cmd+`) and copy-paste this command:

```bash
docker compose up -d
```

**What does this do?**
- It starts the PostgreSQL and Valkey containers in the background (that's what the `-d` means).
- Because of our setup, it reads `db/01_schema.sql` automatically the very first time it starts. This means **all our tables (orders, products, customers etc.) are created for you instantly!** You literally don't have to do any manual setup.

---

## 🔍 Step 2: Connect to the Database

To actually look at the tables and the data inside them, open your DB Viewer (like DBeaver) and create a new PostgreSQL connection with these details:

- **Host/Server:** `localhost`
- **Port:** `5433` *(Note: It's 5433, not the default 5432! We changed it to avoid conflicts).*
- **Database Name:** `hyperlocal`
- **Username:** `admin`
- **Password:** `localpass123`

When you connect, look under `Schemas > public > Tables`. You should see about 18 tables waiting for you!

---

## 🗑️ Step 3: How to Reset Everything

Messed up the data? Testing something and want to clear the database to start fresh? It's super easy. 

**Run this command to completely delete the database:**

```bash
docker compose down -v
```

Then bring it back up:

```bash
docker compose up -d
```

*(The `-v` in that command is super important. It tells Docker to delete the saved data volume. When you start it back up, Docker realizes the database is empty and will happily re-run `db/01_schema.sql` for you, giving you a brand-new, clean database).*

---

## 📄 Useful Commands Cheatsheet

| What you want to do | Command |
| --- | --- |
| Start the database | `docker compose up -d` |
| Stop the database | `docker compose down` |
| Stop AND Delete everything (reset) | `docker compose down -v` |
| See if the containers are running | `docker compose ps` |
| Check database logs for errors | `docker compose logs postgres` |

Happy Coding! 💻 Let's build this!
