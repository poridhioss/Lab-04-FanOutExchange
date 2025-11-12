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
    
    console.log(`   📊 Stats: ${this.cacheStats.invalidated} invalidated, ${this.cacheStats.skipped} skipped`);
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
