# Fanout Exchange in RabbitMQ

A **Fanout Exchange** is the simplest type of exchange in RabbitMQ. It broadcasts all messages it receives to **all queues** bound to it, completely ignoring the routing key.

### Why Do We Need Fanout Exchange?

1. **Event Broadcasting**: When one action triggers multiple independent operations
   - User registration → Send welcome email + Update analytics + Log audit trail
   
2. **Cache Invalidation**: Single update needs to clear multiple caches
   - Product update → Invalidate web cache + Mobile cache + CDN cache

3. **Real-time Notifications**: Broadcast updates to multiple clients
   - Stock price changes → Update all connected dashboards

4. **Logging & Monitoring**: Same log entry goes to multiple destinations
   - Application logs → File storage + ElasticSearch + Monitoring dashboard

5. **Data Replication**: Synchronize data across multiple systems
   - Order placed → Update inventory + Notify warehouse + Update reports

## **System Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTION PUBLISHER                              │
│  (Publishes user actions: login, purchase, profile_update)      │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Publishes to
                 ▼
        ┌────────────────┐
        │     FANOUT     │
        │    EXCHANGE    │ ──────── Ignores Routing Key
        │  "user.actions"│
        └────────┬───────┘
                 │
         ┌───────┴───────────────┬──────────────┬───────────────┐
         │                       │              │               │
         │ Broadcast             │              │               │
         │ to ALL                │              │               │
         │ Queues                │              │               │
         ▼                       ▼              ▼               ▼
┌─────────────────┐    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│  ANALYTICS      │    │ NOTIFICATION│  │    AUDIT     │  │    CACHE     │
│     QUEUE       │    │    QUEUE    │  │    QUEUE     │  │ INVALIDATION │
│                 │    │             │  │              │  │    QUEUE     │
└────────┬────────┘    └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
         │                    │                 │                 │
         ▼                    ▼                 ▼                 ▼
┌─────────────────┐    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│   Analytics     │    │Notification │  │    Audit     │  │    Cache     │
│   Consumer      │    │  Consumer   │  │   Consumer   │  │  Invalidator │
│                 │    │             │  │              │  │              │
│ • Track events  │    │ • Email     │  │ • Store logs │  │ • Clear user │
│ • Count actions │    │ • SMS       │  │ • Compliance │  │   cache      │
│ • Generate      │    │ • Push      │  │ • Audit trail│  │ • Clear      │
│   metrics       │    │   notif     │  │              │  │   session    │
└─────────────────┘    └─────────────┘  └──────────────┘  └──────────────┘

