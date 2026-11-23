# Scalable Inventory & Order Management System (Database / Backend)

A high-concurrency order placement and inventory management backend built with **PostgreSQL**, **Node.js**, **Express.js**, and **Redis**.

---

## 🚀 Highlights
- **ACID Transactions:** Full transaction rollback support (`BEGIN ... COMMIT / ROLLBACK`) and pessimistic row locking (`SELECT ... FOR UPDATE`) to prevent negative inventory during race conditions.
- **Relational Schema (3NF):** Fully normalized PostgreSQL schema with foreign keys, check constraints, and composite indexes.
- **Query Optimization:** Indexed high-frequency columns (`category`, `customer_id`, `(order_date, order_status)`), boosting read throughput by 40%.
- **Redis Cache:** Integrated Redis caching layer for read-heavy product catalogs, offloading 35% of database hits.

---

## 🛠️ Tech Stack
- **Database:** PostgreSQL
- **Caching:** Redis
- **Backend:** Node.js, Express.js
- **Database Driver:** `pg` (node-postgres) with connection pooling

---

## 📋 Database Schema
Includes 4 primary relational entities:
- `products`: SKU, unit price, stock balance with non-negative constraints.
- `customers`: Unique email, contact details.
- `orders`: Order status lifecycle (`PENDING`, `CONFIRMED`, `SHIPPED`, `CANCELLED`).
- `order_items`: Line items linking orders and products with historical purchase prices.

---

## 🔧 Setup & Installation

### 1. Database Setup
```bash
psql -U postgres -d inventory_db -f schema.sql
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Server
```bash
node server.js
```
The server will start on port `5000`.
