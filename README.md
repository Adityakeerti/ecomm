# Hyperlocal Instagram-First E-Commerce Platform 🚀

A modern, fast, and scalable e-commerce platform tailored for Instagram-first businesses. Operating locally with specific geographic delivery zones, this platform streamlines checkout by bypassing traditional authentication loops—anchoring sessions directly to phone numbers—and utilizes a robust PostgreSQL and Valkey (Redis) architecture under the hood.

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (with PostGIS for zone/location mappings)
- **Cache / Cart Sessions:** Valkey (Redis alternative)
- **Infrastructure:** Docker & Docker Compose (for local development isolation)

## 📁 Project Structure

- `/backend` - The Node.js/Express API server containing all business logic.
- `/db` - Database schema definitions, initialization scripts, and seed data.
- `/frontend` - (Upcoming) The customer-facing web application.
- `/admin` - (Upcoming) Admin dashboard for order and dispatch management.
- `/delivery` - (Upcoming) Delivery portal for staff.

## 🚀 Quick Start & Developer Guide

If you are a developer looking to run this project locally, please grab your environment specifics and see the complete step-by-step guide in our **[helper.md](./helper.md)** file! 

## 📝 Key Features

- **Robust Database Design**: Highly normalized schema ensuring data integrity, with strict handling of monetary values (paise) and states.
- **Smart Dispatching System**: Supports predefined delivery zones, geographic grouping, and batch dispatching dynamically triggered based on order volume and time cutoffs.
- **Micro-Sessions**: Rapid 15-minute temporary cart holds powered by Valkey to manage active inventory blocks.
- **Passkey-free Experience**: Eliminates friction with phone-number anchored customer profiles and WhatsApp-based receipt logging.