Message Flow:
1. User performs action (e.g., "purchase")
2. Publisher sends ONE message to fanout exchange
3. Exchange COPIES message to ALL bound queues
4. Each consumer processes the SAME message independently
5. Failure in one consumer doesn't affect others
```

## **How It Works**

### Message Flow Step-by-Step

1. **Publisher Sends Message**:
   ```javascript
   channel.publish('user.actions', '', Buffer.from(JSON.stringify({
     action: 'purchase',
     userId: '12345',
     productId: 'XYZ',
     amount: 99.99
   })));
   ```

2. **Exchange Receives Message**:
   - Fanout exchange receives the message
   - **Ignores** the routing key (empty string '')
   - Looks up **all queues** bound to it

3. **Message Broadcasting**:
   - Exchange creates **copies** of the message
   - Sends one copy to **each bound queue**
   - All queues receive identical messages **simultaneously**

4. **Independent Processing**:
   - Each consumer processes its copy
   - Failures are **isolated** (one consumer failing doesn't affect others)
   - Each consumer can **acknowledge independently**



## **Implementation**

### Project Structure

```
lab4-fanout-exchange/
├── package.json
├── config.js                    # RabbitMQ connection config
├── setup-exchange.js            # Create exchange and bindings
├── action-publisher.js          # Publishes user actions
├── consumers/
│   ├── analytics-consumer.js    # Tracks analytics
│   ├── notification-consumer.js # Sends notifications
│   ├── audit-consumer.js        # Logs audit trail
│   └── cache-invalidator.js     # Invalidates cache
└── test-system.js              # Test the complete flow
```



### 1. **package.json**

```json
{
  "name": "lab5-fanout-exchange",
  "version": "1.0.0",
  "description": "RabbitMQ Fanout Exchange - User Action Broadcasting",
  "main": "action-publisher.js",
  "scripts": {
    "setup": "node setup-exchange.js",
    "publisher": "node action-publisher.js",
    "analytics": "node consumers/analytics-consumer.js",
    "notification": "node consumers/notification-consumer.js",
    "audit": "node consumers/audit-consumer.js",
    "cache": "node consumers/cache-invalidator.js",
    "test": "node test-system.js"
  },
  "dependencies": {
    "amqplib": "^0.10.3"
  }
}
```



### 2. **config.js**

```javascript
module.exports = {
  rabbitmq: {
    url: 'amqp://localhost',
    exchange: {
      name: 'user.actions',
      type: 'fanout',
      options: {
        durable: true  // Exchange survives broker restart
      }
    },
    queues: {
      analytics: 'analytics.queue',
      notification: 'notification.queue',
      audit: 'audit.queue',
      cache: 'cache.invalidation.queue'
    }
  }
};
```



### 3. **setup-exchange.js**

This script creates the fanout exchange and binds all queues to it.

```javascript
const amqp = require('amqplib');
const config = require('./config');

async function setupExchange() {
  let connection;
  
  try {
    // Connect to RabbitMQ
    connection = await amqp.connect(config.rabbitmq.url);
    const channel = await connection.createChannel();
    
    console.log('🔧 Setting up Fanout Exchange...\n');
    
    // 1. Create Fanout Exchange
    await channel.assertExchange(
      config.rabbitmq.exchange.name,
      config.rabbitmq.exchange.type,
      config.rabbitmq.exchange.options
    );
    console.log(` Exchange created: ${config.rabbitmq.exchange.name} (fanout)`);
    
    // 2. Create and Bind Queues
    const queues = Object.values(config.rabbitmq.queues);
    
    for (const queue of queues) {
      // Create queue
      await channel.assertQueue(queue, { durable: true });
      console.log(` Queue created: ${queue}`);
      
      // Bind queue to fanout exchange
      // Note: Routing key is ignored in fanout, but we pass empty string
      await channel.bindQueue(
        queue,
        config.rabbitmq.exchange.name,
        '' // Routing key ignored in fanout
      );
      console.log(` Queue bound: ${queue} -> ${config.rabbitmq.exchange.name}`);
    }
    
    console.log('\n✨ Setup complete! All queues bound to fanout exchange.');
    console.log('📢 Any message published to this exchange will broadcast to ALL queues.\n');
    
    await channel.close();
    await connection.close();
    
  } catch (error) {
    console.error('❌ Setup error:', error.message);
    process.exit(1);
  }
}

setupExchange();
```



### 4. **action-publisher.js**

Publishes user actions to the fanout exchange.

```javascript
const amqp = require('amqplib');
const config = require('./config');

class ActionPublisher {
  constructor() {
    this.connection = null;
    this.channel = null;
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    // Ensure exchange exists
    await this.channel.assertExchange(
      config.rabbitmq.exchange.name,
      config.rabbitmq.exchange.type,
      config.rabbitmq.exchange.options
    );
    
    console.log('📡 Publisher connected to RabbitMQ');
  }
  
  async publishAction(action, userId, data = {}) {
    const message = {
      action,
      userId,
      timestamp: new Date().toISOString(),
      data
    };
    
    // Publish to fanout exchange
    // Routing key is ignored, but we pass empty string
    this.channel.publish(
      config.rabbitmq.exchange.name,
      '', // Routing key (ignored in fanout)
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true, // Message survives broker restart
        contentType: 'application/json'
      }
    );
    
