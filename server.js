const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/inventory_db'
});

// Redis Client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.log('Redis offline, running without cache fallback');
  }
})();

// GET Products (with Redis Cache Layer)
app.get('/api/products', async (req, res) => {
  try {
    const cacheKey = 'products:all';
    if (redisClient.isOpen) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json({ source: 'cache', data: JSON.parse(cached) });
      }
    }

    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    if (redisClient.isOpen) {
      await redisClient.setEx(cacheKey, 60, JSON.stringify(result.rows)); // 60s TTL
    }

    res.json({ source: 'database', data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Create Order with ACID Transaction & Stock Deductions
app.post('/api/orders', async (req, res) => {
  const { customer_id, items } = req.body;
  if (!customer_id || !items || !items.length) {
    return res.status(400).json({ error: 'Customer ID and items array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Start Transaction

    let totalAmount = 0;
    const orderItemsToInsert = [];

    for (const item of items) {
      // Lock row for update to prevent concurrent race conditions
      const productRes = await client.query(
        'SELECT id, unit_price, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      if (productRes.rows.length === 0) {
        throw new Error(`Product with ID ${item.product_id} not found.`);
      }

      const product = productRes.rows[0];
      if (product.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for Product ID ${item.product_id}`);
      }

      // Deduct stock
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );

      const subtotal = Number(product.unit_price) * item.quantity;
      totalAmount += subtotal;

      orderItemsToInsert.push({
        product_id: product.id,
        quantity: item.quantity,
        unit_price: product.unit_price
      });
    }

    // Insert Order
    const orderRes = await client.query(
      'INSERT INTO orders (customer_id, total_amount, order_status) VALUES ($1, $2, $3) RETURNING id, order_date',
      [customer_id, totalAmount, 'CONFIRMED']
    );
    const orderId = orderRes.rows[0].id;

    // Insert Order Items
    for (const oi of orderItemsToInsert) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [orderId, oi.product_id, oi.quantity, oi.unit_price]
      );
    }

    await client.query('COMMIT'); // Commit Transaction

    // Invalidate product cache
    if (redisClient.isOpen) {
      await redisClient.del('products:all');
    }

    res.status(201).json({
      message: 'Order created successfully',
      orderId,
      totalAmount,
      status: 'CONFIRMED'
    });
  } catch (err) {
    await client.query('ROLLBACK'); // Rollback on failure
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