    console.log(`📤 Published: ${action} for user ${userId}`);
    return message;
  }
  
  async close() {
    await this.channel.close();
    await this.connection.close();
  }
}

// Example usage
async function main() {
  const publisher = new ActionPublisher();
  
  try {
    await publisher.connect();
    
    // Simulate different user actions
    console.log('\n🚀 Publishing user actions...\n');
    
    // Action 1: User Login
    await publisher.publishAction('login', 'user123', {
      ipAddress: '192.168.1.1',
      device: 'Chrome Browser'
    });
    
    await sleep(1000);
    
    // Action 2: Purchase
    await publisher.publishAction('purchase', 'user456', {
      productId: 'PROD-789',
      amount: 99.99,
      currency: 'USD'
    });
    
    await sleep(1000);
    
    // Action 3: Profile Update
    await publisher.publishAction('profile_update', 'user123', {
      field: 'email',
      oldValue: 'old@example.com',
      newValue: 'new@example.com'
    });
    
    console.log('\n All actions published!\n');
    
    // Keep process alive for a moment
    await sleep(2000);
    await publisher.close();
    
  } catch (error) {
    console.error('❌ Publisher error:', error.message);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = ActionPublisher;
```



### 5. **consumers/analytics-consumer.js**

Tracks and analyzes user actions.

```javascript
const amqp = require('amqplib');
const config = require('../config');

class AnalyticsConsumer {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.stats = {
      login: 0,
      purchase: 0,
      profile_update: 0,
      total: 0
    };
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    // Ensure queue exists
    await this.channel.assertQueue(config.rabbitmq.queues.analytics, {
      durable: true
    });
    
    console.log(' Analytics Consumer connected');
  }
  
  async consume() {
    console.log(' Waiting for user actions to analyze...\n');
    
    this.channel.consume(
      config.rabbitmq.queues.analytics,
      (msg) => {
        if (msg !== null) {
          const action = JSON.parse(msg.content.toString());
          this.processAction(action);
          
          // Acknowledge message
          this.channel.ack(msg);
        }
      },
      { noAck: false }
    );
  }
  
  processAction(action) {
    console.log(` [ANALYTICS] Processing: ${action.action}`);
    
    // Update statistics
    if (this.stats.hasOwnProperty(action.action)) {
      this.stats[action.action]++;
    }
    this.stats.total++;
    
    // Simulate analytics processing
    console.log(`   User: ${action.userId}`);
    console.log(`   Time: ${action.timestamp}`);
    console.log(`   Data:`, action.data);
    
    // Show current stats
    console.log(`   📈 Current Stats:`, this.stats);
    console.log('');
  }
}

// Start consumer
async function main() {
  const consumer = new AnalyticsConsumer();
  
  try {
    await consumer.connect();
    await consumer.consume();
  } catch (error) {
    console.error('❌ Analytics consumer error:', error.message);
    process.exit(1);
  }
}

main();
```



### 6. **consumers/notification-consumer.js**

Sends notifications (email, SMS, push).

```javascript
const amqp = require('amqplib');
const config = require('../config');

class NotificationConsumer {
  constructor() {
    this.connection = null;
    this.channel = null;
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    await this.channel.assertQueue(config.rabbitmq.queues.notification, {
      durable: true
    });
    
    console.log('📧 Notification Consumer connected');
  }
  
  async consume() {
    console.log('📧 Waiting for actions to send notifications...\n');
    
    this.channel.consume(
      config.rabbitmq.queues.notification,
      (msg) => {
        if (msg !== null) {
          const action = JSON.parse(msg.content.toString());
          this.sendNotifications(action);
          this.channel.ack(msg);
        }
      },
      { noAck: false }
    );
  }
  
  sendNotifications(action) {
    console.log(`📧 [NOTIFICATION] Processing: ${action.action}`);
    
    // Determine notification type based on action
    switch (action.action) {
      case 'login':
        this.sendLoginAlert(action);
        break;
      case 'purchase':
        this.sendPurchaseConfirmation(action);
        break;
      case 'profile_update':
        this.sendProfileChangeNotification(action);
        break;
      default:
        console.log(`   ℹ️  No notification configured for: ${action.action}`);
    }
    console.log('');
  }
  
  sendLoginAlert(action) {
    console.log(`   📧 Sending login alert email to user ${action.userId}`);
    console.log(`   📱 Sending push notification: "New login from ${action.data.device}"`);
  }
  
  sendPurchaseConfirmation(action) {
    console.log(`   📧 Sending purchase confirmation email`);
    console.log(`   💰 Order: ${action.data.productId} - $${action.data.amount}`);
    console.log(`   📲 SMS: "Your order has been confirmed!"`);
  }
  
  sendProfileChangeNotification(action) {
    console.log(`   📧 Email: "Your ${action.data.field} has been updated"`);
    console.log(`   🔔 Security alert sent`);
  }
}

async function main() {
  const consumer = new NotificationConsumer();
  
  try {
    await consumer.connect();
    await consumer.consume();
  } catch (error) {
    console.error('❌ Notification consumer error:', error.message);
    process.exit(1);
  }
}

main();
```



### 7. **consumers/audit-consumer.js**

Logs all actions for compliance and audit trails.

```javascript
const amqp = require('amqplib');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

class AuditConsumer {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.logFile = path.join(__dirname, '../audit-log.json');
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    await this.channel.assertQueue(config.rabbitmq.queues.audit, {
      durable: true
    });
    
    console.log('📝 Audit Consumer connected');
  }
  
  async consume() {
    console.log('📝 Waiting for actions to audit log...\n');
    
    this.channel.consume(
      config.rabbitmq.queues.audit,
      async (msg) => {
        if (msg !== null) {
          const action = JSON.parse(msg.content.toString());
          await this.logAction(action);
          this.channel.ack(msg);
        }
      },
      { noAck: false }
    );
  }
  
  async logAction(action) {
    console.log(`📝 [AUDIT] Logging: ${action.action}`);
    
    const auditEntry = {
      logId: this.generateLogId(),
      action: action.action,
      userId: action.userId,
      timestamp: action.timestamp,
      data: action.data,
      compliance: this.getComplianceFlags(action)
    };
    
    // Simulate writing to audit log
    console.log(`   📄 Audit Entry:`, auditEntry);
    console.log(`   💾 Stored to audit database`);
    console.log(`    Compliance: ${auditEntry.compliance.join(', ')}`);
    
    // Actually write to file (optional)
    await this.writeToFile(auditEntry);
    console.log('');
  }
  
  generateLogId() {
    return `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getComplianceFlags(action) {
    const flags = ['LOGGED'];
    
    if (action.action === 'purchase') {
      flags.push('FINANCIAL_RECORD');
    }
    if (action.action === 'profile_update') {
      flags.push('PII_CHANGE', 'GDPR');
    }
    if (action.action === 'login') {
      flags.push('SECURITY_EVENT');
    }
    
    return flags;
  }
  
  async writeToFile(entry) {
    try {
      let logs = [];
      try {
        const data = await fs.readFile(this.logFile, 'utf8');
        logs = JSON.parse(data);
      } catch (err) {
        // File doesn't exist, start fresh
      }
      
      logs.push(entry);
      await fs.writeFile(this.logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('   ⚠️  Failed to write to audit log file:', error.message);
    }
  }
}

async function main() {
  const consumer = new AuditConsumer();
  
  try {
    await consumer.connect();
    await consumer.consume();
  } catch (error) {
    console.error('❌ Audit consumer error:', error.message);
    process.exit(1);
  }
}

main();
```



### 8. **consumers/cache-invalidator.js**

Invalidates caches when user data changes.

```javascript
const amqp = require('amqplib');
const config = require('../config');

class CacheInvalidator {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.cacheStats = {
      invalidated: 0,
      skipped: 0
    };
  }
  
  async connect() {
    this.connection = await amqp.connect(config.rabbitmq.url);
    this.channel = await this.connection.createChannel();
    
    await this.channel.assertQueue(config.rabbitmq.queues.cache, {
      durable: true
    });
    
    console.log('🗑️  Cache Invalidator connected');
  }
  
  async consume() {
    console.log('🗑️  Waiting for actions to invalidate cache...\n');
    
    this.channel.consume(
      config.rabbitmq.queues.cache,
      (msg) => {
        if (msg !== null) {
          const action = JSON.parse(msg.content.toString());
          this.invalidateCache(action);
          this.channel.ack(msg);
        }
      },
      { noAck: false }
    );
  }
  
  invalidateCache(action) {
    console.log(`🗑️  [CACHE] Processing: ${action.action}`);
    
    // Determine what to invalidate based on action
    switch (action.action) {
      case 'profile_update':
        this.invalidateUserCache(action.userId);
        break;
      case 'purchase':
        this.invalidateUserCache(action.userId);
        this.invalidateProductCache(action.data.productId);
        break;
      case 'login':
        // Login doesn't require cache invalidation
        console.log(`   ℹ️  No cache invalidation needed for login`);
        this.cacheStats.skipped++;
        break;
      default:
        console.log(`   ℹ️  No cache invalidation configured`);
        this.cacheStats.skipped++;
    }
    
    console.log(`    Stats: ${this.cacheStats.invalidated} invalidated, ${this.cacheStats.skipped} skipped`);
    console.log('');
  }
  
  invalidateUserCache(userId) {
    console.log(`   🗑️  Invalidating user cache: ${userId}`);
    console.log(`   🔄 Keys cleared: user:${userId}:profile, user:${userId}:preferences`);
    this.cacheStats.invalidated++;
  }
  
  invalidateProductCache(productId) {
    console.log(`   🗑️  Invalidating product cache: ${productId}`);
    console.log(`   🔄 Keys cleared: product:${productId}:details`);
    this.cacheStats.invalidated++;
  }
}

async function main() {
  const consumer = new CacheInvalidator();
  
  try {
    await consumer.connect();
    await consumer.consume();
  } catch (error) {
    console.error('❌ Cache invalidator error:', error.message);
    process.exit(1);
  }
}

main();
```



### 9. **test-system.js**

Automated test script to verify the entire system.

```javascript
const ActionPublisher = require('./action-publisher');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSystem() {
  console.log(' TESTING FANOUT EXCHANGE SYSTEM\n');
  console.log('Make sure all consumers are running in separate terminals:');
  console.log('  Terminal 1: npm run analytics');
  console.log('  Terminal 2: npm run notification');
  console.log('  Terminal 3: npm run audit');
  console.log('  Terminal 4: npm run cache\n');
  console.log('Press Ctrl+C to stop after viewing results.\n');
  console.log('─'.repeat(60));
  
  const publisher = new ActionPublisher();
  
  try {
    await publisher.connect();
    await sleep(2000);
    
    // Test 1: Login Action
    console.log('\n TEST 1: User Login');
    await publisher.publishAction('login', 'alice123', {
      ipAddress: '192.168.1.100',
      device: 'iPhone Safari'
    });
    console.log(' Expected: All 4 consumers should process this message');
    await sleep(3000);
    
    // Test 2: Purchase Action
    console.log('\n TEST 2: User Purchase');
    await publisher.publishAction('purchase', 'bob456', {
      productId: 'LAPTOP-001',
      amount: 1299.99,
      currency: 'USD'
    });
    console.log(' Expected: All 4 consumers should process this message');
    await sleep(3000);
    
    // Test 3: Profile Update
    console.log('\n TEST 3: Profile Update');
    await publisher.publishAction('profile_update', 'alice123', {
      field: 'phoneNumber',
      oldValue: '+1-555-0100',
      newValue: '+1-555-0200'
    });
    console.log(' Expected: All 4 consumers should process this message');
    await sleep(3000);
    
    // Test 4: Multiple rapid actions
    console.log('\n TEST 4: Rapid Multiple Actions');
    for (let i = 0; i < 5; i++) {
      await publisher.publishAction('login', `user${i}`, {
        ipAddress: `192.168.1.${i}`,
        device: 'Chrome Browser'
      });
      await sleep(500);
    }
    console.log(' Expected: All consumers process all 5 messages');
    await sleep(3000);
    
    console.log('\n─'.repeat(60));
    console.log('🎉 TEST COMPLETE!\n');
    console.log('Check each consumer terminal to verify:');
    console.log('  1. Analytics: Shows statistics');
    console.log('  2. Notification: Shows notification types');
    console.log('  3. Audit: Shows compliance flags');
    console.log('  4. Cache: Shows invalidation actions\n');
    
    await publisher.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    process.exit(1);
  }
}

testSystem();
```



##  **Testing Guide**

### Step 1: Start RabbitMQ

```bash
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Setup Exchange and Queues

```bash
npm run setup
```

**Expected Output:**
```
🔧 Setting up Fanout Exchange...

 Exchange created: user.actions (fanout)
 Queue created: analytics.queue
 Queue bound: analytics.queue -> user.actions
 Queue created: notification.queue
 Queue bound: notification.queue -> user.actions
 Queue created: audit.queue
 Queue bound: audit.queue -> user.actions
 Queue created: cache.invalidation.queue
 Queue bound: cache.invalidation.queue -> user.actions

✨ Setup complete! All queues bound to fanout exchange.
📢 Any message published to this exchange will broadcast to ALL queues.
```

### Step 4: Start All Consumers (Separate Terminals)

**Terminal 1 - Analytics:**
```bash
npm run analytics
```

**Terminal 2 - Notifications:**
```bash
npm run notification
```

**Terminal 3 - Audit:**
```bash
npm run audit
```

**Terminal 4 - Cache:**
```bash
npm run cache
```

### Step 5: Publish Actions

**Terminal 5 - Publisher:**
```bash
npm run publisher
```

**Or run automated tests:**
```bash
npm test
```

## 🎯 **Verification Checklist**

After running the publisher, verify each consumer received the message:

###  Analytics Consumer Should Show:
```
 [ANALYTICS] Processing: purchase
   User: user456
   Time: 2025-11-12T10:30:00.000Z
   Data: { productId: 'PROD-789', amount: 99.99, currency: 'USD' }
   📈 Current Stats: { login: 1, purchase: 1, profile_update: 1, total: 3 }
```

###  Notification Consumer Should Show:
```
📧 [NOTIFICATION] Processing: purchase
   📧 Sending purchase confirmation email
   💰 Order: PROD-789 - $99.99
   📲 SMS: "Your order has been confirmed!"
```

###  Audit Consumer Should Show:
```
📝 [AUDIT] Logging: purchase
   📄 Audit Entry: { logId: 'AUDIT-...', action: 'purchase', ... }
   💾 Stored to audit database
    Compliance: LOGGED, FINANCIAL_RECORD
```

###  Cache Invalidator Should Show:
```
🗑️  [CACHE] Processing: purchase
   🗑️  Invalidating user cache: user456
   🔄 Keys cleared: user:user456:profile, user:user456:preferences
   🗑️  Invalidating product cache: PROD-789
   🔄 Keys cleared: product:PROD-789:details
```

## 🔬 **RabbitMQ Management UI Verification**

1. Open: http://localhost:15672 (guest/guest)
2. Go to **Exchanges** tab
3. Click on **user.actions**
4. You should see **4 bindings** (one for each queue)
5. Go to **Queues** tab
6. All 4 queues should show the same message count